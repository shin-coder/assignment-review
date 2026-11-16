import { describe, expect, it } from "vitest";
import type { ElementInfo, ElementSourceMap, LayerNode } from "../shared";
import { analyzeHtml } from "./analyzeHtml";
import { outline } from "./testHelpers";

const FILE = "index.html";

/** 対応表から、指定したタグ名の要素を文書順にすべて取り出す */
function byTag(map: ElementSourceMap, tagName: string): ElementInfo[] {
  return [...map.values()].filter((info) => info.tagName === tagName);
}

function sliceOf(source: string, location: { start: number; end: number } | null) {
  return location ? source.slice(location.start, location.end) : null;
}

/** 対応表の parentId / childIds とツリーが同じ形であることを確かめる */
function expectTreeMatchesMap(tree: LayerNode[], map: ElementSourceMap) {
  const roots = [...map.values()].filter((info) => info.parentId === null);
  expect(tree.map((node) => node.id)).toEqual(roots.map((info) => info.id));
  const check = (node: LayerNode, parentId: string | null) => {
    const info = map.get(node.id)!;
    expect(info.parentId).toBe(parentId);
    expect(info.childIds).toEqual(node.children.map((child) => child.id));
    node.children.forEach((child) => check(child, node.id));
  };
  tree.forEach((node) => check(node, null));
}

