import type { ElementId } from "./element";

// iframe ↔ 親アプリの postMessage。すべて type が "review:" で始まる

/**
 * iframe 内の操作モード。
 * - "inspect": ホバー・クリックで枠と要素名を出し、クリックを止めて要素を選ぶ（Dev mode）
 * - "browse": 生徒のサイトをそのまま操作できる（リンク・JS のクリックも動く）。枠は出さない（View mode）
 */
export type FrameMode = "inspect" | "browse";

const FRAME_MODES: readonly unknown[] = ["inspect", "browse"];

/**
 * 選んだ要素に当たっている CSS ルール（iframe の CSSOM で調べたもの）。
 * 親は path のファイルのソースから、selector が同じ occurrence 番目のルールを探して表示する
 */
export interface MatchedCssRule {
  /** CSS ファイルのパス（正規化済み） */
  path: string;
  /** ブラウザが整えたセレクタ（例: ".card > p"） */
  selector: string;
  /** 囲んでいる @media / @supports。なければ null */
  media: string | null;
  /** 同じファイル・同じセレクタのルールの中で何番目か（0 始まり、ソースの順） */
  occurrence: number;
  /** ブラウザが整えたルール全体。ソースの中で見つからないときに表示する */
  cssText: string;
}

/** iframe から親へ転送するキー（入力欄の外で、修飾キーなしで押されたものだけ） */
export const FORWARDED_KEYS = ["v", "d", "Escape"] as const;
export type ForwardedKey = (typeof FORWARDED_KEYS)[number];

/** 親アプリ → iframe */
export type ParentToFrameMessage =
  | { type: "review:highlight"; elementId: ElementId | null }
  | { type: "review:replace-element"; elementId: ElementId; html: string }
  | { type: "review:replace-css"; path: string; text: string }
  | { type: "review:mode"; mode: FrameMode };

/** iframe → 親アプリ */
export type FrameToParentMessage =
  | { type: "review:ready" }
  | { type: "review:hover"; elementId: ElementId | null }
  | {
      type: "review:select";
      elementId: ElementId | null;
      /** JS が後から生成した要素（data-review-id がない要素）をクリックしたとき true */
      generated: boolean;
      /** 選ばれた要素に当たっている CSS ルール（ソースの順）。調べられなければ省略 */
      rules?: MatchedCssRule[];
    }
  | { type: "review:key"; key: ForwardedKey };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isElementIdOrNull(value: unknown): value is ElementId | null {
  return value === null || typeof value === "string";
}

function isMatchedCssRule(value: unknown): value is MatchedCssRule {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.selector === "string" &&
    (value.media === null || typeof value.media === "string") &&
    typeof value.occurrence === "number" &&
    Number.isInteger(value.occurrence) &&
    value.occurrence >= 0 &&
    typeof value.cssText === "string"
  );
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
        (value.rules === undefined ||
          (Array.isArray(value.rules) && value.rules.every(isMatchedCssRule)))
      );
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
      return FRAME_MODES.includes(value.mode);
    default:
      return false;
  }
}
