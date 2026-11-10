/** 文字列として読み込む拡張子。それ以外は ArrayBuffer で読む */
const TEXT_EXTENSIONS = new Set(["html", "htm", "css", "js", "mjs", "json", "svg", "txt"]);

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

export const UNKNOWN_MIME_TYPE = "application/octet-stream";

/** 小文字の拡張子（ドットなし）。拡張子がなければ空文字 */
export function getExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function getMimeType(path: string): string {
  return MIME_TYPES[getExtension(path)] ?? UNKNOWN_MIME_TYPE;
}

export function isTextPath(path: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(path));
}
