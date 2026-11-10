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
}
