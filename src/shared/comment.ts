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
   * ピンを立てる位置。要素の左上からのずれ（iframe 内の CSS px）。
   * クリックした位置や、ピンをドラッグして動かした位置。古いデータにはないので省略できる
   */
  pin?: PinOffset;
}

/** 要素の左上からのずれ（iframe 内の CSS px） */
export interface PinOffset {
  x: number;
  y: number;
}
