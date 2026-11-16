// テスト専用の補助関数。src/edit や src/parser の実装は使わず、同等のデータを手で作る

import type { ElementInfo, ElementSourceMap, SourceLocation, TextChange } from "../shared";

/** source の start〜end を text に置き換え、新しいソースと TextChange を返す */
export function editText(
  filePath: string,
  source: string,
  start: number,
  end: number,
  text: string,
): { source: string; change: TextChange } {
  return {
    source: source.slice(0, start) + text + source.slice(end),
    change: { filePath, start, end, insertedLength: text.length },
  };
}

/** source の中で snippet が最初に現れる範囲（fromIndex 以降） */
export function locate(
  filePath: string,
  source: string,
  snippet: string,
  fromIndex = 0,
): SourceLocation {
  const start = source.indexOf(snippet, fromIndex);
  if (start < 0) throw new Error(`見つかりません: ${snippet}`);
  return { filePath, start, end: start + snippet.length };
}

/**
 * 04 の解析結果に相当する対応表を手で作る。
 * outers は要素全体のテキストを文書順に並べたもの（ID は 04 と同じく文書順の連番）。
 * null を渡すと、補正で暗黙に作られた要素（location が null）として登録する。
 */
export function buildMap(
  filePath: string,
  source: string,
  elements: readonly { tagName: string; outer: string | null }[],
): ElementSourceMap {
  const map: ElementSourceMap = new Map();
  let cursor = 0;
  elements.forEach(({ tagName, outer }, index) => {
    const id = String(index);
    let location: SourceLocation | null = null;
    if (outer !== null) {
      location = locate(filePath, source, outer, cursor);
      cursor = location.start + 1;
    }
    const info: ElementInfo = {
      id,
      tagName,
      filePath,
      location,
      startTag: null,
      parentId: null,
      childIds: [],
    };
    map.set(id, info);
  });
  return map;
}

/** 決定的な疑似乱数（線形合同法）。0 以上 max 未満の整数を返す関数を作る */
export function createRandom(seed: number): (max: number) => number {
  let state = seed >>> 0;
  return (max) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % max;
  };
}
