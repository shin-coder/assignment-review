import { parse } from "parse5";
import { describe, expect, it } from "vitest";
import { injectScriptTag } from "./injectScriptTag";
import { elementsInOrder } from "./testHelpers";

const URL = "/src/inject/inject.ts";
const TAG = `<script type="module" src="${URL}"></script>`;

/** 挿入後の HTML で、注入した script が head の中にあり、標準モードのままであることを確かめる */
function expectScriptInHead(html: string) {
  const elements = elementsInOrder(html);
  const scripts = elements.filter((element) =>
    element.attrs.some((attr) => attr.name === "src" && attr.value === URL),
  );
  expect(scripts).toHaveLength(1);
  const script = scripts[0]!;
  expect(script.attrs).toContainEqual({ name: "type", value: "module" });
  expect(script.parentNode && "tagName" in script.parentNode && script.parentNode.tagName).toBe(
    "head",
  );
}

describe("injectScriptTag", () => {
  it("<head> の開始タグの直後に挿入する", () => {
    const html = '<!DOCTYPE html><html><head lang="ja"><title>t</title></head><body></body></html>';
    const result = injectScriptTag(html, URL);
    expect(result).toBe(
      `<!DOCTYPE html><html><head lang="ja">${TAG}<title>t</title></head><body></body></html>`,
    );
    expectScriptInHead(result);
  });

  it("<head> がなければ <html> の開始タグの直後に挿入する", () => {
    const html = "<!DOCTYPE html><html lang=ja><body><p>x</p></body></html>";
    const result = injectScriptTag(html, URL);
    expect(result).toBe(`<!DOCTYPE html><html lang=ja>${TAG}<body><p>x</p></body></html>`);
    expectScriptInHead(result);
  });

  it("<html> も <head> もなければ DOCTYPE の直後に挿入し、標準モードを保つ", () => {
    const html = '<!DOCTYPE html>\n<meta charset="UTF-8">\n<p>x';
    const result = injectScriptTag(html, URL);
    expect(result).toBe(`<!DOCTYPE html>${TAG}\n<meta charset="UTF-8">\n<p>x`);
    expectScriptInHead(result);
    expect(parse(result).mode).toBe("no-quirks");
  });

  it("文書の先頭のコメントの後ろに挿入する", () => {
    const html = "<!-- a --><!DOCTYPE html><!-- b --><p>x";
    expect(injectScriptTag(html, URL)).toBe(`<!-- a --><!DOCTYPE html><!-- b -->${TAG}<p>x`);
  });

  it("DOCTYPE もなければ先頭に挿入する", () => {
    const result = injectScriptTag("<p>x", URL);
    expect(result).toBe(`${TAG}<p>x`);
    expectScriptInHead(result);
  });

  it("空の HTML でも挿入できる", () => {
    expect(injectScriptTag("", URL)).toBe(TAG);
  });

  it('URL の & と " をエスケープする', () => {
    expect(injectScriptTag("", '/a.js?x=1&y="2"')).toBe(
      '<script type="module" src="/a.js?x=1&amp;y=&quot;2&quot;"></script>',
    );
  });
});
