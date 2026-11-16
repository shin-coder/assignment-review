import type { ElementInfo, ElementSourceMap } from "../shared";

/**
 * ソース上の位置（offset）を含む要素のうち、もっとも内側の要素を返す。
 * エディタのカーソル位置 → レイヤーツリーの選択に使う。
 *
 * - 範囲は start 以上 end 未満（要素の終わりの直後は含まない）
 * - 位置のない要素（暗黙に作られた要素）は対象外。どの要素にも入らなければ null
 * - 範囲が同じ長さなら、文書順で後ろ（より深い）要素を返す
 */
export function findElementAt(
  map: ElementSourceMap,
  filePath: string,
  offset: number,
): ElementInfo | null {
  let best: ElementInfo | null = null;
  let bestLength = Infinity;
  for (const info of map.values()) {
    const location = info.location;
    if (!location || info.filePath !== filePath) continue;
    if (offset < location.start || offset >= location.end) continue;
    const length = location.end - location.start;
    if (length <= bestLength) {
      best = info;
      bestLength = length;
    }
  }
  return best;
}
