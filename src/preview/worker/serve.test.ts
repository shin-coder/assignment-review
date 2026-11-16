import { describe, expect, it, vi } from "vitest";
import { PREVIEW_PREFIX, previewUrl, type VirtualFile } from "../../shared";
import {
  contentTypeOf,
  createFileResponse,
  handlePreviewFetch,
  isNoStoreFile,
  parsePreviewUrl,
  type PreviewFileReader,
} from "./serve";

const ORIGIN = "http://localhost:5173";

function readerOf(files: VirtualFile[], sessionId = "s1"): PreviewFileReader {
  return {
    getFile: vi.fn(async (session: string, path: string) =>
      session === sessionId ? files.find((file) => file.path === path) : undefined,
    ),
  };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
const siteFiles: VirtualFile[] = [
  { path: "index.html", mimeType: "text/html", content: "<h1>トップ</h1>" },
  { path: "css/style.css", mimeType: "text/css", content: "h1{color:red}" },
  { path: "js/main.js", mimeType: "text/javascript", content: "console.log(1)" },
  { path: "images/top 1.png", mimeType: "image/png", content: png },
  { path: "画像/写真.png", mimeType: "image/png", content: png },
  { path: "about/index.html", mimeType: "text/html", content: "<h1>about</h1>" },
];

async function fetchPreview(url: string, method = "GET", files = siteFiles) {
  const response = handlePreviewFetch({ url, method }, ORIGIN, readerOf(files));
  if (response === null) throw new Error("対象外と判定された");
  return response;
}

const at = (path: string) => `${ORIGIN}${PREVIEW_PREFIX}s1/${path}`;

describe("parsePreviewUrl", () => {
  it("セッション ID とパスに分解する", () => {
    expect(parsePreviewUrl(new URL(at("css/style.css")), ORIGIN)).toEqual({
      sessionId: "s1",
      path: "css/style.css",
      directory: false,
      missingSessionSlash: false,
    });
  });

  it("previewUrl() で作った URL を元のセッション ID とパスに戻す", () => {
    const url = new URL(previewUrl("a b/c", "画像/top 1.png"), ORIGIN);
    expect(parsePreviewUrl(url, ORIGIN)).toMatchObject({
      sessionId: "a b/c",
      path: "画像/top 1.png",
    });
  });

  it("クエリ文字列とハッシュを無視する", () => {
    expect(parsePreviewUrl(new URL(`${at("css/style.css")}?v=2#top`), ORIGIN)).toMatchObject({
      path: "css/style.css",
    });
  });

  it("末尾が / ならディレクトリとして扱う", () => {
    expect(parsePreviewUrl(new URL(at("")), ORIGIN)).toMatchObject({ path: "", directory: true });
    expect(parsePreviewUrl(new URL(at("about/")), ORIGIN)).toMatchObject({
      path: "about",
      directory: true,
    });
  });

  it("デコードしてから normalizePath() で正規化する", () => {
    expect(parsePreviewUrl(new URL(at("css/.%2Fstyle.css")), ORIGIN)).toMatchObject({
      path: "css/style.css",
    });
  });

  it("接頭辞の外・別オリジンの URL は null（手を出さない）", () => {
    expect(parsePreviewUrl(new URL(`${ORIGIN}/src/main.tsx`), ORIGIN)).toBeNull();
    expect(parsePreviewUrl(new URL(`${ORIGIN}/__preview__`), ORIGIN)).toBeNull();
    expect(parsePreviewUrl(new URL(`https://example.com${PREVIEW_PREFIX}s1/a`), ORIGIN)).toBeNull();
  });

  it("不正なエンコードやルートより上を指すパスは invalid", () => {
    expect(parsePreviewUrl(new URL(at("%E0%A4%A")), ORIGIN)).toMatchObject({ invalid: true });
    // URL の解析で %2E%2E/ は解決されてしまうため、%2F でつないだものをデコード後に弾く
    expect(parsePreviewUrl(new URL(at("%2E%2E%2Fsecret")), ORIGIN)).toMatchObject({
      invalid: true,
    });
    expect(parsePreviewUrl(new URL(`${ORIGIN}${PREVIEW_PREFIX}/a.css`), ORIGIN)).toMatchObject({
      invalid: true,
    });
  });
});

describe("handlePreviewFetch", () => {
  it("PREVIEW_PREFIX 以外のリクエストには null を返す", () => {
    const reader = readerOf(siteFiles);
    expect(handlePreviewFetch({ url: `${ORIGIN}/index.html`, method: "GET" }, ORIGIN, reader)).toBe(
      null,
    );
    expect(reader.getFile).not.toHaveBeenCalled();
  });

  it("テキストのファイルを mimeType 付きで返す", async () => {
    const response = await fetchPreview(at("css/style.css"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(await response.text()).toBe("h1{color:red}");
  });

  it("バイナリのファイルをそのまま返す", async () => {
    const response = await fetchPreview(at("images/top%201.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(png));
  });

  it("日本語のパスをデコードして解決する", async () => {
    const response = await fetchPreview(new URL(previewUrl("s1", "画像/写真.png"), ORIGIN).href);
    expect(response.status).toBe(200);
  });

  it("セッション直下とディレクトリ（末尾 /）は index.html を返す", async () => {
    const root = await fetchPreview(at(""));
    expect(await root.text()).toBe("<h1>トップ</h1>");
    const about = await fetchPreview(at("about/?q=1"));
    expect(await about.text()).toBe("<h1>about</h1>");
  });

  it("クエリ文字列とハッシュを付けても同じファイルを返す", async () => {
    const response = await fetchPreview(`${at("js/main.js")}?v=123#x`);
    expect(await response.text()).toBe("console.log(1)");
  });

  it("末尾の / がないディレクトリは / 付きの URL へリダイレクトする", async () => {
    const response = await fetchPreview(`${at("about")}?q=1`);
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${at("about/")}?q=1`);

    const session = await fetchPreview(`${ORIGIN}${PREVIEW_PREFIX}s1`);
    expect(session.status).toBe(301);
    expect(session.headers.get("Location")).toBe(at(""));
  });

  it("該当ファイルがなければ 404 を返す", async () => {
    expect((await fetchPreview(at("missing.css"))).status).toBe(404);
    expect((await fetchPreview(at("css/"))).status).toBe(404);
    // 別のセッションのファイルは見えない
    const other = handlePreviewFetch(
      { url: `${ORIGIN}${PREVIEW_PREFIX}s2/index.html`, method: "GET" },
      ORIGIN,
      readerOf(siteFiles),
    );
    expect((await other)?.status).toBe(404);
  });

  it("不正なパスは 400 を返す", async () => {
    expect((await fetchPreview(at("a/%2E%2E%2F%2E%2E%2Fsecret"))).status).toBe(400);
    expect((await fetchPreview(at("%E0%A4%A"))).status).toBe(400);
  });

  it("GET / HEAD 以外は 405 を返し、HEAD には本文を付けない", async () => {
    expect((await fetchPreview(at("index.html"), "POST")).status).toBe(405);
    const head = await fetchPreview(at("index.html"), "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await head.text()).toBe("");
  });

  it("ファイルの読み出しに失敗したら 500 を返す", async () => {
    const reader: PreviewFileReader = { getFile: () => Promise.reject(new Error("壊れた")) };
    const response = await handlePreviewFetch(
      { url: at("index.html"), method: "GET" },
      ORIGIN,
      reader,
    );
    expect(response?.status).toBe(500);
  });
});

describe("ヘッダー", () => {
  it.each([
    ["index.html", "text/html", "no-store"],
    ["css/style.css", "text/css", "no-store"],
    ["js/main.js", "text/javascript", "no-store"],
    ["images/top 1.png", "image/png", null],
  ])("%s の Cache-Control は %s", async (path, _mime, expected) => {
    const response = await fetchPreview(new URL(previewUrl("s1", path), ORIGIN).href);
    expect(response.headers.get("Cache-Control")).toBe(expected);
  });

  it("拡張子か mimeType のどちらかで HTML / CSS / JS と判定する", () => {
    expect(
      isNoStoreFile({ path: "a.mjs", mimeType: "application/octet-stream", content: "" }),
    ).toBe(true);
    expect(isNoStoreFile({ path: "noext", mimeType: "text/javascript", content: "" })).toBe(true);
    expect(isNoStoreFile({ path: "a.json", mimeType: "application/json", content: "" })).toBe(
      false,
    );
  });

  it("テキストには charset=utf-8 を補い、指定済みなら変えない", () => {
    expect(contentTypeOf({ path: "a.svg", mimeType: "image/svg+xml", content: "<svg/>" })).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(
      contentTypeOf({ path: "a.txt", mimeType: "text/plain; charset=shift_jis", content: "" }),
    ).toBe("text/plain; charset=shift_jis");
  });

  it("同じファイルから何度でも Response を作れる", async () => {
    const file: VirtualFile = { path: "a.png", mimeType: "image/png", content: png };
    const first = await createFileResponse(file).arrayBuffer();
    const second = await createFileResponse(file).arrayBuffer();
    expect(first.byteLength).toBe(4);
    expect(second.byteLength).toBe(4);
    expect(png.byteLength).toBe(4);
  });
});
