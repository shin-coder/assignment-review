export type StoreErrorCode = "quota-exceeded" | "save-failed" | "load-failed" | "remove-failed";

/** ソース管理層（保存と復元）のエラー。code で種類を判別し、message はそのまま画面に出せる文にする */
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoreError";
    this.code = code;
  }
}

const MESSAGES: Record<StoreErrorCode, string> = {
  "quota-exceeded":
    "ブラウザの保存容量が足りないため、編集とコメントを保存できませんでした。不要なプロジェクトを削除してください。",
  "save-failed": "編集とコメントを保存できませんでした。",
  "load-failed": "保存したプロジェクトを読み込めませんでした。",
  "remove-failed": "保存したプロジェクトを削除できませんでした。",
};

/** IndexedDB の容量超過エラーか。別の realm の DOMException でも判定できるよう name で見る */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "QuotaExceededError"
  );
}

/**
 * 任意のエラーを StoreError に変換する。容量超過は操作によらず "quota-exceeded" にし、
 * それ以外は fallback の code にする。元のエラーは cause に残す
 */
export function toStoreError(
  error: unknown,
  fallback: Exclude<StoreErrorCode, "quota-exceeded">,
): StoreError {
  if (error instanceof StoreError) return error;
  const code = isQuotaExceededError(error) ? "quota-exceeded" : fallback;
  return new StoreError(code, MESSAGES[code], { cause: error });
}
