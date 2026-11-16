import type { SourceLocation, TextChange } from "../shared";

/**
 * 編集 1 回分の変化（change）によるコメント範囲のずれを計算する。
 * change の位置は「変更前のソース」上の値で、location も同じソース上の範囲として扱う。
 *
 * コメントの開始位置（要素の開始タグの `<`）を錨とし、錨が残る限り追従する。
 * 戻り値が null のときは、対応する要素が消えた（失効 = orphaned）ことを表す。
 *
 * コメント範囲を [start, end)、変更範囲を [change.start, change.end)、
 * 差分を delta = insertedLength - (change.end - change.start) とすると、次の順に判定する。
 * 1. 別ファイルの変更 → そのまま
 * 2. 後ろ（change.start >= end。終了位置ちょうどへの挿入を含む） → そのまま
 * 3. 前（change.end <= start。開始位置ちょうどへの挿入を含む） → 開始・終了とも delta だけずらす
 * 以降は 1 文字以上重なる場合
 * 4. 開始位置より前から始まり、錨を飲み込む（change.start < start < change.end。
 *    開始側の一部重なりと、範囲を完全に含む変更） → 失効
 * 5. 開始位置以降から始まる（start <= change.start < end） → 開始位置は保ち、終了位置を次のようにする
 *    - 内側（change.end <= end）: end + delta（範囲を伸縮する）
 *    - 終了位置を越える（終了側の一部重なり）: change.start + insertedLength（挿入した文字列の終わりまで）
 *    その結果、範囲が空になったら（範囲の文字がすべて消えたら）失効
 *    例: 範囲全体を空文字に置き換える → 失効。範囲全体を別の文字列に置き換える → 置き換え後の文字列を指す
 *
 * 2〜5 は「開始位置は右寄せ（挿入されたら後ろへずれる）、終了位置は左寄せ（挿入されても動かない）の
 * 目印」として位置ごとに決まるため、互いに重ならない複数の変更は、どの順に当てても同じ結果になる。
 *
 * 変更がなかった場合は、受け取った location をそのまま（同じオブジェクトで）返す。
 * 範囲が空のとき（失効したコメントの位置など）にその位置ちょうどへ挿入された場合は、2 により動かない。
 */
export function shiftLocation(location: SourceLocation, change: TextChange): SourceLocation | null {
  if (change.filePath !== location.filePath) return location;

  const { start, end } = location;
  const delta = change.insertedLength - (change.end - change.start);

  if (change.start >= end) return location;
  if (change.end <= start) {
    return delta === 0 ? location : { ...location, start: start + delta, end: end + delta };
  }

  if (change.start < start) return null;

  const newEnd = change.end <= end ? end + delta : change.start + change.insertedLength;
  if (newEnd <= start) return null;
  return newEnd === end ? location : { ...location, end: newEnd };
}
