import type { ReviewComment } from "../../shared";

/**
 * コメントを「ファイルパス → ソース上の開始位置」の順に並べた新しい配列を返す。
 * 位置が同じものは作成日時、さらに ID の順にして、並びが毎回同じになるようにする。
 * 元の配列は変更しない
 */
export function sortComments(comments: readonly ReviewComment[]): ReviewComment[] {
  return [...comments].sort(compareComments);
}

function compareComments(a: ReviewComment, b: ReviewComment): number {
  return (
    compareText(a.location.filePath, b.location.filePath) ||
    a.location.start - b.location.start ||
    a.createdAt - b.createdAt ||
    compareText(a.id, b.id)
  );
}

// localeCompare は実行環境の言語設定で結果が変わるため、コードポイント順で比べる
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
