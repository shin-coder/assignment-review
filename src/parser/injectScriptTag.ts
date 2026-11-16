import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { escapeAttributeValue } from "./injectReviewIds";

type Parse5Element = DefaultTreeAdapterTypes.Element;

/**
 * 注入スクリプトを読み込む `<script type="module" src="...">` を HTML に挿入する。
 * scriptUrl は呼び出し側が injectScriptUrl() で求めて渡す。
 *
 * 挿入位置（ソースのテキストに挿入するだけで、再シリアライズはしない）:
 * 1. `<head>` の開始タグがあれば、その直後
 * 2. なければ `<html>` の開始タグの直後（ブラウザが暗黙の head を作り、その中に入る）
 * 3. どちらもなければ、文書の先頭にある DOCTYPE やコメントの直後
 *    （DOCTYPE より前に入れると互換モードになるため）
 */
export function injectScriptTag(html: string, scriptUrl: string): string {
  const offset = insertionOffset(html);
  const tag = `<script type="module" src="${escapeAttributeValue(scriptUrl)}"></script>`;
  return html.slice(0, offset) + tag + html.slice(offset);
}

function insertionOffset(html: string): number {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const htmlIndex = document.childNodes.findIndex(
    (node) => "tagName" in node && node.tagName === "html",
  );
  const htmlElement = document.childNodes[htmlIndex] as Parse5Element | undefined;
  const head = htmlElement?.childNodes.find(
    (node): node is Parse5Element => "tagName" in node && node.tagName === "head",
  );

  const headTag = head?.sourceCodeLocation?.startTag;
  if (headTag) return headTag.endOffset;
  const htmlTag = htmlElement?.sourceCodeLocation?.startTag;
  if (htmlTag) return htmlTag.endOffset;

  // html 要素より前にある DOCTYPE・コメントの末尾
  let offset = 0;
  for (const node of document.childNodes.slice(0, htmlIndex === -1 ? undefined : htmlIndex)) {
    const end = node.sourceCodeLocation?.endOffset;
    if (end !== undefined && end > offset) offset = end;
  }
  return offset;
}
