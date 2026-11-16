import { html, parse, type DefaultTreeAdapterTypes } from "parse5";
import type { ElementInfo, SourceLocation } from "../shared";
import { EditError } from "./errors";
import { assertRange, replaceMinimal, type EditResult } from "./textChange";

/** 開始タグがソースに書かれていることを確かめた要素の範囲 */
export interface ResolvedElement {
  location: SourceLocation;
  startTag: SourceLocation;
}

/** 中身を持たない HTML の要素（空要素） */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "basefont",
  "bgsound",
  "br",
  "col",
  "embed",
  "frame",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isTagNameEnd(char: string | undefined): boolean {
  return char === undefined || char === "/" || char === ">" || /\s/.test(char);
}

function mismatch(info: ElementInfo, detail: string): EditError {
  return new EditError(
    "source-mismatch",
    `<${info.tagName}> の位置情報がソースと一致しません（${detail}）。解析し直してから編集してください`,
  );
}

/**
 * ElementInfo を検証し、location と startTag を返す。
 * 暗黙に作られた要素（location / startTag が null）は EditError("implicit-element") を投げる
 */
export function resolveElement(source: string, info: ElementInfo): ResolvedElement {
  const { location, startTag } = info;
  if (location === null || startTag === null) {
    throw new EditError(
      "implicit-element",
      `<${info.tagName}> はソースに開始タグがない要素（ブラウザが暗黙に作った要素）なので編集できません`,
    );
  }
  assertRange(source, location.start, location.end);
  assertRange(source, startTag.start, startTag.end);
  if (startTag.start !== location.start || startTag.end > location.end) {
    throw mismatch(info, "開始タグが要素の範囲の外にある");
  }

  const text = source.slice(startTag.start, startTag.end);
  const name = text.slice(1, 1 + info.tagName.length);
  if (
    !text.startsWith("<") ||
    name.toLowerCase() !== info.tagName.toLowerCase() ||
    !isTagNameEnd(text[1 + info.tagName.length]) ||
    !text.endsWith(">")
  ) {
    throw mismatch(info, `開始タグの位置に "${text.slice(0, 20)}" がある`);
  }
  return { location, startTag };
}

/** 要素全体（outerHTML 相当）を置き換える */
export function replaceElement(
  source: string,
  info: ElementInfo,
  newOuterHtml: string,
): EditResult {
  const { location } = resolveElement(source, info);
  return replaceMinimal(source, location.filePath, location.start, location.end, newOuterHtml);
}

type Parse5Node = DefaultTreeAdapterTypes.Node;
type Parse5Element = DefaultTreeAdapterTypes.Element;

/** 開始タグが startOffset から始まる要素を探す。暗黙の要素や template の中身も辿る */
function findElementByStart(root: Parse5Node, startOffset: number): Parse5Element | null {
  const stack: Parse5Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if ("tagName" in node && node.sourceCodeLocation?.startTag?.startOffset === startOffset) {
      return node;
    }
    if ("childNodes" in node) stack.push(...node.childNodes);
    if ("content" in node) stack.push(node.content);
  }
  return null;
}

/**
 * 要素の中身の終わり（終了タグの開始位置）を求める。
 * ElementInfo は終了タグの位置を持たず、閉じタグ漏れの要素では location.end が中身の終わりになるため、
 * 解析層と同じ parse5 でソースを解析し直して、終了タグがソースに書かれているかを調べる
 */
function findInnerEnd(source: string, info: ElementInfo, element: ResolvedElement): number {
  const node = findElementByStart(
    parse(source, { sourceCodeLocationInfo: true }),
    element.startTag.start,
  );
  const nodeLocation = node?.sourceCodeLocation;
  if (
    !node ||
    !nodeLocation?.startTag ||
    nodeLocation.startTag.endOffset !== element.startTag.end
  ) {
    throw mismatch(info, "開始タグの位置に要素が見つからない");
  }

  const isHtml = node.namespaceURI === html.NS.HTML;
  if (isHtml && VOID_ELEMENTS.has(node.tagName)) {
    throw new EditError("no-inner-content", `<${info.tagName}> は中身を持てない要素です`);
  }
  if (nodeLocation.endTag) return nodeLocation.endTag.startOffset;
  // SVG などの <circle /> は自己終了タグで閉じており、中身を持たない
  if (!isHtml && source.slice(element.startTag.start, element.startTag.end).endsWith("/>")) {
    throw new EditError("no-inner-content", `<${info.tagName}> は自己終了タグで閉じた要素です`);
  }
  // 閉じタグ漏れ: 暗黙に閉じた位置（location.end）までが中身
  return element.location.end;
}

/**
 * 要素の中身（innerHTML 相当）だけを置き換える。開始タグと終了タグはそのまま残す。
 * 終了タグがない要素（閉じタグ漏れ）は、開始タグの後ろから要素の終わりまでを中身とする
 */
export function replaceElementInner(
  source: string,
  info: ElementInfo,
  newInnerHtml: string,
): EditResult {
  const element = resolveElement(source, info);
  const innerStart = element.startTag.end;
  const innerEnd = findInnerEnd(source, info, element);
  if (innerEnd < innerStart || innerEnd > element.location.end) {
    throw mismatch(info, "終了タグが要素の範囲の外にある");
  }
  return replaceMinimal(source, element.location.filePath, innerStart, innerEnd, newInnerHtml);
}
