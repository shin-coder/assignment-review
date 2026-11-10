export type LoaderErrorCode = "unsupported-browser" | "too-many-files" | "too-large";

/** 読み込み層のエラー。code で種類を判別し、message はそのまま画面に出せる文にする */
export class LoaderError extends Error {
  readonly code: LoaderErrorCode;

  constructor(code: LoaderErrorCode, message: string) {
    super(message);
    this.name = "LoaderError";
    this.code = code;
  }
}
