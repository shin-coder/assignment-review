import { describe, expect, it } from "vitest";
import { applySnippet, lineOf, snippetRange } from "./snippet";

const HTML = "<body>\n    <div>\n      <p>a</p>\n    </div>\n  <b>x</b> <i>y</i>\n</body>";

describe("snippetRange", () => {
  it("開始タグの前が字下げだけなら、行頭から切り出す", () => {
    const start = HTML.indexOf("<div>");
    const end = HTML.indexOf("</div>") + 6;
    const range = snippetRange(HTML, { start, end });
    expect(HTML.slice(range.start, range.end)).toBe("    <div>\n      <p>a</p>\n    </div>");
  });

  it("同じ行の前に別の内容があれば、要素の開始位置から切り出す", () => {
    const start = HTML.indexOf("<i>");
    const range = snippetRange(HTML, { start, end: start + 8 });
    expect(HTML.slice(range.start, range.end)).toBe("<i>y</i>");
  });

  it("ファイル先頭の要素も切り出せる", () => {
    expect(snippetRange(HTML, { start: 0, end: 6 })).toEqual({ start: 0, end: 6 });
  });

  it("範囲がテキストの外にはみ出していたら収める", () => {
    expect(snippetRange("abc", { start: 2, end: 10 })).toEqual({ start: 2, end: 3 });
  });
});

describe("applySnippet", () => {
  it("切り出した部分だけを置き換え、範囲の終わりを新しい長さに合わせる", () => {
    const start = HTML.indexOf("    <div>");
    const end = HTML.indexOf("</div>") + 6;
    const code = "    <section>\n      <p>b</p>\n    </section>";
    const result = applySnippet(HTML, { start, end }, code);
    expect(result.text).toBe(HTML.slice(0, start) + code + HTML.slice(end));
    expect(result.range).toEqual({ start, end: start + code.length });
    expect(result.text.slice(result.range.start, result.range.end)).toBe(code);
  });

  it("切り出したままの内容を戻すと、ファイルは変わらない", () => {
    const range = snippetRange(HTML, {
      start: HTML.indexOf("<div>"),
      end: HTML.indexOf("</div>") + 6,
    });
    const code = HTML.slice(range.start, range.end);
    expect(applySnippet(HTML, range, code).text).toBe(HTML);
  });

  it("続けて編集しても、前回の範囲を使えば正しい位置に入る", () => {
    let range = snippetRange(HTML, { start: HTML.indexOf("<b>"), end: HTML.indexOf("</b>") + 4 });
    let text = HTML;
    ({ text, range } = applySnippet(text, range, "  <b>xx</b>"));
    ({ text } = applySnippet(text, range, "  <b>xxx</b>"));
    expect(text).toBe(HTML.replace("<b>x</b>", "<b>xxx</b>"));
  });
});

describe("lineOf", () => {
  it("1 始まりの行番号を返す", () => {
    expect(lineOf(HTML, 0)).toBe(1);
    expect(lineOf(HTML, HTML.indexOf("<p>"))).toBe(3);
  });
});
