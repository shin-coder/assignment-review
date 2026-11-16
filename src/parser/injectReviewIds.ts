import { REVIEW_ID_ATTR, type ElementSourceMap } from "../shared";

/**
 * 対応表の各要素の開始タグに `data-review-id="<ID>"` を挿入したプレビュー用 HTML を返す。
 *
 * - parse5 で再シリアライズせず、元のソースのテキストに属性を挿入するだけにする（生徒の書き方を保つ）
 * - 挿入位置はタグ名の直後（`<div class="a">` → `<div data-review-id="3" class="a">`）。
 *   同じ名前の属性が重複したときは先に書いたほうが有効になるため、生徒のソースに同名の属性があっても上書きできる
 * - 開始タグがソースにない要素（startTag が null）には付けない
 *
 * map は source を analyzeHtml() で解析した結果であること。位置が合わない場合は例外を投げる
 */
export function injectReviewIds(source: string, map: ElementSourceMap): string {
  const insertions: { offset: number; text: string }[] = [];
  for (const info of map.values()) {
    if (!info.startTag) continue;
    insertions.push({
      offset: tagNameEnd(source, info.startTag.start),
      text: ` ${REVIEW_ID_ATTR}="${escapeAttributeValue(info.id)}"`,
    });
  }
  insertions.sort((a, b) => a.offset - b.offset);

  let result = "";
  let cursor = 0;
  for (const { offset, text } of insertions) {
    result += source.slice(cursor, offset) + text;
    cursor = offset;
  }
  return result + source.slice(cursor);
}

/** 開始タグ `<name ...>` のタグ名の直後の位置を返す。タグ名は空白・`/`・`>` の手前まで（HTML のトークン化の規則） */
function tagNameEnd(source: string, tagStart: number): number {
  if (source[tagStart] !== "<" || !/[A-Za-z]/.test(source[tagStart + 1] ?? "")) {
    throw new Error(`開始タグの位置がソースと一致しません（位置 ${tagStart}）`);
  }
  let offset = tagStart + 2;
  while (offset < source.length && !/[\t\n\f\r />]/.test(source[offset]!)) offset++;
  return offset;
}

/** 属性値（ダブルクォートで囲む）として安全な文字列にする */
export function escapeAttributeValue(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
