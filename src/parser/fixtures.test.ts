// テスト用サンプルサイト（tests/fixtures）を使った解析層の確認。
// broken-html の期待値は tests/fixtures/README.md の「Chrome で開いたときの補正後の DOM」をそのまま使う
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_ID_ATTR } from "../shared";
import { analyzeHtml } from "./analyzeHtml";
import { findElementAt } from "./findElementAt";
import { injectReviewIds } from "./injectReviewIds";
import { injectScriptTag } from "./injectScriptTag";
import { elementsInOrder, outline, reviewIdOf } from "./testHelpers";

const fixturesDir = path.resolve(import.meta.dirname, "../../tests/fixtures");
const FILE = "index.html";

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name, "index.html"), "utf8");
}

/** README の「Chrome で開いたときの補正後の DOM」のコードブロックを行の配列で取り出す */
function chromeOutlineOfBrokenHtml(): string[] {
  const readme = readFileSync(path.join(fixturesDir, "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("### Chrome で開いたときの補正後の DOM"));
  const block = /```\n([\s\S]*?)```/.exec(section);
  if (!block) throw new Error("README に補正後の DOM が見つからない");
  return block[1]!.trimEnd().split("\n");
}

describe.each(["simple-image", "js-slider", "broken-html"])("サンプルサイト %s", (name) => {
  const source = readFixture(name);
  const { map, tree } = analyzeHtml(FILE, source);

  it("例外にならず、親子関係とツリーが一致する", () => {
    const visit = (nodes: typeof tree, parentId: string | null) => {
      for (const node of nodes) {
        const info = map.get(node.id)!;
        expect(info.parentId).toBe(parentId);
        expect(info.childIds).toEqual(node.children.map((child) => child.id));
        visit(node.children, node.id);
      }
    };
    visit(tree, null);
  });

  it("位置のある要素は、開始タグから始まり、親の範囲に収まる", () => {
    for (const info of map.values()) {
      if (!info.location || !info.startTag) {
        expect(info.location).toBeNull();
        expect(info.startTag).toBeNull();
        continue;
      }
      expect(info.location.start).toBe(info.startTag.start);
      expect(source.slice(info.startTag.start, info.startTag.end)).toMatch(
        new RegExp(`^<${info.tagName}[\\s>/]`, "i"),
      );
      const parent = info.parentId === null ? undefined : map.get(info.parentId);
      if (parent?.location) {
        expect(info.location.start).toBeGreaterThanOrEqual(parent.location.start);
        expect(info.location.end).toBeLessThanOrEqual(parent.location.end);
      }
    }
  });

  it("injectReviewIds: 再解析すると全要素の ID が一致し、挿入部分を除くと元に戻る", () => {
    const injected = injectReviewIds(source, map);
    const elements = elementsInOrder(injected);
    const infos = [...map.values()];
    expect(elements.map((element) => element.tagName)).toEqual(infos.map((info) => info.tagName));
    elements.forEach((element, i) => {
      expect(reviewIdOf(element)).toBe(infos[i]!.startTag ? infos[i]!.id : undefined);
    });
    expect(injected.replace(new RegExp(` ${REVIEW_ID_ATTR}="[^"]*"`, "g"), "")).toBe(source);
  });

  it("injectScriptTag: 注入スクリプトが head の中に入る", () => {
    const html = injectScriptTag(injectReviewIds(source, map), "/inject.js");
    const script = elementsInOrder(html).find((element) =>
      element.attrs.some((attr) => attr.name === "src" && attr.value === "/inject.js"),
    );
    expect(script?.parentNode && "tagName" in script.parentNode && script.parentNode.tagName).toBe(
      "head",
    );
  });
});

describe("broken-html: 不正な HTML", () => {
  const source = readFixture("broken-html");
  const { map, tree } = analyzeHtml(FILE, source);
  const isImplicit = (id: string) => map.get(id)!.location === null;
  const text = (id: string | undefined) => {
    const location = id === undefined ? null : map.get(id)!.location;
    return location && source.slice(location.start, location.end);
  };
  const find = (needle: string) => findElementAt(map, FILE, source.indexOf(needle));

  it("補正後の構造が Chrome で開いた DOM と一致する", () => {
    expect(outline(tree, isImplicit)).toEqual(chromeOutlineOfBrokenHtml());
  });

  it("閉じタグ漏れの <li> は次の <li> の手前、最後の <li> は </ul> の手前で終わる", () => {
    const items = [...map.values()].filter((info) => info.tagName === "li");
    expect(items.map((info) => text(info.id))).toEqual([
      "<li><a href=#works class=nav-link>作品</a>\n  ",
      "<li><a href=#profile class=nav-link>プロフィール</a>\n  ",
      '<li><a href="#contact" class="nav-link">お問い合わせ</a>\n',
    ]);
  });

  it("属性のクォート漏れでも開始タグの範囲とラベルが正しい", () => {
    const a = find("作品</a>")!;
    expect(a.tagName).toBe("a");
    expect(source.slice(a.startTag!.start, a.startTag!.end)).toBe("<a href=#works class=nav-link>");
  });

  it('暗黙に閉じた <p class="intro"> は直後の <div> の手前で終わる', () => {
    expect(text(find("Web デザイン")?.id)).toBe('<p class="intro">Web デザインを勉強中です。\n');
  });

  it("<h2>作品 2 の閉じタグ漏れで、次の <p> が <h2> の中に入る", () => {
    const p = find("美容室")!;
    expect(p.tagName).toBe("p");
    const h2 = map.get(p.parentId!)!;
    expect(h2.tagName).toBe("h2");
    expect(text(h2.id)).toBe("<h2>作品 2\n    <p>美容室のサイトを作りました。\n  ");
    expect(text(p.id)).toBe("<p>美容室のサイトを作りました。\n  ");
  });

  it("<b><i>…</b></i> のネスト誤りで、<i> は </b> の手前で終わる", () => {
    const i = find("好きなこと")!;
    expect(i.tagName).toBe("i");
    expect(text(i.id)).toBe("<i>好きなこと");
    expect(text(i.parentId!)).toBe("<b><i>好きなこと</b>");
  });

  it("暗黙の <tbody> は位置を持たず、<tr> <th> <td> は次のタグの手前で終わる", () => {
    const tbody = [...map.values()].find((info) => info.tagName === "tbody")!;
    expect(tbody.location).toBeNull();
    expect(tbody.childIds.map(text)).toEqual([
      "<tr><th>HTML<td>3 か月\n    ",
      "<tr><th>CSS<td>2 か月\n  ",
    ]);
    expect(text(find("HTML<td>")?.id)).toBe("<th>HTML");
  });

  it('閉じタグのない <div class="profile"> はファイルの末尾で終わり、後ろの div を含む', () => {
    const profile = find('class="profile"')!;
    expect(profile.location!.end).toBe(source.length);
    const contact = find('class="contact"')!;
    expect(contact.parentId).toBe(profile.id);
    expect(text(contact.id)).toBe(
      '<div class="contact" id="contact">\n  <p>メールでご連絡ください。\n</div>',
    );
  });

  it("暗黙の html / head / body には data-review-id を付けない", () => {
    const injected = injectReviewIds(source, map);
    const elements = elementsInOrder(injected);
    for (const tagName of ["html", "head", "body"]) {
      const element = elements.find((el) => el.tagName === tagName)!;
      expect(reviewIdOf(element)).toBeUndefined();
    }
    // html = "0", head = "1" に続いて、ソース上の最初の要素 meta が "2"
    expect(injected).toMatch(/^<!DOCTYPE html>\n<meta data-review-id="2" charset="UTF-8">\n/);
  });
});

describe("js-slider: JS が生成する要素", () => {
  it("ドットは HTML に書かれていないため、.dots の子要素は対応表にない", () => {
    const source = readFixture("js-slider");
    const { map } = analyzeHtml(FILE, source);
    const dots = findElementAt(map, FILE, source.indexOf('class="dots"'))!;
    expect(source.slice(dots.location!.start, dots.location!.end)).toBe('<div class="dots"></div>');
    expect(dots.childIds).toEqual([]);
    expect([...map.values()].filter((info) => info.tagName === "button")).toHaveLength(2);
    // <script> 要素は対象で、中身（src の JS）は解析しない
    expect([...map.values()].filter((info) => info.tagName === "script")).toHaveLength(1);
  });
});
