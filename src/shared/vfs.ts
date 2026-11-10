/** 仮想ファイル 1 件。テキストは文字列、画像などのバイナリは ArrayBuffer で持つ */
export interface VirtualFile {
  /** normalizePath() で正規化したパス（例: "css/style.css"） */
  path: string;
  mimeType: string;
  content: string | ArrayBuffer;
}

/** パス → 仮想ファイル。キーは正規化済みのパス */
export type VirtualFileSystem = Map<string, VirtualFile>;

export function isTextFile(file: VirtualFile): file is VirtualFile & { content: string } {
  return typeof file.content === "string";
}

/**
 * パスを「ルート相対・`/` 区切り・先頭の `/` なし」に揃える。
 * `.` と空の区切りは取り除き、`..` は 1 つ上に戻る。ルートより上を指す場合は例外を投げる。
 */
export function normalizePath(input: string): string {
  const segments: string[] = [];
  for (const segment of input.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(`ルートより上を指すパスです: ${input}`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
