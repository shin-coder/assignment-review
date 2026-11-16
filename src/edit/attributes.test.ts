import { describe, expect, it } from "vitest";
import { removeAttribute, setAttribute } from "./attributes";
import { applyChangeTo, elementAt } from "./testHelpers";
import { isNoopChange, type EditResult } from "./textChange";

function expectConsistent(before: string, result: EditResult): void {
  expect(applyChangeTo(before, result.source, result.change)).toBe(result.source);
}

/** 開始タグ 1 つだけのソースに setAttribute を当てた結果のソース */
function set(startTag: string, name: string, value: string, tagName = "a"): string {
  const source = `<p>前</p>${startTag}後`;
  const result = setAttribute(source, elementAt(source, tagName, startTag), name, value);
  expectConsistent(source, result);
  expect(result.source.startsWith("<p>前</p>")).toBe(true);
  expect(result.source.endsWith("後")).toBe(true);
  return result.source.slice("<p>前</p>".length, -"後".length);
}

/** 開始タグ 1 つだけのソースに removeAttribute を当てた結果のソース */
function remove(startTag: string, name: string, tagName = "a"): string {
  const source = `<p>前</p>${startTag}後`;
  const result = removeAttribute(source, elementAt(source, tagName, startTag), name);
  expectConsistent(source, result);
  return result.source.slice("<p>前</p>".length, -"後".length);
}

describe("setAttribute", () => {
  it("既存の属性を上書きする", () => {
    expect(set('<a href="x" class="old">', "class", "new")).toBe('<a href="x" class="new">');
  });

  it("シングルクォートの属性はシングルクォートのまま書き換える", () => {
    expect(set("<a class='old'>", "class", "new")).toBe("<a class='new'>");
  });

  it("属性名の大文字小文字を区別しない", () => {
    expect(set('<a CLASS="old">', "class", "new")).toBe('<a CLASS="new">');
  });

  it("同じ名前の属性が複数あれば、最初のもの（ブラウザが使うほう）を書き換える", () => {
    expect(set('<a id="a" id="b">', "id", "c")).toBe('<a id="c" id="b">');
  });

  it("新しい属性を最後の属性の後ろに足す", () => {
    expect(set('<a href="x">', "class", "c")).toBe('<a href="x" class="c">');
  });

  it("属性のない開始タグに足す", () => {
    expect(set("<a>", "id", "top")).toBe('<a id="top">');
  });

  it("自己終了の / の手前に足す", () => {
    expect(set('<img src="a.png" />', "alt", "", "img")).toBe('<img src="a.png" alt="" />');
    expect(set("<br/>", "class", "x", "br")).toBe('<br class="x"/>');
  });

  it("クォートなしの属性は、クォートなしで書ける値ならそのまま書く", () => {
    expect(set("<a href=#works class=nav-link>", "href", "#top")).toBe(
      "<a href=#top class=nav-link>",
    );
  });

  it('クォートなしの属性に空白などを含む値を書くときは " で囲む', () => {
    expect(set("<a class=nav-link>", "class", "nav-link is-active")).toBe(
      '<a class="nav-link is-active">',
    );
    expect(set("<a class=x>", "class", "")).toBe('<a class="">');
    expect(set("<a title=x>", "title", "a=b")).toBe('<a title="a=b">');
  });

  it("値にクォートや & を含む場合はエスケープする", () => {
    expect(set('<a title="x">', "title", 'say "hi" & bye')).toBe(
      '<a title="say &quot;hi&quot; &amp; bye">',
    );
    expect(set("<a title='x'>", "title", 'it\'s "ok"')).toBe("<a title='it&#39;s \"ok\"'>");
    expect(set("<a>", "title", '"')).toBe('<a title="&quot;">');
  });

  it("値のない属性に値を設定する", () => {
    expect(set("<input disabled>", "disabled", "disabled", "input")).toBe(
      '<input disabled="disabled">',
    );
  });

  it("値のない属性に空文字を設定しても何も変えない", () => {
    const source = "<input disabled>";
    const result = setAttribute(source, elementAt(source, "input", source), "disabled", "");
    expect(result.source).toBe(source);
    expect(isNoopChange(result.change)).toBe(true);
  });

  it("改行を含む開始タグで、他の行の改行・インデントを保つ", () => {
    const tag = '<img\n    src="a.png"\n    alt="写真"\n  >';
    expect(set(tag, "alt", "画像", "img")).toBe('<img\n    src="a.png"\n    alt="画像"\n  >');
    // 新しい属性は最後の属性と同じ改行＋インデントで足す
    expect(set(tag, "width", "64", "img")).toBe(
      '<img\n    src="a.png"\n    alt="写真"\n    width="64"\n  >',
    );
  });

  it("属性値の中の > や = や空白を属性の区切りと取り違えない", () => {
    expect(set("<a title=\"a > b\" data-x = '1 2' class=c>", "class", "d")).toBe(
      "<a title=\"a > b\" data-x = '1 2' class=d>",
    );
    expect(set('<a data-x = "1">', "data-x", "2")).toBe('<a data-x = "2">');
    // 値の中に属性名と同じ文字列があっても、属性名としては扱わない
    expect(set('<a title="class=x">', "class", "y")).toBe('<a title="class=x" class="y">');
  });

  it("変化は値の差分だけの最小の範囲になる", () => {
    const source = '<a class="nav">';
    const result = setAttribute(source, elementAt(source, "a", source), "class", "nav2");
    expect(result.change).toMatchObject({ start: 13, end: 13, insertedLength: 1 });
  });

  it.each(["", "a b", 'a"', "a=b", "a>", "a/b", "a\u0000"])(
    "属性名として使えない %j は invalid-attribute-name を投げる",
    (name) => {
      const source = "<a>";
      expect(() => setAttribute(source, elementAt(source, "a", source), name, "x")).toThrow(
        expect.objectContaining({ code: "invalid-attribute-name" }),
      );
    },
  );

  it("暗黙に作られた要素は implicit-element を投げる", () => {
    const source = "<a>";
    const info = { ...elementAt(source, "a", source), location: null, startTag: null };
    expect(() => setAttribute(source, info, "id", "x")).toThrow(
      expect.objectContaining({ code: "implicit-element" }),
    );
  });
});

