import { describe, expect, it } from "vitest";
import { REVIEW_ID_ATTR, type ElementSourceMap } from "../shared";
import { analyzeHtml } from "./analyzeHtml";
import { injectReviewIds } from "./injectReviewIds";
import { elementsInOrder, reviewIdOf } from "./testHelpers";

const FILE = "index.html";
const INSERTED = new RegExp(` ${REVIEW_ID_ATTR}="[^"]*"`, "g");

/** 再解析した全要素の data-review-id が対応表の ID と一致する（暗黙の要素には付かない） */
function expectReviewIdsMatch(injected: string, map: ElementSourceMap) {
  const elements = elementsInOrder(injected);
  const infos = [...map.values()];
  expect(elements.map((element) => element.tagName)).toEqual(infos.map((info) => info.tagName));
  elements.forEach((element, i) => {
    const info = infos[i]!;
    expect(reviewIdOf(element)).toBe(info.startTag ? info.id : undefined);
  });
}

function inject(source: string) {
  const { map } = analyzeHtml(FILE, source);
  return { map, injected: injectReviewIds(source, map) };
}

describe("injectReviewIds", () => {
  it("開始タグのタグ名の直後に属性を挿入する", () => {
    const { injected } = inject(
      '<!DOCTYPE html><html><body><div class="a"><p>x</p></div></body></html>',
    );
    expect(injected).toBe(
      '<!DOCTYPE html><html data-review-id="0"><body data-review-id="2">' +
        '<div data-review-id="3" class="a"><p data-review-id="4">x</p></div></body></html>',
    );
  });

  it.each([
    ['<img src="a.png" />', '<img data-review-id="3" src="a.png" />'],
    ["<img/>", '<img data-review-id="3"/>'],
    ["<br>", '<br data-review-id="3">'],
    ["<hr\nclass=x>", '<hr data-review-id="3"\nclass=x>'],
    ["<DIV>x</DIV>", '<DIV data-review-id="3">x</DIV>'],
    [
      "<a href=#works class=nav-link>x</a>",
      '<a data-review-id="3" href=#works class=nav-link>x</a>',
    ],
    ["<input disabled>", '<input data-review-id="3" disabled>'],
  ])("自己終了タグや属性のない開始タグにも挿入できる: %s", (source, expected) => {
    expect(inject(source).injected).toBe(expected);
  });

  it("開始タグがソースにない要素には付けない", () => {
    const { injected, map } = inject("<table><tr><td>1</td></tr></table>");
    expect(injected).toBe(
      '<table data-review-id="3"><tr data-review-id="5"><td data-review-id="6">1</td></tr></table>',
    );
    const implicit = [...map.values()].filter((info) => info.startTag === null);
    expect(implicit.map((info) => info.tagName)).toEqual(["html", "head", "body", "tbody"]);
    expectReviewIdsMatch(injected, map);
  });

  it("再解析すると全要素の data-review-id が対応表の ID と一致する", () => {
    const source = [
      "<!DOCTYPE html>",
      "<html>",
      "<head><title>t</title><style>p > b {}</style></head>",
      "<body>",
      '  <ul class="nav"><li>a<li>b</ul>',
      "  <p>x<div>y</div>",
      "  <svg viewBox='0 0 1 1'><circle r=1 /></svg>",
      '  <script>document.write("<p>")</script>',
      "</body>",
      "</html>",
    ].join("\n");
    const { injected, map } = inject(source);
    expectReviewIdsMatch(injected, map);
  });

  it("data-review-id 以外のテキストを変えない（挿入部分を取り除くと元に戻る）", () => {
    const source = "<!-- c --><p class='a'>x<b>y<i>z</b></i><img src=a.png/>\n";
    const { injected, map } = inject(source);
    expect(injected.match(INSERTED)).toHaveLength(
      [...map.values()].filter((info) => info.startTag).length,
    );
    expect(injected.replace(INSERTED, "")).toBe(source);
  });

  it("書式要素の複製は、複製元の開始タグの属性を引き継ぐ（ブラウザも同じ動き）", () => {
    // 複製された b は対応表では暗黙の要素だが、ブラウザ（と parse5）は開始タグの属性ごと複製するため、
    // iframe 内では複製元と同じ data-review-id を持つ
    const { injected, map } = inject("<p><b>x<p>y</b>z");
    const [original, clone] = elementsInOrder(injected).filter((el) => el.tagName === "b");
    const originalId = [...map.values()].find((info) => info.tagName === "b")!.id;
    expect(reviewIdOf(original!)).toBe(originalId);
    expect(reviewIdOf(clone!)).toBe(originalId);
  });

  it("対応表とソースの位置が合わないときは例外を投げる", () => {
    const { map } = analyzeHtml(FILE, "<div><p>x</p></div>");
    expect(() => injectReviewIds("xxxxxxxx", map)).toThrow("開始タグの位置");
  });
});
