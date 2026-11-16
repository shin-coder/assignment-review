import type { ReviewComment, SourceLocation, TextChange } from "../shared";
import { shiftLocation } from "./shiftLocation";

/**
 * 変更 1 回分をコメントの位置に当てる。
 * - active のコメントが失効したら、位置を「元の要素があった場所」＝置き換え後の文字列の範囲
 *   [change.start, change.start + insertedLength) にする（削除なら空の範囲）
 * - 失効済みのコメントも、一覧で場所を示せるよう同じ規則で位置だけ追従させる。active には戻さない
 */
function applyChange(comment: ReviewComment, change: TextChange): ReviewComment {
  const shifted = shiftLocation(comment.location, change);
  if (shifted === comment.location) return comment;

  const location: SourceLocation = shifted ?? {
    filePath: change.filePath,
    start: change.start,
    end: change.start + change.insertedLength,
  };
  const status = shifted === null ? "orphaned" : comment.status;
  return { ...comment, location, status };
}

/**
 * 複数のコメントに複数の変更を順に適用する。
 * changes は編集が行われた順に並べ、各変更の位置は「1 つ前の変更まで適用した後のソース」上の値で表す
 * （src/edit の関数が返す TextChange をそのまま順に並べたもの）。
 *
 * 入力は変更せず新しい配列を返す。位置も状態も変わらなかったコメントは同じオブジェクトのまま返す。
 */
export function applyChangesToComments(
  comments: readonly ReviewComment[],
  changes: readonly TextChange[],
): ReviewComment[] {
  return comments.map((comment) => changes.reduce(applyChange, comment));
}
