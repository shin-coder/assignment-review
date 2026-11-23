import type { PinOffset } from "./comment";
import type { ElementId } from "./element";

// iframe ↔ 親アプリの postMessage。すべて type が "review:" で始まる

/**
 * iframe 内の操作モード。
 * - "inspect": ホバーで枠を出し、クリックを止めて要素を選ぶ（コメント・開発モード）
 * - "browse": 生徒のサイトをそのまま操作できる（リンク・JS のクリックも動く）。枠は出さない
 */
export type FrameMode = "inspect" | "browse";

/** iframe のビューポート上の要素の矩形（getBoundingClientRect の値） */
export interface TrackedRect {
  elementId: ElementId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** iframe から親へ転送するキー（入力欄の外で、修飾キーなしで押されたものだけ） */
export const FORWARDED_KEYS = ["v", "c", "d", "Escape"] as const;
export type ForwardedKey = (typeof FORWARDED_KEYS)[number];

/** 親アプリ → iframe */
export type ParentToFrameMessage =
  | { type: "review:highlight"; elementId: ElementId | null }
  | { type: "review:replace-element"; elementId: ElementId; html: string }
  | { type: "review:replace-css"; path: string; text: string }
  /** labels が false なら、枠に要素名（h1 など）のラベルを出さない（コメントモード）。省略時は出す */
  | { type: "review:mode"; mode: FrameMode; labels?: boolean }
  /** 矩形を知らせてほしい要素（コメントのピン・コメント入力欄の位置合わせに使う） */
  | { type: "review:track"; elementIds: ElementId[] };

/** iframe → 親アプリ */
export type FrameToParentMessage =
  | { type: "review:ready" }
  | { type: "review:hover"; elementId: ElementId | null }
  | {
      type: "review:select";
      elementId: ElementId | null;
      /** JS が後から生成した要素（data-review-id がない要素）をクリックしたとき true */
      generated: boolean;
      /** クリックした位置。選ばれた要素の左上からのずれ（CSS px）。分からなければ省略 */
      point?: PinOffset;
    }
  /** review:track で頼まれた要素の矩形。見つからない・大きさのない要素は含めない */
  | { type: "review:rects"; rects: TrackedRect[] }
  | { type: "review:key"; key: ForwardedKey };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isElementIdOrNull(value: unknown): value is ElementId | null {
  return value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTrackedRect(value: unknown): value is TrackedRect {
  return (
    isRecord(value) &&
    typeof value.elementId === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isPinOffset(value: unknown): value is PinOffset {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isForwardedKey(value: unknown): value is ForwardedKey {
  return (FORWARDED_KEYS as readonly unknown[]).includes(value);
}

/** 親アプリが iframe から受け取ったメッセージを検証する */
export function isFrameMessage(value: unknown): value is FrameToParentMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "review:ready":
      return true;
    case "review:hover":
      return isElementIdOrNull(value.elementId);
    case "review:select":
      return (
        isElementIdOrNull(value.elementId) &&
        typeof value.generated === "boolean" &&
        (value.point === undefined || isPinOffset(value.point))
      );
    case "review:rects":
      return Array.isArray(value.rects) && value.rects.every(isTrackedRect);
    case "review:key":
      return isForwardedKey(value.key);
    default:
      return false;
  }
}

/** iframe 内の操作スクリプトが親アプリから受け取ったメッセージを検証する */
export function isParentMessage(value: unknown): value is ParentToFrameMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "review:highlight":
      return isElementIdOrNull(value.elementId);
    case "review:replace-element":
      return typeof value.elementId === "string" && typeof value.html === "string";
    case "review:replace-css":
      return typeof value.path === "string" && typeof value.text === "string";
    case "review:mode":
      return (
        (value.mode === "inspect" || value.mode === "browse") &&
        (value.labels === undefined || typeof value.labels === "boolean")
      );
    case "review:track":
      return (
        Array.isArray(value.elementIds) &&
        value.elementIds.every((id: unknown) => typeof id === "string")
      );
    default:
      return false;
  }
}
