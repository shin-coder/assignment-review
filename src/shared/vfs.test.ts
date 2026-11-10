import { describe, expect, it } from "vitest";
import { isTextFile, normalizePath } from "./vfs";

describe("normalizePath", () => {
  it.each([
    ["index.html", "index.html"],
    ["./a/b.css", "a/b.css"],
    ["a\\b.css", "a/b.css"],
    ["/css/style.css", "css/style.css"],
    ["a//b/./c.js", "a/b/c.js"],
    ["a/b/../c.js", "a/c.js"],
    ["images/", "images"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("ルートより上を指すパスは例外になる", () => {
    expect(() => normalizePath("../secret.txt")).toThrow("ルートより上");
    expect(() => normalizePath("a/../../b")).toThrow("ルートより上");
  });
});

describe("isTextFile", () => {
  it("文字列の内容をテキストと判定する", () => {
    expect(isTextFile({ path: "a.css", mimeType: "text/css", content: "" })).toBe(true);
  });

  it("ArrayBuffer の内容をテキストと判定しない", () => {
    expect(isTextFile({ path: "a.png", mimeType: "image/png", content: new ArrayBuffer(4) })).toBe(
      false,
    );
  });
});
