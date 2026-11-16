export type PreviewErrorCode =
  /** Service Worker が使えない（Chrome 以外、または localhost / HTTPS 以外で開いている） */
  | "unsupported"
  /** このページが Service Worker の制御下にない */
  | "no-controller"
  /** Service Worker から決められた時間内に応答がない */
  | "timeout"
  /** Service Worker が処理に失敗した（sw:ack の ok が false） */
  | "worker-error";

/** プレビュー層のエラー。message はそのまま画面に出せる日本語 */
export class PreviewError extends Error {
  readonly code: PreviewErrorCode;

  constructor(code: PreviewErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PreviewError";
    this.code = code;
  }
}
