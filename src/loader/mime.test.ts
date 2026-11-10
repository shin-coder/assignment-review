import { describe, expect, it } from "vitest";
import { getExtension, getMimeType, isTextPath, UNKNOWN_MIME_TYPE } from "./mime";

describe("getExtension", () => {
  it.each([
    ["index.html", "html"],
    ["css/style.min.css", "css"],
    ["images/HERO.PNG", "png"],
    ["README", ""],
    [".htaccess", ""],
    ["dir.name/file", ""],
  ])("%s → %s", (path, expected) => {
    expect(getExtension(path)).toBe(expected);
  });
});

describe("getMimeType", () => {
  it("拡張子から MIME タイプを決める（大文字でもよい）", () => {
    expect(getMimeType("index.html")).toBe("text/html");
    expect(getMimeType("js/app.mjs")).toBe("text/javascript");
    expect(getMimeType("images/hero.PNG")).toBe("image/png");
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
  });

  it("不明な拡張子と拡張子なしは application/octet-stream", () => {
    expect(getMimeType("data.xyz")).toBe(UNKNOWN_MIME_TYPE);
    expect(getMimeType("LICENSE")).toBe(UNKNOWN_MIME_TYPE);
    expect(UNKNOWN_MIME_TYPE).toBe("application/octet-stream");
  });
});

describe("isTextPath", () => {
  it.each(["a.html", "a.htm", "a.css", "a.js", "a.mjs", "a.json", "a.svg", "a.txt", "A.HTML"])(
    "%s はテキスト",
    (path) => {
      expect(isTextPath(path)).toBe(true);
    },
  );

  it.each(["a.png", "a.woff2", "a.pdf", "LICENSE"])("%s はテキストではない", (path) => {
    expect(isTextPath(path)).toBe(false);
  });
});
