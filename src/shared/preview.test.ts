import { describe, expect, it } from "vitest";
import { injectScriptUrl, PREVIEW_PREFIX, previewUrl, serviceWorkerScriptUrl } from "./preview";

describe("previewUrl", () => {
  it("接頭辞・セッション ID・パスをつなげる", () => {
    expect(previewUrl("abc", "css/style.css")).toBe(`${PREVIEW_PREFIX}abc/css/style.css`);
  });

  it("各区切りを URL エンコードし、/ は残す", () => {
    expect(previewUrl("a b", "画像/top 1.png")).toBe(
      `${PREVIEW_PREFIX}a%20b/${encodeURIComponent("画像")}/top%201.png`,
    );
  });
});

describe("スクリプトの URL", () => {
  it("開発時は TS のソース、ビルド後はルートの JS を指す", () => {
    expect(serviceWorkerScriptUrl(true)).toBe("/src/sw/sw.ts");
    expect(serviceWorkerScriptUrl(false)).toBe("/sw.js");
    expect(injectScriptUrl(true)).toBe("/src/inject/inject.ts");
    expect(injectScriptUrl(false)).toBe("/inject.js");
  });
});
