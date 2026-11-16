import { describe, expect, it } from "vitest";
import type { ReviewComment, SourceLocation, TextChange } from "../shared";
import { applyChangesToComments } from "./applyChangesToComments";
import { createRandom, editText, locate } from "./testUtils";

const FILE = "index.html";

function comment(id: string, location: SourceLocation): ReviewComment {
  return { id, location, body: id, createdAt: 0, status: "active" };
}

/** 2 つのテキストの共通の先頭・末尾を除いた最小の TextChange（ファイル全体を書き換えた場合の差分） */
function minimalChange(filePath: string, before: string, after: string): TextChange {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    filePath,
    start: prefix,
    end: before.length - suffix,
    insertedLength: after.length - suffix - prefix,
  };
}

describe("applyChangesToComments", () => {
  const source = "<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>\n";
  const one = comment("one", locate(FILE, source, "<li>one</li>"));
  const two = comment("two", locate(FILE, source, "<li>two</li>"));
  const css = comment("css", { filePath: "style.css", start: 0, end: 10 });

  it("複数のコメントに複数の変更を順に適用する", () => {
    // 1. 1 つ目の li の中身を書き換える 2. 先頭にコメントを足す（位置は 1 の後のソース上の値）
    const step1 = editText(FILE, source, source.indexOf("one"), source.indexOf("one") + 3, "first");
    const step2 = editText(FILE, step1.source, 0, 0, "<!-- list -->\n");
    const [a, b, c] = applyChangesToComments([one, two, css], [step1.change, step2.change]);

    const text = (c: ReviewComment | undefined) =>
      step2.source.slice(c?.location.start, c?.location.end);
    expect(text(a)).toBe("<li>first</li>");
    expect(text(b)).toBe("<li>two</li>");
    expect(c).toBe(css);
  });

  it("入力の配列とコメントを変更せず、変わらなかったコメントは同じオブジェクトのまま返す", () => {
    const comments = [one, two];
    const snapshot = structuredClone(comments);
    const at = source.indexOf("two") + 3;
    const result = applyChangesToComments(comments, [
      { filePath: FILE, start: at, end: at, insertedLength: 1 },
    ]);
    expect(comments).toEqual(snapshot);
    expect(result).not.toBe(comments);
    expect(result[0]).toBe(one);
    expect(result[1]).not.toBe(two);
    expect(result[1]?.location.end).toBe(two.location.end + 1);
  });

  it("変更がなければ同じ内容を返す", () => {
    expect(applyChangesToComments([one, two], [])).toEqual([one, two]);
  });

  it("要素を削除すると orphaned になり、位置は消えた場所（空の範囲）になる", () => {
    const removed = editText(FILE, source, one.location.start, one.location.end, "");
    const [a, b] = applyChangesToComments([one, two], [removed.change]);
    expect(a).toMatchObject({
      status: "orphaned",
      location: { filePath: FILE, start: one.location.start, end: one.location.start },
    });
    expect(b?.status).toBe("active");
    expect(removed.source.slice(b?.location.start, b?.location.end)).toBe("<li>two</li>");
  });

  it("要素を含む範囲を置き換えて失効した場合は、置き換え後の文字列の範囲を指す", () => {
    const text = "<ol></ol>";
    const replaced = editText(FILE, source, 0, source.length, text);
    const [a] = applyChangesToComments([one], [replaced.change]);
    expect(a).toMatchObject({
      status: "orphaned",
      location: { filePath: FILE, start: 0, end: text.length },
    });
  });

  it("失効したコメントは後の変更で位置だけ追従し、active には戻らない", () => {
    const removed = editText(FILE, source, one.location.start, one.location.end, "");
    const inserted = editText(FILE, removed.source, 0, 0, "<p>x</p>");
    // 消えた位置に同じ要素を書き直しても active には戻らない
    const at = one.location.start + "<p>x</p>".length;
    const rewritten = editText(FILE, inserted.source, at, at, "<li>one</li>");
    const [a] = applyChangesToComments([one], [removed.change, inserted.change, rewritten.change]);
    expect(a).toMatchObject({ status: "orphaned", location: { start: at, end: at } });
  });
});

