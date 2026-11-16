// Service Worker の fetch 処理のうち、ブラウザの API に依存しない部分。
// src/sw/sw.ts（WebWorker の型）と単体テスト（DOM の型）の両方から使うため、
// Response / Headers / URL など両方の型にある API だけを使う
import { normalizePath, PREVIEW_PREFIX, type VirtualFile } from "../../shared";

/** fetch 処理が読むファイルの取り出し口 */
export interface PreviewFileReader {
  getFile(sessionId: string, path: string): Promise<VirtualFile | undefined>;
}

/** プレビュー用の URL を分解した結果 */
export interface PreviewTarget {
  sessionId: string;
  /**
   * URL デコード・正規化したパス。ディレクトリ（末尾 `/`）を指す場合は空文字か
   * `"sub"` のようにファイル名を含まない形になり、directory が true になる
   */
  path: string;
  /** URL の末尾が `/`（またはセッション直下）でディレクトリを指している */
  directory: boolean;
  /** `/__preview__/<sessionId>` のように、セッションの後ろの `/` がない */
  missingSessionSlash: boolean;
}

/** 解析できなかった URL。不正なエンコードやルートより上を指すパス */
export interface InvalidPreviewTarget {
  invalid: true;
  reason: string;
}

/** ディレクトリを指すパスに補うファイル名 */
export const INDEX_FILE = "index.html";

/** `Cache-Control: no-store` を付けるファイル（編集が即座に反映されるように） */
const NO_STORE_MIME_TYPES = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
]);
const NO_STORE_EXTENSIONS = /\.(?:html?|css|m?js)$/i;

/**
 * URL が `PREVIEW_PREFIX/<sessionId>/<path>` を指していれば分解する。
 * 別オリジン・接頭辞の外の URL は null（Service Worker は手を出さない）。
 * クエリ文字列とハッシュは URL の pathname に含まれないため無視される
 */
export function parsePreviewUrl(
  url: URL,
  origin: string,
): PreviewTarget | InvalidPreviewTarget | null {
  if (url.origin !== origin || !url.pathname.startsWith(PREVIEW_PREFIX)) return null;

  const rest = url.pathname.slice(PREVIEW_PREFIX.length);
  const slash = rest.indexOf("/");
  const rawSessionId = slash === -1 ? rest : rest.slice(0, slash);
  const rawPath = slash === -1 ? "" : rest.slice(slash + 1);

  let sessionId: string;
  let decodedSegments: string[];
  try {
    sessionId = decodeURIComponent(rawSessionId);
    decodedSegments = rawPath.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return { invalid: true, reason: `URL のエンコードが不正です: ${url.pathname}` };
  }
  if (sessionId === "") return { invalid: true, reason: "セッション ID がありません" };

  let path: string;
  try {
    path = normalizePath(decodedSegments.join("/"));
  } catch (error) {
    return { invalid: true, reason: error instanceof Error ? error.message : String(error) };
  }

  return {
    sessionId,
    path,
    directory: rawPath === "" || rawPath.endsWith("/"),
    missingSessionSlash: slash === -1,
  };
}

function joinPath(directory: string, name: string): string {
  return directory === "" ? name : `${directory}/${name}`;
}

/** HTML / CSS / JS か（mimeType か拡張子で判定する） */
export function isNoStoreFile(file: VirtualFile): boolean {
  const mimeType = file.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return NO_STORE_MIME_TYPES.has(mimeType) || NO_STORE_EXTENSIONS.test(file.path);
}

/**
 * 返すときの Content-Type。テキストは JS の文字列を UTF-8 で書き出すため、
 * charset がなければ utf-8 を付ける（生徒の HTML の meta charset が別の値でも文字化けしない）
 */
export function contentTypeOf(file: VirtualFile): string {
  if (typeof file.content === "string" && !/;\s*charset=/i.test(file.mimeType)) {
    return `${file.mimeType}; charset=utf-8`;
  }
  return file.mimeType;
}

/** 仮想ファイルをそのまま返す Response を作る。HEAD では本文を付けない */
export function createFileResponse(file: VirtualFile, method = "GET"): Response {
  const headers = new Headers({ "Content-Type": contentTypeOf(file) });
  if (isNoStoreFile(file)) headers.set("Cache-Control", "no-store");
  return new Response(method === "HEAD" ? null : file.content, { status: 200, headers });
}

function textResponse(status: number, body: string, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status, headers });
}

function redirectResponse(location: string): Response {
  // Response.redirect() は絶対 URL が必要で、ヘッダーも足せないため自前で作る
  return new Response(null, {
    status: 301,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/** fetch の対象になるリクエストのうち、ここで使う部分 */
export interface PreviewRequestLike {
  url: string;
  method: string;
}

/**
 * プレビュー用のリクエストに Response を返す。対象外のリクエストは null（respondWith しない）。
 * - ディレクトリ（末尾 `/`）は index.html を返す
 * - `sub` が見つからず `sub/index.html` があれば `sub/` へリダイレクトする（相対パスを正しく解決させるため）
 * - 該当ファイルがなければ 404、ファイルを読み出せなければ 500
 */
export function handlePreviewFetch(
  request: PreviewRequestLike,
  origin: string,
  reader: PreviewFileReader,
): Promise<Response> | null {
  const url = new URL(request.url);
  const target = parsePreviewUrl(url, origin);
  if (target === null) return null;
  return respond(url, target, request.method, reader).catch((error: unknown) =>
    textResponse(
      500,
      `ファイルを読み出せませんでした: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}

async function respond(
  url: URL,
  target: PreviewTarget | InvalidPreviewTarget,
  method: string,
  reader: PreviewFileReader,
): Promise<Response> {
  if ("invalid" in target) return textResponse(400, target.reason);
  if (method !== "GET" && method !== "HEAD") {
    return textResponse(405, `プレビューでは ${method} を扱えません`, { Allow: "GET, HEAD" });
  }

  if (target.missingSessionSlash) {
    return redirectResponse(`${url.origin}${url.pathname}/${url.search}`);
  }

  const { sessionId, path } = target;
  if (target.directory) {
    const index = await reader.getFile(sessionId, joinPath(path, INDEX_FILE));
    if (index) return createFileResponse(index, method);
    return textResponse(404, `ファイルが見つかりません: ${joinPath(path, INDEX_FILE)}`);
  }

  const file = await reader.getFile(sessionId, path);
  if (file) return createFileResponse(file, method);

  if (await reader.getFile(sessionId, joinPath(path, INDEX_FILE))) {
    return redirectResponse(`${url.origin}${url.pathname}/${url.search}`);
  }
  return textResponse(404, `ファイルが見つかりません: ${path}`);
}