describe("removeAttribute", () => {
  it("途中の属性を消し、他の属性と空白は崩さない", () => {
    expect(remove('<a id="a" href="x" class="c">', "href")).toBe('<a id="a" class="c">');
  });

  it("最初・最後・唯一の属性を消す", () => {
    expect(remove('<a href="x" class="c">', "href")).toBe('<a class="c">');
    expect(remove('<a href="x" class="c">', "class")).toBe('<a href="x">');
    expect(remove("<a href=x>", "href")).toBe("<a>");
    expect(remove('<img src="a" alt="" />', "alt", "img")).toBe('<img src="a" />');
  });

  it("値のない属性を消す", () => {
    expect(remove("<input type=checkbox checked>", "checked", "input")).toBe(
      "<input type=checkbox>",
    );
  });

  it("改行を含む開始タグで、他の行の改行・インデントを保つ", () => {
    const tag = '<img\n    src="a.png"\n    alt="写真"\n    width="64"\n  >';
    expect(remove(tag, "alt", "img")).toBe('<img\n    src="a.png"\n    width="64"\n  >');
    expect(remove(tag, "src", "img")).toBe('<img\n    alt="写真"\n    width="64"\n  >');
    expect(remove(tag, "width", "img")).toBe('<img\n    src="a.png"\n    alt="写真"\n  >');
  });

  it("空白なしで次の属性が続く場合は、つながらないよう空白を 1 つ残す", () => {
    expect(remove('<a x=1 href="2"y=3>', "href")).toBe("<a x=1 y=3>");
  });

  it("同じ名前の属性はすべて消す（大文字小文字を区別しない）", () => {
    expect(remove('<a id="a" class="c" ID="b">', "id")).toBe('<a class="c">');
  });

  it("属性がなければ何も変えない", () => {
    const source = '<a href="x">';
    const result = removeAttribute(source, elementAt(source, "a", source), "class");
    expect(result.source).toBe(source);
    expect(isNoopChange(result.change)).toBe(true);
  });

  it("他の属性の値の中にある同じ文字列は消さない", () => {
    expect(remove('<a title="href=x" href="y">', "href")).toBe('<a title="href=x">');
  });
});
