import type { ElementInfo } from "../shared";
import { resolveElement } from "./element";
import { EditError } from "./errors";
import { replaceMinimal, type EditResult } from "./textChange";

// 位置はすべて開始タグのテキスト（"<" から ">" まで）の中でのオフセット

interface AttributeValue {
  /** 値の範囲。クォートは含まない */
  start: number;
  end: number;
  quote: '"' | "'" | "";
}

interface ParsedAttribute {
  /** 小文字にした属性名 */
  name: string;
  /** 属性名の直前にある空白の開始位置。空白がなければ start と同じ */
  leadStart: number;
  /** 属性名の開始位置 */
  start: number;
  nameEnd: number;
  /** 属性の終わり（値の閉じクォートの後ろ） */
  end: number;
  /** 値のない属性（disabled など）は null */
  value: AttributeValue | null;
}

interface ParsedStartTag {
  /** タグ名の終わり */
  nameEnd: number;
  attributes: ParsedAttribute[];
}

/** HTML の仕様でいう空白（ASCII whitespace） */
function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
}

/** 開始タグを HTML の仕様（トークナイザの属性の状態）と同じ規則で属性に分ける */
function parseStartTag(text: string): ParsedStartTag {
  const length = text.length;
  let i = 1;
  while (i < length && !isSpace(text[i]) && text[i] !== "/" && text[i] !== ">") i++;
  const nameEnd = i;

  const attributes: ParsedAttribute[] = [];
  for (;;) {
    // 属性の間の空白と "/" を飛ばす
    while (i < length && (isSpace(text[i]) || text[i] === "/")) i++;
    if (i >= length || text[i] === ">") break;

    let leadStart = i;
    while (isSpace(text[leadStart - 1])) leadStart--;

    const start = i;
    // 先頭の 1 文字は "=" でも属性名に含める（HTML の仕様どおり）
    i++;
    while (
      i < length &&
      !isSpace(text[i]) &&
      text[i] !== "/" &&
      text[i] !== ">" &&
      text[i] !== "="
    ) {
      i++;
    }
    const attributeNameEnd = i;

    let j = i;
    while (isSpace(text[j])) j++;
    let value: AttributeValue | null = null;
    let end = attributeNameEnd;
    if (text[j] === "=") {
      let k = j + 1;
      while (isSpace(text[k])) k++;
      const quote = text[k];
      if (quote === '"' || quote === "'") {
        const close = text.indexOf(quote, k + 1);
        if (close === -1) {
          throw new EditError("source-mismatch", "開始タグの属性値のクォートが閉じていません");
        }
        value = { start: k + 1, end: close, quote };
        end = close + 1;
      } else {
        let m = k;
        while (m < length && !isSpace(text[m]) && text[m] !== ">") m++;
        value = { start: k, end: m, quote: "" };
        end = m;
      }
    }
    i = end;

    attributes.push({
      name: text.slice(start, attributeNameEnd).toLowerCase(),
      leadStart,
      start,
      nameEnd: attributeNameEnd,
      end,
      value,
    });
  }
  return { nameEnd, attributes };
}

function assertAttributeName(name: string): void {
  // 空白・クォート・"/" "=" ">" "<" と制御文字を含む名前は、開始タグに書くと別の意味になる
  // eslint-disable-next-line no-control-regex
  if (!/^[^\s"'<>/=\u0000-\u001f\u007f]+$/.test(name)) {
    throw new EditError("invalid-attribute-name", `属性名として使えません: "${name}"`);
  }
}

/** 属性値をクォートの中に書けるようにエスケープする */
function escapeAttributeValue(value: string, quote: '"' | "'"): string {
  const escaped = value.replaceAll("&", "&amp;");
  return quote === '"' ? escaped.replaceAll('"', "&quot;") : escaped.replaceAll("'", "&#39;");
}

/** クォートなしのまま書いても値が変わらないか */
function canBeUnquoted(value: string): boolean {
  return /^[^\s"'=<>`&]+$/.test(value);
}

function splice(text: string, start: number, end: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(end);
}

/**
 * 開始タグの属性を設定する。開始タグの中の該当部分だけを書き換え、他の属性や改行・インデントは保つ。
 * value は DOM の getAttribute() と同じデコード済みの値で、"&" とクォートはエスケープして書く。
 * - 既存の属性: 値だけを書き換える。元のクォートの種類を保ち、クォートなしの値は
 *   クォートなしで書ける値ならそのまま、書けなければ " で囲む。同じ名前が複数あれば最初のもの（ブラウザが使うほう）を書き換える
 * - 新しい属性: 最後の属性の後ろ（属性がなければタグ名の後ろ）に name="value" を足す。
 *   区切りは最後の属性の直前の空白をまねる（属性を 1 行ずつ書いた開始タグでは改行＋インデントになる）
 */
export function setAttribute(
  source: string,
  info: ElementInfo,
  name: string,
  value: string,
): EditResult {
  const { startTag } = resolveElement(source, info);
  assertAttributeName(name);

  const text = source.slice(startTag.start, startTag.end);
  const tag = parseStartTag(text);
  const key = name.toLowerCase();
  const target = tag.attributes.find((attribute) => attribute.name === key);

  let newText: string;
  if (target === undefined) {
    const last = tag.attributes.at(-1);
    const insertAt = last ? last.end : tag.nameEnd;
    const lead = last ? text.slice(last.leadStart, last.start) : "";
    const separator = lead === "" ? " " : lead;
    newText = splice(
      text,
      insertAt,
      insertAt,
      `${separator}${name}="${escapeAttributeValue(value, '"')}"`,
    );
  } else if (target.value === null) {
    // 値のない属性は "" と同じ意味
    newText =
      value === ""
        ? text
        : splice(text, target.nameEnd, target.nameEnd, `="${escapeAttributeValue(value, '"')}"`);
  } else if (target.value.quote !== "") {
    newText = splice(
      text,
      target.value.start,
      target.value.end,
      escapeAttributeValue(value, target.value.quote),
    );
  } else {
    const written = canBeUnquoted(value) ? value : `"${escapeAttributeValue(value, '"')}"`;
    newText = splice(text, target.value.start, target.value.end, written);
  }

  return replaceMinimal(source, startTag.filePath, startTag.start, startTag.end, newText);
}

/**
 * 開始タグから属性を取り除く。属性とその直前の空白だけを消し、他の属性や改行・インデントは保つ。
 * 同じ名前の属性が複数あればすべて消す。属性がなければ何も変えない（isNoopChange が true の change を返す）
 */
export function removeAttribute(source: string, info: ElementInfo, name: string): EditResult {
  const { startTag } = resolveElement(source, info);

  const text = source.slice(startTag.start, startTag.end);
  const key = name.toLowerCase();
  const targets = parseStartTag(text).attributes.filter((attribute) => attribute.name === key);

  let newText = text;
  // 後ろから消すので、前の属性の位置はずれない
  for (const target of targets.reverse()) {
    const next = text[target.end];
    // 直後に空白なしで次の属性が続く場合（x="1"y="2"）は、つながらないよう空白を 1 つ残す
    const keepSpace = next !== undefined && !isSpace(next) && next !== "/" && next !== ">";
    newText = splice(newText, target.leadStart, target.end, keepSpace ? " " : "");
  }

  return replaceMinimal(source, startTag.filePath, startTag.start, startTag.end, newText);
}
