// テスト用サンプルサイト broken-html（閉じタグ漏れなどの不正な HTML）に対する編集の確認。
// 編集は開始タグなど指定した範囲だけを書き換え、ブラウザの補正（暗黙の html / body / tbody、
// 閉じタグの補完など）をソースに持ち込まないことを確かめる
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ElementInfo } from "../shared";
import { removeAttribute, setAttribute } from "./attributes";
import { replaceElementInner } from "./element";
import { applyChangeTo, elementAt } from "./testHelpers";
import type { EditResult } from "./textChange";

const source = readFileSync(
  path.resolve(import.meta.dirname, "../../tests/fixtures/broken-html/index.html"),
  "utf8",
);

/** 開始タグ startTagText の部分だけが newTagText に変わり、他は 1 文字も変わっていない */
function expectOnlyTagChanged(result: EditResult, startTagText: string, newTagText: string): void {
  const start = source.indexOf(startTagText);
  expect(result.source).toBe(
    source.slice(0, start) + newTagText + source.slice(start + startTagText.length),
  );
  expect(applyChangeTo(source, result.source, result.change)).toBe(result.source);
}

/** ブラウザの補正をソースに持ち込んでいない */
function expectNotNormalized(edited: string): void {
  for (const tag of ["<html", "<head", "<body", "<tbody", "</li>", "</body>", "</html>"]) {
    expect(edited.includes(tag)).toBe(false);
  }
}

describe("broken-html への属性編集", () => {
  it("前提: 補正前のソースには暗黙の要素や補完される閉じタグが書かれていない", () => {
    expectNotNormalized(source);
  });

  it("クォートなし属性の値を、クォートなしのまま書き換える", () => {
    const tag = "<a href=#works class=nav-link>";
    const result = setAttribute(source, elementAt(source, "a", tag), "href", "#top");
    expectOnlyTagChanged(result, tag, "<a href=#top class=nav-link>");
    expectNotNormalized(result.source);
  });

  it('クォートなし属性に空白を含む値を書くと " で囲む', () => {
    const tag = "<a href=#works class=nav-link>";
    const result = setAttribute(source, elementAt(source, "a", tag), "class", "nav-link is-active");
    expectOnlyTagChanged(result, tag, '<a href=#works class="nav-link is-active">');
    expectNotNormalized(result.source);
  });

  it("クォートなし属性を消す", () => {
    const tag = "<a href=#profile class=nav-link>";
    const result = removeAttribute(source, elementAt(source, "a", tag), "class");
    expectOnlyTagChanged(result, tag, "<a href=#profile>");
    expectNotNormalized(result.source);
  });

  it('閉じタグ漏れの <p class="intro"> に属性を足す', () => {
    const tag = '<p class="intro">';
    const result = setAttribute(source, elementAt(source, "p", tag), "id", "intro");
    expectOnlyTagChanged(result, tag, '<p class="intro" id="intro">');
    expectNotNormalized(result.source);
  });

  it("暗黙の tbody の中の <tr> に属性を足す", () => {
    const tag = "<tr>";
    const result = setAttribute(source, elementAt(source, "tr", tag), "class", "row");
    expectOnlyTagChanged(result, tag, '<tr class="row">');
    expectNotNormalized(result.source);
  });

  it("暗黙に作られた body / tbody は編集できず、例外を投げる", () => {
    for (const tagName of ["html", "head", "body", "tbody"]) {
      const info: ElementInfo = {
        id: tagName,
        tagName,
        filePath: "index.html",
        location: null,
        startTag: null,
        parentId: null,
        childIds: [],
      };
      expect(() => setAttribute(source, info, "class", "x")).toThrow(
        expect.objectContaining({ code: "implicit-element" }),
      );
    }
  });
});

describe("broken-html への中身の置き換え", () => {
  it("閉じタグ漏れの <li> は、次の <li> の手前までを中身とする", () => {
    const start = source.indexOf("<li>");
    const next = source.indexOf("<li>", start + 1);
    const info = elementAt(source, "li", "<li>", source.slice(start, next));
    const result = replaceElementInner(source, info, '<a href="#top">トップ</a>\n  ');

    expect(result.source).toBe(
      source.slice(0, start) + '<li><a href="#top">トップ</a>\n  ' + source.slice(next),
    );
    expect(applyChangeTo(source, result.source, result.change)).toBe(result.source);
    expectNotNormalized(result.source);
  });

  it("ネスト誤りの <b><i>…</b></i> では、<b> の終了タグまでを中身とする", () => {
    const outer = "<b><i>好きなこと</b>";
    const info = elementAt(source, "b", "<b>", outer);
    const result = replaceElementInner(source, info, "<i>好きなもの</i>");

    expect(result.source).toContain(
      '<p class="hobby"><b><i>好きなもの</i></b></i>は写真です。</p>',
    );
    expect(applyChangeTo(source, result.source, result.change)).toBe(result.source);
  });

  it("閉じタグ漏れの <h2>作品 2 は、外側の </div> の手前までを中身とする", () => {
    const start = source.indexOf("<h2>作品 2");
    const end = source.indexOf("</div>", start);
    const info = elementAt(source, "h2", "<h2>", source.slice(start, end), start);
    const result = replaceElementInner(source, info, "作品 2</h2>\n  ");

    expect(result.source).toBe(source.slice(0, start) + "<h2>作品 2</h2>\n  " + source.slice(end));
    expect(applyChangeTo(source, result.source, result.change)).toBe(result.source);
  });
});