describe("applyChangesToComments: 順に適用した結果とまとめて適用した結果", () => {
  // 「まとめて適用」= 同じ元のソース上の座標で書かれた、互いに重ならない変更の集合を一度に当てること。
  // これを順に適用する表現は 2 通りある。
  // - 昇順: 前から順に当て、後の変更の座標を前の変更の差分だけずらす
  // - 降順: 後ろから順に当てる（前の変更の座標は後ろの変更の影響を受けないので、元の座標のまま）
  // どちらの表現でも、コメントの位置と状態が一致することを確かめる

  interface BatchChange {
    start: number;
    end: number;
    text: string;
  }

  function toChange({ start, end, text }: BatchChange, shift = 0): TextChange {
    return { filePath: FILE, start: start + shift, end: end + shift, insertedLength: text.length };
  }

  function ascending(batch: readonly BatchChange[]): TextChange[] {
    let shift = 0;
    return batch.map((item) => {
      const change = toChange(item, shift);
      shift += item.text.length - (item.end - item.start);
      return change;
    });
  }

  function descending(batch: readonly BatchChange[]): TextChange[] {
    return [...batch].reverse().map((item) => toChange(item));
  }

  function applyText(source: string, changes: readonly TextChange[], texts: readonly string[]) {
    return changes.reduce(
      (text, change, i) => text.slice(0, change.start) + texts[i] + text.slice(change.end),
      source,
    );
  }

  it("具体例: 前・内側・後ろの変更を昇順・降順のどちらで当てても一致する", () => {
    const source = "<div>\n  <p>Hello</p>\n</div>\n";
    const p = comment("p", locate(FILE, source, "<p>Hello</p>"));
    const hello = source.indexOf("Hello");
    const batch: BatchChange[] = [
      { start: 0, end: 0, text: "<!-- a -->" },
      { start: hello, end: hello + 5, text: "Bye" },
      { start: p.location.end, end: p.location.end, text: "<p>new</p>" },
    ];
    const asc = ascending(batch);
    const desc = descending(batch);
    const ascResult = applyChangesToComments([p], asc);
    expect(applyChangesToComments([p], desc)).toEqual(ascResult);

    const edited = applyText(
      source,
      asc,
      batch.map((b) => b.text),
    );
    const [moved] = ascResult;
    expect(edited.slice(moved?.location.start, moved?.location.end)).toBe("<p>Bye</p>");
  });

  it("無作為に作った変更とコメントで、昇順・降順の結果が一致する", () => {
    const random = createRandom(20261110);
    const letters = "abc<>/";
    for (let round = 0; round < 3000; round++) {
      const length = 20;
      const source = Array.from({ length }, () => letters[random(letters.length)]).join("");

      const comments = Array.from({ length: 4 }, (_, i) => {
        const start = random(length);
        const end = start + 1 + random(length - start);
        return comment(String(i), { filePath: FILE, start, end });
      });

      // 開始位置が狭義に増え、前の変更の終わり以降から始まる変更の列（互いに重ならない）
      const batch: BatchChange[] = [];
      let cursor = 0;
      while (cursor <= length && batch.length < 4) {
        const start = cursor + random(Math.min(5, length - cursor + 1));
        const end = start + random(Math.min(4, length - start + 1));
        const text = "xyz".slice(0, random(4));
        batch.push({ start, end, text });
        cursor = Math.max(end, start + 1);
      }

      const asc = ascending(batch);
      const desc = descending(batch);
      const texts = batch.map((b) => b.text);
      // 生成した 2 通りの表現が同じテキストになることを先に確かめる
      expect(applyText(source, asc, texts)).toBe(applyText(source, desc, [...texts].reverse()));
      expect(applyChangesToComments(comments, desc)).toEqual(applyChangesToComments(comments, asc));
    }
  });

  it("変更がすべてコメント範囲の内側なら、1 つに合成した変更（最小差分）を当てた結果とも一致する", () => {
    const source = '<div>\n  <p class="a">Hello</p>\n</div>\n';
    const p = comment("p", locate(FILE, source, '<p class="a">Hello</p>'));
    const step1 = editText(FILE, source, source.indexOf('"a"'), source.indexOf('"a"') + 3, '"b c"');
    const hello = step1.source.indexOf("Hello");
    const step2 = editText(FILE, step1.source, hello + 5, hello + 5, ", world");

    const sequential = applyChangesToComments([p], [step1.change, step2.change]);
    const composed = applyChangesToComments([p], [minimalChange(FILE, source, step2.source)]);
    expect(composed).toEqual(sequential);
    const [moved] = sequential;
    expect(step2.source.slice(moved?.location.start, moved?.location.end)).toBe(
      '<p class="b c">Hello, world</p>',
    );
  });

  it("変更がすべてコメント範囲より前なら、1 つに合成した変更を当てた結果とも一致する", () => {
    const source = "<h1>T</h1>\n<p>Hello</p>\n";
    const p = comment("p", locate(FILE, source, "<p>Hello</p>"));
    const step1 = editText(FILE, source, 4, 5, "Title");
    const step2 = editText(FILE, step1.source, 0, 0, "<header>");
    const step3 = editText(
      FILE,
      step2.source,
      step2.source.indexOf("\n"),
      step2.source.indexOf("\n"),
      "</header>",
    );

    const sequential = applyChangesToComments([p], [step1.change, step2.change, step3.change]);
    const composed = applyChangesToComments([p], [minimalChange(FILE, source, step3.source)]);
    expect(composed).toEqual(sequential);
    const [moved] = sequential;
    expect(step3.source.slice(moved?.location.start, moved?.location.end)).toBe("<p>Hello</p>");
  });
});
