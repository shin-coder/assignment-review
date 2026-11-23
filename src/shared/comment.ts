import type { SourceLocation } from "./location";

/** コメント。DOM ノードではなくソース上の位置に紐付ける */
export interface ReviewComment {
  id: string;
  location: SourceLocation;
  body: string;
  /** Date.now() の値 */
  createdAt: number;
  /** 対応する箇所が編集で消えたら "orphaned" */
  status: "active" | "orphaned";
  /**
   * ピンを立てる位置（コメントを付けたときにクリックした場所）。要素に対する割合で持つので、
   * プレビューの幅を変えて要素の大きさが変わっても、要素の中の同じあたりに立つ。
   * 位置の分からないコメント・古いデータにはないので省略できる（要素の左上に立てる）
   */
  pin?: PinPoint;
}

/** 要素の中の位置。左上が (0, 0)、右下が (1, 1) */
export interface PinPoint {
  x: number;
  y: number;
}

/** 0〜1 に収める（範囲外や数でない値が保存されていても、要素の外にピンを出さない） */
export function clampPinPoint(point: PinPoint): PinPoint {
  const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
  return { x: clamp(point.x), y: clamp(point.y) };
}
