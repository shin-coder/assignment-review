import { describe, expect, it } from "vitest";
import type { ElementInfo } from "../shared";
import { replaceElement, replaceElementInner } from "./element";
import { applyChangeTo, elementAt } from "./testHelpers";
import type { EditResult } from "./textChange";

function expectConsistent(before: string, result: EditResult): void {
  expect(applyChangeTo(before, result.source, result.change)).toBe(result.source);
}

const source = `<body>
  <h1 id="title">見出し</h1>
  <div class="card">
    <p>本文</p>
  </div>
  <img src="a.png" alt="">
</body>
`;

describe("replaceElement", () => {
  it("要素全体を置き換え、前後のテキストは変えない", () => {
    const outer = '<div class="card">\n    <p>本文</p>\n  </div>';
    const info = elementAt(source, "div", '<div class="card">', outer);
    const result = replaceElement(source, info, '<section class="card">新しい</section>');

    const start = source.indexOf(outer);
    expect(result.source).toBe(
      source.slice(0, start) +
        '<section class="card">新しい</section>' +
        source.slice(start + outer.length),
    );
    expect(result.change.filePath).toBe("index.html");
    expectConsistent(source, result);
  });

  it("変化は要素の範囲の中の最小の範囲になる", () => {
    const outer = '<h1 id="title">見出し</h1>';
    const info = elementAt(source, "h1", '<h1 id="title">', outer);
    const result = replaceElement(source, info, '<h1 id="title">大見出し</h1>');
    const index = source.indexOf("見出し</h1>");
    expect(result.change).toMatchObject({ start: index, end: index, insertedLength: 1 });
    expectConsistent(source, result);
  });

  it("空要素も置き換えられる", () => {
    const info = elementAt(source, "img", '<img src="a.png" alt="">');
    const result = replaceElement(source, info, '<img src="b.png">');
    expect(result.source).toContain('  <img src="b.png">\n</body>');
    expectConsistent(source, result);
  });

  it("暗黙に作られた要素（location が null）は implicit-element を投げる", () => {
    const info: ElementInfo = {
      id: "0",
      tagName: "tbody",
      filePath: "index.html",
      location: null,
      startTag: null,
      parentId: null,
      childIds: [],
    };
    expect(() => replaceElement(source, info, "")).toThrow(
      expect.objectContaining({ name: "EditError", code: "implicit-element" }),
    );
  });

  it("開始タグの位置がソースと食い違うと source-mismatch を投げる", () => {
    const info = elementAt(source, "h1", '<h1 id="title">');
    const shifted = "x" + source;
    expect(() => replaceElement(shifted, info, "")).toThrow(
      expect.objectContaining({ code: "source-mismatch" }),
    );
    expect(() => replaceElement(source, { ...info, tagName: "h2" }, "")).toThrow(
      expect.objectContaining({ code: "source-mismatch" }),
    );
  });

  it("タグ名の前方一致では一致とみなさない（<b> と <body>）", () => {
    const info = elementAt(source, "body", "<body>");
    expect(() => replaceElement(source, { ...info, tagName: "b" }, "")).toThrow(
      expect.objectContaining({ code: "source-mismatch" }),
    );
  });
});

describe("replaceElementInner", () => {
  it("中身だけを置き換え、開始タグ・終了タグと前後のテキストは変えない", () => {
    const outer = '<div class="card">\n    <p>本文</p>\n  </div>';
    const info = elementAt(source, "div", '<div class="card">', outer);
    const result = replaceElementInner(source, info, "<p>差し替え</p>");
    expect(result.source).toBe(source.replace(outer, '<div class="card"><p>差し替え</p></div>'));
    expectConsistent(source, result);
  });

  it("同じタグ名の入れ子でも、外側の要素の終了タグを使う", () => {
    const html = "<div><div>a</div>b</div>";
    const info = elementAt(html, "div", "<div>", html);
    expect(replaceElementInner(html, info, "X").source).toBe("<div>X</div>");
  });

  it("空の要素に中身を入れる", () => {
    const html = "<p class=x></p>";
    const info = elementAt(html, "p", "<p class=x>", html);
    const result = replaceElementInner(html, info, "追加");
    expect(result.source).toBe("<p class=x>追加</p>");
    expect(result.change).toMatchObject({ start: 11, end: 11, insertedLength: 2 });
  });

  it("大文字や空白入りの終了タグでも中身だけを置き換える", () => {
    const html = "<DIV>a</DIV >";
    const info = elementAt(html, "div", "<DIV>", html);
    expect(replaceElementInner(html, info, "b").source).toBe("<DIV>b</DIV >");
  });

  it("閉じタグ漏れの要素は、暗黙に閉じた位置までを中身とする", () => {
    const html = "<ul>\n  <li>一\n  <li>二\n</ul>";
    // 1 つ目の li は次の <li> の手前で暗黙に閉じる
    const info = elementAt(html, "li", "<li>", "<li>一\n  ");
    const result = replaceElementInner(html, info, "いち\n  ");
    expect(result.source).toBe("<ul>\n  <li>いち\n  <li>二\n</ul>");
    expectConsistent(html, result);
  });

  it("template の中身も置き換えられる", () => {
    const html = "<template id=t><p>a</p></template>";
    const info = elementAt(html, "template", "<template id=t>", html);
    expect(replaceElementInner(html, info, "<p>b</p>").source).toBe(
      "<template id=t><p>b</p></template>",
    );
  });

  it("空要素は no-inner-content を投げる", () => {
    const info = elementAt(source, "img", '<img src="a.png" alt="">');
    expect(() => replaceElementInner(source, info, "x")).toThrow(
      expect.objectContaining({ code: "no-inner-content" }),
    );
  });

  it("SVG の自己終了タグは no-inner-content を投げる", () => {
    const html = '<svg><circle r="1"/></svg>';
    const info = elementAt(html, "circle", '<circle r="1"/>');
    expect(() => replaceElementInner(html, info, "x")).toThrow(
      expect.objectContaining({ code: "no-inner-content" }),
    );
  });

  it("暗黙に作られた要素は implicit-element を投げる", () => {
    const info: ElementInfo = {
      ...elementAt(source, "body", "<body>"),
      location: null,
      startTag: null,
    };
    expect(() => replaceElementInner(source, info, "")).toThrow(
      expect.objectContaining({ code: "implicit-element" }),
    );
  });

  it("開始タグの位置に要素がなければ source-mismatch を投げる", () => {
    // コメントの中の文字列は要素ではない
    const html = "<!-- <p>x</p> --><p>y</p>";
    const info = elementAt(html, "p", "<p>", "<p>x</p>");
    expect(() => replaceElementInner(html, info, "z")).toThrow(
      expect.objectContaining({ code: "source-mismatch" }),
    );
  });
});
