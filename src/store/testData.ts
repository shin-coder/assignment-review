// テスト用のデータ作成。本体のコードからは使わない
import type { ReviewComment, VirtualFile, VirtualFileSystem } from "../shared";

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngBuffer(): ArrayBuffer {
  return PNG_BYTES.slice().buffer;
}

export function createFiles(): VirtualFileSystem {
  const files: VirtualFile[] = [
    { path: "index.html", mimeType: "text/html", content: "<h1>トップ</h1>" },
    { path: "css/style.css", mimeType: "text/css", content: "h1 { color: red; }" },
    { path: "js/main.js", mimeType: "text/javascript", content: "console.log(1);" },
    { path: "images/hero.png", mimeType: "image/png", content: pngBuffer() },
  ];
  return new Map(files.map((file) => [file.path, file]));
}

export function createComment(id: string, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id,
    location: { filePath: "index.html", start: 0, end: 4 },
    body: `コメント ${id}`,
    createdAt: 1000,
    status: "active",
    ...overrides,
  };
}
