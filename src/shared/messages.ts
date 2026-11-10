import type { ElementId } from "./element";

// iframe ↔ 親アプリの postMessage。すべて type が "review:" で始まる

/** 親アプリ → iframe */
export type ParentToFrameMessage =
  | { type: "review:highlight"; elementId: ElementId | null }
  | { type: "review:replace-element"; elementId: ElementId; html: string }
  | { type: "review:replace-css"; path: string; text: string };

/** iframe → 親アプリ */
export type FrameToParentMessage =
  | { type: "review:ready" }
  | { type: "review:hover"; elementId: ElementId | null }
  | {
      type: "review:select";
      elementId: ElementId | null;
      /** JS が後から生成した要素（data-review-id がない要素）をクリックしたとき true */
      generated: boolean;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isElementIdOrNull(value: unknown): value is ElementId | null {
  return value === null || typeof value === "string";
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
      return isElementIdOrNull(value.elementId) && typeof value.generated === "boolean";
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
    default:
      return false;
  }
}
