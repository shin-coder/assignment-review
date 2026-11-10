import type { SourceLocation } from "./location";

export type ElementId = string;

/** プレビュー用 HTML の各要素に付ける属性名。JS が後から生成した要素には付かない */
export const REVIEW_ID_ATTR = "data-review-id";

export interface ElementInfo {
  id: ElementId;
  /** 小文字のタグ名 */
  tagName: string;
  filePath: string;
  /**
   * 要素全体の範囲。parse5 が補正で暗黙に作った要素（開始タグがソースにない
   * html / head / body / tbody など）は null。null の要素は編集・コメントの対象外
   */
  location: SourceLocation | null;
  /** 開始タグの範囲。暗黙に作られた要素は null */
  startTag: SourceLocation | null;
  parentId: ElementId | null;
  childIds: ElementId[];
}

/** 要素 ID → 要素情報。「画面の要素 ↔ ソース位置」の対応表 */
export type ElementSourceMap = Map<ElementId, ElementInfo>;

/** レイヤーツリー表示用のノード */
export interface LayerNode {
  id: ElementId;
  /** "div#main.card" のような表示名 */
  label: string;
  children: LayerNode[];
}
