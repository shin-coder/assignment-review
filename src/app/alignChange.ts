// 編集の差分（TextChange）をタグの境界に寄せる。
//
// src/edit の replaceFile は「共通の先頭・末尾を除いた最小の差分」を返すため、
// 要素の前に別の要素を挿入すると差分が開始タグの途中（`<p>` の直後など）になり、
// コメント（開始位置を錨にする）が新しく挿入した要素を指してしまう（06 のメモ参照）。
// 挿入・削除だけの差分は、同じ結果になる別の位置へずらせるので、
// 「ずらした範囲が `<` で始まり、直後も `<`（または末尾）」になる位置があればそこへ寄せる
import { isNoopChange } from "../edit";
import type { TextChange } from "../shared";

/**
 * oldText → newText の最小差分 change を、タグの境界に寄せた同じ意味の差分にして返す。
 * 挿入・削除以外（置換）や、寄せられる位置がない場合はそのまま返す
 */
export function alignChangeToTagBoundary(
  oldText: string,
  newText: string,
  change: TextChange,
): TextChange {
  if (isNoopChange(change)) return change;
  const isInsertion = change.start === change.end;
  const isDeletion = change.insertedLength === 0;
  if (!isInsertion && !isDeletion) return change;

  // 挿入は新しいテキスト上、削除は古いテキスト上の「変わった範囲」をずらす
  const text = isInsertion ? newText : oldText;
  let start = change.start;
  let end = isInsertion ? change.start + change.insertedLength : change.end;

  // 左端まで寄せ、そこから右へ 1 文字ずつずらしながら候補を調べる
  while (start > 0 && text[start - 1] === text[end - 1]) {
    start--;
    end--;
  }
  for (;;) {
    if (text[start] === "<" && (end === text.length || text[end] === "<")) {
      return isInsertion
        ? { filePath: change.filePath, start, end: start, insertedLength: end - start }
        : { filePath: change.filePath, start, end, insertedLength: 0 };
    }
    if (end >= text.length || text[start] !== text[end]) return change;
    start++;
    end++;
  }
}
