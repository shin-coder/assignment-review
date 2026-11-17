// iframe から届く要素の矩形（スクロールのたびに変わる）の置き場。
// 画面全体の状態に入れるとスクロールのたびに全体が描き直されるため、ピンの層だけが購読する
import type { ElementId, TrackedRect } from "../../shared";

export type RectMap = ReadonlyMap<ElementId, TrackedRect>;

export interface RectStore {
  set(rects: readonly TrackedRect[]): void;
  subscribe(listener: () => void): () => void;
  get(): RectMap;
}

export function createRectStore(): RectStore {
  let current: RectMap = new Map();
  const listeners = new Set<() => void>();
  return {
    set(rects) {
      current = new Map(rects.map((rect) => [rect.elementId, rect]));
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => current,
  };
}
