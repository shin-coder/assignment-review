// CSS のソースから、ブラウザが教えてくれたルール（セレクタと何番目か）の位置を探す。
// 開発モードの「この要素」で、要素に当たっている CSS ルールだけを切り出して編集するのに使う

import type { MatchedCssRule } from "../shared";

/** ソースの中のスタイルルール 1 つ */
export interface CssRuleSource {
  /** ソースに書かれたままのセレクタ */
  selector: string;
  /** セレクタの先頭の位置 */
  start: number;
  /** 閉じ括弧 } の直後の位置 */
  end: number;
}

/** 中身にさらにルールを持つ @ ルール。中を読み進める */
const GROUP_AT_RULES = new Set(["media", "supports", "layer", "container", "document", "scope"]);

/**
 * CSS のテキストからスタイルルールをソースの順に取り出す。
 * コメント・文字列を読み飛ばし、@media などの中にも入る。@font-face・@keyframes などの中身は読まない。
 * 閉じ括弧が足りない壊れた CSS では、最後のルールはテキストの終わりまでとする
 */
export function parseCssRules(text: string): CssRuleSource[] {
  const rules: CssRuleSource[] = [];
  const length = text.length;
  let i = 0;

  /** コメントと文字列を読み飛ばした後の位置を返す。どちらでもなければ i のまま */
  function skipCommentOrString(at: number): number {
    if (text[at] === "/" && text[at + 1] === "*") {
      const close = text.indexOf("*/", at + 2);
      return close < 0 ? length : close + 2;
    }
    const char = text[at];
    if (char === '"' || char === "'") {
      let j = at + 1;
      while (j < length && text[j] !== char && text[j] !== "\n") {
        j += text[j] === "\\" ? 2 : 1;
      }
      return Math.min(length, j + 1);
    }
    return at;
  }

  /** 対応する } の直後の位置（at は { の位置） */
  function skipBlock(at: number): number {
    let depth = 0;
    let j = at;
    while (j < length) {
      const skipped = skipCommentOrString(j);
      if (skipped !== j) {
        j = skipped;
        continue;
      }
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    return length;
  }

  /** 1 つの階層（ファイル全体か @media などの中）を読む。閉じ括弧 } の位置か終わりで止まる */
  function readLevel(): void {
    while (i < length) {
      const skipped = skipCommentOrString(i);
      if (skipped !== i) {
        i = skipped;
        continue;
      }
      const char = text[i]!;
      if (/\s/.test(char) || char === ";") {
        i++;
        continue;
      }
      if (char === "}") return;

      // 前置き（セレクタや @ ルールの条件）を { か ; まで読む
      const start = i;
      let j = i;
      while (j < length && text[j] !== "{" && text[j] !== ";" && text[j] !== "}") {
        const next = skipCommentOrString(j);
        j = next !== j ? next : j + 1;
      }
      const prelude = text.slice(start, j);
      if (j >= length || text[j] !== "{") {
        // ; で終わる文（@import など）か、閉じ括弧の前の書きかけ
        i = text[j] === ";" ? j + 1 : j;
        continue;
      }

      if (prelude.startsWith("@")) {
        const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? "";
        if (GROUP_AT_RULES.has(name)) {
          i = j + 1;
          readLevel();
          if (text[i] === "}") i++;
        } else {
          i = skipBlock(j);
        }
        continue;
      }

      const end = skipBlock(j);
      rules.push({ selector: prelude.trim(), start, end });
      i = end;
    }
  }

  while (i < length) {
    readLevel();
    // ファイルの一番外で余分な } があったら読み飛ばして続ける
    if (text[i] === "}") i++;
  }
  return rules;
}

/**
 * セレクタを比べやすい形に揃える。ブラウザはセレクタを整えて返す
 * （空白・コメントの削除、属性値の引用符、:before → ::before など）ため、ソースのほうも同じように揃える
 */
export function normalizeSelector(selector: string): string {
  return selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/["']/g, "")
    .replace(/::?(before|after|first-line|first-letter)\b/gi, "::$1")
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,()[\]=])\s*/g, "$1")
    .replace(/\*(?=[.#:[])/g, "")
    .trim()
    .toLowerCase();
}

/**
 * ブラウザが教えてくれたルールの、ソース上の範囲を探す。
 * 同じセレクタのルールが複数あれば、occurrence 番目のもの。見つからなければ null
 */
export function locateCssRule(text: string, rule: MatchedCssRule): CssRuleSource | null {
  const target = normalizeSelector(rule.selector);
  const candidates = parseCssRules(text).filter(
    (candidate) => normalizeSelector(candidate.selector) === target,
  );
  return candidates[rule.occurrence] ?? null;
}
