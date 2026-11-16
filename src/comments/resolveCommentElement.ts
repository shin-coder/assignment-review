import type { ElementId, ElementSourceMap, ReviewComment } from "../shared";

/**
 * コメント位置に対応する現在の要素 ID を返す（レイヤーツリーやプレビューで強調表示するため）。
 *
 * 同じファイルで、要素全体の開始位置がコメントの開始位置と一致する要素を探す。
 * 開始タグの `<` は 1 つの要素にしか属さないため、開始位置だけで要素が 1 つに決まる。
 * 終了位置は見ない（閉じタグがない要素は、後ろへの挿入で再解析後の終了位置が変わることがあるため）。
 *
 * 失効したコメント、または見つからない場合は null。
 */
export function resolveCommentElement(
  comment: ReviewComment,
  map: ElementSourceMap,
): ElementId | null {
  if (comment.status === "orphaned") return null;
  const { filePath, start } = comment.location;
  for (const info of map.values()) {
    if (info.location?.filePath === filePath && info.location.start === start) return info.id;
  }
  return null;
}
