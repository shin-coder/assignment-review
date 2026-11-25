import { describe, expect, it } from "vitest";
import type { MatchedCssRule } from "../shared";
import { locateCssRule, normalizeSelector, parseCssRules } from "./cssRules";

function rule(selector: string, occurrence = 0): MatchedCssRule {
  return { path: "style.css", selector, media: null, occurrence, cssText: "" };
}

describe("parseCssRules", () => {
  it("スタイルルールをソースの順に取り出し、範囲は閉じ括弧まで", () => {
    const css = "h1 { color: red; }\n.card p {\n  margin: 0;\n}\n";
    const rules = parseCssRules(css);
    expect(rules.map((r) => r.selector)).toEqual(["h1", ".card p"]);
    expect(css.slice(rules[1]!.start, rules[1]!.end)).toBe(".card p {\n  margin: 0;\n}");
  });

  it("@media・@supports の中にも入り、@font-face・@keyframes の中身は読まない", () => {
    const css = `@import url("a.css");
@font-face { font-family: x; src: url(x.woff); }
@keyframes spin { from { opacity: 0 } to { opacity: 1 } }
@media (max-width: 600px) {
  .a { color: red; }
  @supports (display: grid) { .b { display: grid; } }
}
.c { color: blue; }`;
    expect(parseCssRules(css).map((r) => r.selector)).toEqual([".a", ".b", ".c"]);
  });

  it("コメント・文字列の中の括弧に惑わされない", () => {
    const css = `/* .x { } */ .a::after { content: "}"; } .b { background: url('{.png') }`;
    expect(parseCssRules(css).map((r) => r.selector)).toEqual([".a::after", ".b"]);
  });

  it("閉じ括弧が足りない CSS でも、最後のルールはテキストの終わりまで", () => {
    const css = ".a { color: red; }\n.b { color: blue;";
    const rules = parseCssRules(css);
    expect(rules.map((r) => r.selector)).toEqual([".a", ".b"]);
    expect(rules[1]!.end).toBe(css.length);
  });
});

describe("normalizeSelector", () => {
  it.each([
    ["a>b", "a > b"],
    [".a ,  .b", ".a, .b"],
    ["input[type=text]", 'input[type="text"]'],
    ["p:before", "p::before"],
    ["*.card", ".card"],
    ["UL  LI", "ul li"],
  ])("ソース %s とブラウザの %s を同じ形にする", (source, browser) => {
    expect(normalizeSelector(source)).toBe(normalizeSelector(browser));
  });
});

describe("locateCssRule", () => {
  const css =
    ".a { color: red; }\n@media (max-width: 600px) {\n  .a { color: blue; }\n}\n.b>p { margin: 0 }";

  it("同じセレクタが複数あれば occurrence 番目を返す", () => {
    const first = locateCssRule(css, rule(".a", 0))!;
    const second = locateCssRule(css, rule(".a", 1))!;
    expect(css.slice(first.start, first.end)).toBe(".a { color: red; }");
    expect(css.slice(second.start, second.end)).toBe(".a { color: blue; }");
  });

  it("ブラウザが整えたセレクタでもソースのルールを見つける", () => {
    const found = locateCssRule(css, rule(".b > p"))!;
    expect(css.slice(found.start, found.end)).toBe(".b>p { margin: 0 }");
  });

  it("見つからなければ null", () => {
    expect(locateCssRule(css, rule(".zzz"))).toBeNull();
    expect(locateCssRule(css, rule(".a", 5))).toBeNull();
  });
});
