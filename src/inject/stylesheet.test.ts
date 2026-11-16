import { afterEach, describe, expect, it } from "vitest";
import { createStylesheetReplacer, rewriteCssUrls, vfsPathFromUrl } from "./stylesheet";

const PREVIEW_PAGE = "http://localhost:5173/__preview__/abc/pages/about.html";

describe("vfsPathFromUrl", () => {
  it.each([
    ["../css/style.css", "css/style.css"],
    ["/__preview__/abc/css/style.css?v=2#x", "css/style.css"],
    ["style.css", "pages/style.css"],
    ["../%E7%94%BB%E5%83%8F/a%20b.css", "画像/a b.css"],
  ])("プレビューのページから %s → %s", (url, expected) => {
    expect(vfsPathFromUrl(url, PREVIEW_PAGE)).toBe(expected);
  });

  it.each([
    ["別オリジン", "https://cdn.example.com/css/style.css"],
    ["別のセッション", "/__preview__/other/css/style.css"],
    ["プレビューの外", "/assets/app.css"],
    ["ルートそのもの", "/__preview__/abc/"],
  ])("%s は null", (_name, url) => {
    expect(vfsPathFromUrl(url, PREVIEW_PAGE)).toBeNull();
  });

  it("プレビューの外のページでは、オリジンの / をルートにする", () => {
    expect(vfsPathFromUrl("css/a.css", "http://localhost:3000/index.html")).toBe("css/a.css");
  });
});

describe("rewriteCssUrls", () => {
  const base = "http://localhost:5173/__preview__/abc/css/style.css";

  it("url() の相対 URL を CSS ファイル基準の絶対 URL にする", () => {
    expect(
      rewriteCssUrls(
        `.a { background: url(../images/bg.png); } .b { background: url( "x.png" ) } .c { src: url('/f.woff') }`,
        base,
      ),
    ).toBe(
      `.a { background: url("http://localhost:5173/__preview__/abc/images/bg.png"); } ` +
        `.b { background: url("http://localhost:5173/__preview__/abc/css/x.png") } ` +
        `.c { src: url("http://localhost:5173/f.woff") }`,
    );
  });

  it("@import の文字列も書き換える", () => {
    expect(rewriteCssUrls(`@import "reset.css";\n@import url(base.css);`, base)).toBe(
      `@import "http://localhost:5173/__preview__/abc/css/reset.css";\n` +
        `@import url("http://localhost:5173/__preview__/abc/css/base.css");`,
    );
  });

  it("data: URL・#id・空の url() はそのまま残す", () => {
    const text = `.a { background: url(data:image/png;base64,AAAA) } .b { filter: url(#blur) } .c { x: url() }`;
    expect(rewriteCssUrls(text, base)).toBe(text);
  });
});

describe("createStylesheetReplacer", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("rel に stylesheet を含む同じパスの <link> をすべて差し替え、URL も書き換える", () => {
    // テストの文書は http://localhost:3000/ にある
    document.head.innerHTML = `
      <link rel="Alternate StyleSheet" href="./css/style.css">
      <link rel="preload" href="css/style.css" as="style">
    `;
    document.body.innerHTML = `<link rel="stylesheet" href="/css/style.css?v=1">`;
    const replacer = createStylesheetReplacer(document);

    const count = replacer.replace("./css/style.css", "p { background: url(bg.png) }");

    expect(count).toBe(2);
    const styles = document.querySelectorAll("style");
    expect(styles).toHaveLength(2);
    for (const style of styles) {
      expect(style.textContent).toBe(`p { background: url("http://localhost:3000/css/bg.png") }`);
    }
    // stylesheet でない <link> はそのまま
    expect(document.querySelector('link[rel="preload"]')).not.toBeNull();
  });

  it("見つからなければ何もせず 0 を返す", () => {
    document.head.innerHTML = `<link rel="stylesheet" href="css/other.css">`;
    const before = document.head.innerHTML;

    expect(createStylesheetReplacer(document).replace("css/style.css", "p{}")).toBe(0);
    expect(createStylesheetReplacer(document).replace("../outside.css", "p{}")).toBe(0);
    expect(document.head.innerHTML).toBe(before);
  });

  it("差し替えた <style> が消えて <link> が戻ったら、もう一度差し替える", () => {
    document.head.innerHTML = `<link rel="stylesheet" href="css/style.css">`;
    const replacer = createStylesheetReplacer(document);
    replacer.replace("css/style.css", "p { color: red }");

    // <head> の差し替えなどで元の <link> に戻った
    document.head.innerHTML = `<link rel="stylesheet" href="css/style.css">`;
    expect(replacer.replace("css/style.css", "p { color: blue }")).toBe(1);

    expect(document.head.querySelector("link")).toBeNull();
    expect(document.head.querySelector("style")?.textContent).toBe("p { color: blue }");
  });
});
