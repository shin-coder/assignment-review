import { LoaderError } from "./errors";

type PickerHost = Pick<Window, "showDirectoryPicker">;

/**
 * フォルダ選択ダイアログを開き、選ばれたフォルダを返す。
 * 読み取り専用（mode: "read"）で開く。ユーザーがキャンセルしたら null を返す。
 * showDirectoryPicker がないブラウザ（Chrome 以外）では LoaderError を投げる
 */
export async function pickDirectory(
  host: PickerHost = window,
): Promise<FileSystemDirectoryHandle | null> {
  if (typeof host.showDirectoryPicker !== "function") {
    throw new LoaderError(
      "unsupported-browser",
      "このブラウザではフォルダを選べません。Chrome で開いてください。",
    );
  }
  try {
    return await host.showDirectoryPicker({ mode: "read" });
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}
