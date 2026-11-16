import { describe, expect, it } from "vitest";
import type { TextChange } from "../shared";
import { EditError } from "./errors";
import { applyChangeTo } from "./testHelpers";
import {
  applyEdits,
  composeChanges,
  isNoopChange,
  replaceFile,
  replaceRange,
  type EditResult,
} from "./textChange";

const at = (start: number, end: number) => ({ filePath: "a.css", start, end });

/** 返された TextChange を元のソースに当てはめると、返された新しいソースと一致する */
function expectConsistent(before: string, result: EditResult): void {
  expect(applyChangeTo(before, result.source, result.change)).toBe(result.source);
}

describe("replaceRange", () => {
  const source = "abcdef";

  it("先頭への挿入", () => {
    const result = replaceRange(source, at(0, 0), "XY");
    expect(result.source).toBe("XYabcdef");
    expect(result.change).toEqual({ filePath: "a.css", start: 0, end: 0, insertedLength: 2 });
    expectConsistent(source, result);
  });

  it("末尾への挿入", () => {
    const result = replaceRange(source, at(6, 6), "XY");
    expect(result.source).toBe("abcdefXY");
    expect(result.change).toEqual({ filePath: "a.css", start: 6, end: 6, insertedLength: 2 });
    expectConsistent(source, result);
  });

  it("途中の空範囲への挿入", () => {
    const result = replaceRange(source, at(3, 3), "-");
    expect(result.source).toBe("abc-def");
    expect(result.change).toMatchObject({ start: 3, end: 3, insertedLength: 1 });
    expectConsistent(source, result);
  });

  it("全体の削除", () => {
    const result = replaceRange(source, at(0, 6), "");
    expect(result.source).toBe("");
    expect(result.change).toMatchObject({ start: 0, end: 6, insertedLength: 0 });
    expectConsistent(source, result);
  });

  it("先頭と末尾を含む置換", () => {
    expect(replaceRange(source, at(0, 2), "Z").source).toBe("Zcdef");
    expect(replaceRange(source, at(4, 6), "Z").source).toBe("abcdZ");
  });

  it("空のソースへの挿入", () => {
    const result = replaceRange("", at(0, 0), "x");
    expect(result.source).toBe("x");
    expect(result.change).toMatchObject({ start: 0, end: 0, insertedLength: 1 });
  });

  it("範囲の中で共通の先頭・末尾を除いた最小の変化を返す", () => {
    const result = replaceRange(source, at(1, 5), "bXde");
    expect(result.source).toBe("abXdef");
    expect(result.change).toMatchObject({ start: 2, end: 3, insertedLength: 1 });
    expectConsistent(source, result);
  });

  it("同じテキストで置き換えると何も変えない変化になる", () => {
    const result = replaceRange(source, at(1, 4), "bcd");
    expect(result.source).toBe(source);
    expect(isNoopChange(result.change)).toBe(true);
  });

  it.each([
    [-1, 0],
    [3, 2],
    [0, 7],
    [0.5, 1],
  ])("範囲外（%d〜%d）は EditError を投げる", (start, end) => {
    expect(() => replaceRange(source, at(start, end), "x")).toThrow(EditError);
    expect(() => replaceRange(source, at(start, end), "x")).toThrow(
      expect.objectContaining({ code: "invalid-range" }),
    );
  });
});

describe("replaceFile", () => {
  it("1 文字の変更で TextChange が 1 文字分になる", () => {
    const before = "body {\n  color: red;\n}\n";
    const after = "body {\n  color: rod;\n}\n";
    const result = replaceFile(before, after, "a.css");
    const index = before.indexOf("red") + 1;
    expect(result.source).toBe(after);
    expect(result.change).toEqual({
      filePath: "a.css",
      start: index,
      end: index + 1,
      insertedLength: 1,
    });
  });

  it("1 文字の挿入・削除", () => {
    expect(replaceFile("abc", "abXc", "a").change).toMatchObject({
      start: 2,
      end: 2,
      insertedLength: 1,
    });
    expect(replaceFile("abXc", "abc", "a").change).toMatchObject({
      start: 2,
      end: 3,
      insertedLength: 0,
    });
  });

  it("同じ文字が続くところでも共通部分を重ねて数えない", () => {
    const result = replaceFile("aaa", "aaaa", "a");
    expect(result.change).toMatchObject({ end: result.change.start, insertedLength: 1 });
    expectConsistent("aaa", result);
  });

  it("変更がなければ何も変えない変化になる", () => {
    const result = replaceFile("abc", "abc", "a");
    expect(result.source).toBe("abc");
    expect(isNoopChange(result.change)).toBe(true);
  });

  it("サロゲートペアの途中では区切らない", () => {
    const before = "a😀b";
    const after = "a😁b";
    const result = replaceFile(before, after, "a");
    expect(result.change).toMatchObject({ start: 1, end: 3, insertedLength: 2 });
    expectConsistent(before, result);
  });

  it("全体を書き換えたとき", () => {
    const result = replaceFile("abc", "xyz", "a");
    expect(result.change).toMatchObject({ start: 0, end: 3, insertedLength: 3 });
    expectConsistent("abc", result);
  });
});

