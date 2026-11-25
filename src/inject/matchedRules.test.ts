import { afterEach, describe, expect, it } from "vitest";
import { collectMatchedRules, selectorMatches, splitSelectorList } from "./matchedRules";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("splitSelectorList", () => {
  it("括弧・角括弧・引用符の中のカンマでは分けない", () => {
    expect(splitSelectorList(`a, :is(b, c), [title="x,y"]`)).toEqual([
      "a",
      ":is(b, c)",
      `[title="x,y"]`,
    ]);
  });
});

describe("selectorMatches", () => {
  it("セレクタリストのどれかが当たれば true", () => {
    document.body.innerHTML = `<p class="lead">a</p>`;
    const p = document.querySelector("p")!;
    expect(selectorMatches(p, "h1, .lead")).toBe(true);
    expect(selectorMatches(p, "h1, .other")).toBe(false);
  });

  it("擬似要素のルールは、その元の要素に当たるとみなす", () => {
    document.body.innerHTML = `<p class="lead">a</p>`;
    const p = document.querySelector("p")!;
    expect(selectorMatches(p, ".lead::before")).toBe(true);
    expect(selectorMatches(p, "p:after")).toBe(true);
  });

  it("ブラウザが解釈できないセレクタは当たらない（例外を投げない）", () => {
    document.body.innerHTML = `<p>a</p>`;
    expect(selectorMatches(document.querySelector("p")!, "p:::nope")).toBe(false);
  });
});

describe("collectMatchedRules", () => {
  it("@media の中のルールも、条件付きでソースの順に集め、同じセレクタの何番目かを数える", () => {
    document.head.innerHTML = `<style>
      .lead { color: red; }
      .other { color: blue; }
      @media (max-width: 600px) { .lead { color: green; } }
    </style>`;
    document.body.innerHTML = `<p class="lead">a</p>`;
    const rules = collectMatchedRules(document, document.querySelector("p")!, () => "style.css");
    expect(
      rules.map(({ selector, media, occurrence }) => ({ selector, media, occurrence })),
    ).toEqual([
      { selector: ".lead", media: null, occurrence: 0 },
      { selector: ".lead", media: "@media (max-width: 600px)", occurrence: 1 },
    ]);
    expect(rules.every((rule) => rule.path === "style.css")).toBe(true);
  });

  it("ファイルのパスが分からないスタイルシートは対象外", () => {
    document.head.innerHTML = `<style>.lead { color: red; }</style>`;
    document.body.innerHTML = `<p class="lead">a</p>`;
    expect(collectMatchedRules(document, document.querySelector("p")!, () => null)).toEqual([]);
  });
});