describe("analyzeHtml: 正しい HTML", () => {
  const source = [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    '  <meta charset="UTF-8">',
    "  <title>テスト</title>",
    "</head>",
    "<body>",
    '  <main id="main" class="card  is-active">',
    "    <p>こんにちは<b>世界</b></p>",
    '    <img src="a.png" alt="" />',
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
  const { map, tree } = analyzeHtml(FILE, source);

  it("各要素の location / startTag がソースの該当テキストを指す", () => {
    const html = byTag(map, "html")[0]!;
    expect(sliceOf(source, html.startTag)).toBe('<html lang="ja">');
    expect(sliceOf(source, html.location)).toMatch(/^<html lang="ja">[\s\S]*<\/html>$/);

    const head = byTag(map, "head")[0]!;
    expect(sliceOf(source, head.startTag)).toBe("<head>");
    expect(sliceOf(source, head.location)).toMatch(/^<head>[\s\S]*<\/head>$/);

    expect(sliceOf(source, byTag(map, "meta")[0]!.location)).toBe('<meta charset="UTF-8">');
    expect(sliceOf(source, byTag(map, "title")[0]!.location)).toBe("<title>テスト</title>");
    expect(sliceOf(source, byTag(map, "body")[0]!.startTag)).toBe("<body>");

    const main = byTag(map, "main")[0]!;
    expect(sliceOf(source, main.startTag)).toBe('<main id="main" class="card  is-active">');
    expect(sliceOf(source, main.location)).toMatch(/^<main id="main"[\s\S]*<\/main>$/);

    const p = byTag(map, "p")[0]!;
    expect(sliceOf(source, p.location)).toBe("<p>こんにちは<b>世界</b></p>");
    expect(sliceOf(source, p.startTag)).toBe("<p>");
    expect(sliceOf(source, byTag(map, "b")[0]!.location)).toBe("<b>世界</b>");

    const img = byTag(map, "img")[0]!;
    expect(sliceOf(source, img.location)).toBe('<img src="a.png" alt="" />');
    expect(sliceOf(source, img.startTag)).toBe('<img src="a.png" alt="" />');
  });

  it("すべての要素にファイルパスと小文字のタグ名が入る", () => {
    for (const info of map.values()) {
      expect(info.filePath).toBe(FILE);
      expect(info.location?.filePath).toBe(FILE);
      expect(info.startTag?.filePath).toBe(FILE);
    }
  });

  it("ID は文書順の連番になる", () => {
    expect([...map.keys()]).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    expect([...map.values()].map((info) => info.tagName)).toEqual([
      "html",
      "head",
      "meta",
      "title",
      "body",
      "main",
      "p",
      "b",
      "img",
    ]);
  });

  it("親子関係とツリーが DOM 構造と一致する", () => {
    expectTreeMatchesMap(tree, map);
    expect(outline(tree)).toEqual([
      "html",
      "  head",
      "    meta",
      "    title",
      "  body",
      "    main#main.card.is-active",
      "      p",
      "        b",
      "      img",
    ]);
  });

  it("子の範囲は親の範囲に収まる", () => {
    for (const info of map.values()) {
      const parent = info.parentId === null ? null : map.get(info.parentId)!;
      if (!info.location || !parent?.location) continue;
      expect(info.location.start).toBeGreaterThanOrEqual(parent.location.start);
      expect(info.location.end).toBeLessThanOrEqual(parent.location.end);
    }
  });

  it("同じソースを 2 回解析すると同じ ID・同じ結果になる", () => {
    const again = analyzeHtml(FILE, source);
    expect([...again.map.entries()]).toEqual([...map.entries()]);
    expect(again.tree).toEqual(tree);
  });
});

describe("analyzeHtml: ラベル", () => {
  it.each([
    ["<div></div>", "div"],
    ['<div id="main"></div>', "div#main"],
    ['<div class="card"></div>', "div.card"],
    ['<div id="main" class=" card\n is-active  "></div>', "div#main.card.is-active"],
    ['<DIV ID="Main" CLASS="Card"></DIV>', "div#Main.Card"],
    ['<div id="" class=""></div>', "div"],
  ])("%s → %s", (html, label) => {
    const { map, tree } = analyzeHtml(FILE, html);
    const div = byTag(map, "div")[0]!;
    const body = tree[0]!.children[1]!;
    expect(body.children[0]!.id).toBe(div.id);
    expect(body.children[0]!.label).toBe(label);
  });
});

describe("analyzeHtml: script / style / template", () => {
  it("<script> <style> の中身は要素にならない（要素自体は対象）", () => {
    const source =
      "<style>p > b { color: red; } </style>" +
      '<script>document.write("<p><b>x</b></p>");</script>' +
      "<textarea><i>y</i></textarea>";
    const { map } = analyzeHtml(FILE, source);
    expect([...map.values()].map((info) => info.tagName)).toEqual([
      "html",
      "head",
      "style",
      "script",
      "body",
      "textarea",
    ]);
    const script = byTag(map, "script")[0]!;
    expect(script.childIds).toEqual([]);
    expect(sliceOf(source, script.location)).toBe(
      '<script>document.write("<p><b>x</b></p>");</script>',
    );
  });

  it("<template> の中身は表示される DOM に入らないため対象外", () => {
    const { map } = analyzeHtml(FILE, "<template><p>x</p></template><div></div>");
    expect(byTag(map, "template")).toHaveLength(1);
    expect(byTag(map, "template")[0]!.childIds).toEqual([]);
    expect(byTag(map, "p")).toHaveLength(0);
  });
});

describe("analyzeHtml: 補正で作られる要素", () => {
  it("開始タグがない html / head / body / tbody は location と startTag が null", () => {
    const source = "<title>t</title><table><tr><td>1</td></tr></table>";
    const { map, tree } = analyzeHtml(FILE, source);
    expect(outline(tree)).toEqual([
      "html",
      "  head",
      "    title",
      "  body",
      "    table",
      "      tbody",
      "        tr",
      "          td",
    ]);
    for (const tag of ["html", "head", "body", "tbody"]) {
      const info = byTag(map, tag)[0]!;
      expect(info.location).toBeNull();
      expect(info.startTag).toBeNull();
    }
    for (const tag of ["title", "table", "tr", "td"]) {
      expect(byTag(map, tag)[0]!.location).not.toBeNull();
    }
    // 暗黙の要素も親子関係には入る
    const tbody = byTag(map, "tbody")[0]!;
    expect(tbody.parentId).toBe(byTag(map, "table")[0]!.id);
    expect(tbody.childIds).toEqual([byTag(map, "tr")[0]!.id]);
    expectTreeMatchesMap(tree, map);
  });

  it("書式要素の再構築で複製された要素は、開始タグを複製元にだけ対応させる", () => {
    // <b> が 2 つ目の <p> の中で再構築される: p > b, p > b（複製）
    const source = "<p><b>x<p>y</b>z";
    const { map, tree } = analyzeHtml(FILE, source);
    expect(outline(tree)).toEqual([
      "html",
      "  head",
      "  body",
      "    p",
      "      b",
      "    p",
      "      b",
    ]);
    const [original, clone] = byTag(map, "b");
    expect(sliceOf(source, original!.startTag)).toBe("<b>");
    expect(sliceOf(source, original!.location)).toBe("<b>x");
    expect(clone!.location).toBeNull();
    expect(clone!.startTag).toBeNull();
  });
});

describe("analyzeHtml: 閉じタグがない要素の終了位置", () => {
  it("次の兄弟の開始タグの手前で終わる", () => {
    const source = "<ul>\n  <li>a\n  <li>b\n</ul>";
    const { map } = analyzeHtml(FILE, source);
    const [first, second] = byTag(map, "li");
    expect(sliceOf(source, first!.location)).toBe("<li>a\n  ");
    // 親の閉じタグの手前で終わる
    expect(sliceOf(source, second!.location)).toBe("<li>b\n");
  });

  it("ファイルの末尾で終わる", () => {
    const source = "<div><p>a";
    const { map } = analyzeHtml(FILE, source);
    expect(sliceOf(source, byTag(map, "div")[0]!.location)).toBe("<div><p>a");
    expect(sliceOf(source, byTag(map, "p")[0]!.location)).toBe("<p>a");
  });

  it("ブロック要素の開始タグで暗黙に閉じた <p> は、その開始タグの手前で終わる", () => {
    const source = "<p>a\n<div>b</div>";
    const { map } = analyzeHtml(FILE, source);
    expect(sliceOf(source, byTag(map, "p")[0]!.location)).toBe("<p>a\n");
    expect(byTag(map, "div")[0]!.parentId).toBe(byTag(map, "body")[0]!.id);
  });
});

describe("analyzeHtml: オフセット", () => {
  it("CRLF やサロゲートペアを含んでも UTF-16 のオフセットになる", () => {
    const source = "a\r\n<p>😀</p>\r\n<i>x";
    const { map } = analyzeHtml(FILE, source);
    expect(sliceOf(source, byTag(map, "p")[0]!.location)).toBe("<p>😀</p>");
    expect(sliceOf(source, byTag(map, "i")[0]!.location)).toBe("<i>x");
  });

  it("空のソースでも例外にならない", () => {
    const { map, tree } = analyzeHtml(FILE, "");
    expect(outline(tree)).toEqual(["html", "  head", "  body"]);
    expect([...map.values()].every((info) => info.location === null)).toBe(true);
  });
});