/** 決まった種から乱数を作る（テストを毎回同じにする） */
function createRandom(seed: number): (max: number) => number {
  let state = seed;
  return (max) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % max;
  };
}

describe("composeChanges", () => {
  it("順に適用した 2 つの変化を、元のソースに対する 1 つの変化にまとめる", () => {
    const t0 = "abcdef";
    const first = replaceRange(t0, at(1, 3), "X"); // aXdef
    const second = replaceRange(first.source, at(3, 4), "YY"); // aXdYYf
    const composed = composeChanges([first.change, second.change])!;
    expect(second.source).toBe("aXdYYf");
    expect(composed).toEqual({ filePath: "a.css", start: 1, end: 5, insertedLength: 4 });
    expect(applyChangeTo(t0, second.source, composed)).toBe(second.source);
  });

  it("後の変化が前の変化で挿入した文字の中にある場合", () => {
    const t0 = "0123456789";
    const first = replaceRange(t0, at(2, 4), "abcdef");
    const second = replaceRange(first.source, at(4, 5), "");
    const composed = composeChanges([first.change, second.change])!;
    expect(composed).toMatchObject({ start: 2, end: 4 });
    expect(applyChangeTo(t0, second.source, composed)).toBe(second.source);
  });

  it("ランダムな編集の列をまとめても、元のソースと最後のソースの差として正しい", () => {
    const random = createRandom(42);
    for (let round = 0; round < 200; round++) {
      const original = "<p>hello world</p>\n".repeat(1 + random(3));
      let current = original;
      const changes: TextChange[] = [];
      const steps = 1 + random(5);
      for (let step = 0; step < steps; step++) {
        const start = random(current.length + 1);
        const end = start + random(current.length - start + 1);
        const text = "xyz<>".slice(0, random(6));
        const result = replaceRange(current, at(start, end), text);
        current = result.source;
        changes.push(result.change);
      }
      const composed = composeChanges(changes);
      if (composed === null) {
        expect(current).toBe(original);
      } else {
        expect(applyChangeTo(original, current, composed)).toBe(current);
      }
    }
  });

  it("空の列や何も変えない変化だけなら null を返す", () => {
    expect(composeChanges([])).toBeNull();
    expect(composeChanges([{ filePath: "a", start: 3, end: 3, insertedLength: 0 }])).toBeNull();
  });

  it("何も変えない変化はまとめる範囲を広げない", () => {
    const composed = composeChanges([
      { filePath: "a", start: 0, end: 0, insertedLength: 0 },
      { filePath: "a", start: 10, end: 12, insertedLength: 1 },
    ]);
    expect(composed).toEqual({ filePath: "a", start: 10, end: 12, insertedLength: 1 });
  });

  it("別のファイルの変化をまとめようとすると例外を投げる", () => {
    expect(() =>
      composeChanges([
        { filePath: "a", start: 0, end: 1, insertedLength: 1 },
        { filePath: "b", start: 0, end: 1, insertedLength: 1 },
      ]),
    ).toThrow(expect.objectContaining({ code: "file-mismatch" }));
  });
});

describe("applyEdits", () => {
  const source = "<a>one</a><b>two</b><c>three</c>";

  it("同じ元のソースに対する複数の置換を、位置がずれないよう後ろから適用する", () => {
    const one = source.indexOf("one");
    const three = source.indexOf("three");
    const result = applyEdits(source, "index.html", [
      { start: one, end: one + 3, text: "1111" },
      { start: three, end: three + 5, text: "3" },
    ]);
    expect(result.source).toBe("<a>1111</a><b>two</b><c>3</c>");
    // 適用した順（後ろから）に並ぶ
    expect(result.changes.map((change) => change.start)).toEqual([three, one]);
    expect(applyChangeTo(source, result.source, result.change)).toBe(result.source);
  });

  it("渡す順に関係なく同じ結果になる", () => {
    const edits = [
      { start: 3, end: 6, text: "X" },
      { start: 13, end: 16, text: "Y" },
      { start: 0, end: 0, text: "<!-- -->" },
    ];
    const forward = applyEdits(source, "index.html", edits);
    const backward = applyEdits(source, "index.html", [...edits].reverse());
    expect(backward.source).toBe(forward.source);
  });

  it("同じ位置への挿入は渡した順に並び、隣り合う範囲は重なりとみなさない", () => {
    const result = applyEdits("abcd", "a", [
      { start: 2, end: 2, text: "1" },
      { start: 2, end: 2, text: "2" },
      { start: 2, end: 4, text: "Z" },
      { start: 0, end: 2, text: "Y" },
    ]);
    expect(result.source).toBe("Y12Z");
    expect(applyChangeTo("abcd", result.source, result.change)).toBe(result.source);
  });

  it("範囲が重なると例外を投げる", () => {
    expect(() =>
      applyEdits("abcdef", "a", [
        { start: 0, end: 3, text: "" },
        { start: 2, end: 4, text: "" },
      ]),
    ).toThrow(expect.objectContaining({ code: "overlapping-edits" }));
  });

  it("空の列なら何も変えない", () => {
    const result = applyEdits("abc", "a", []);
    expect(result.source).toBe("abc");
    expect(result.changes).toEqual([]);
    expect(isNoopChange(result.change)).toBe(true);
  });
});
