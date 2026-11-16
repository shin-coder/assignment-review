import { describe, expect, it } from "vitest";
import type { SourceLocation, TextChange } from "../shared";
import { shiftLocation } from "./shiftLocation";
import { editText, locate } from "./testUtils";

const FILE = "index.html";
const SOURCE = '<div>\n  <p class="a">Hello</p>\n  <span>x</span>\n</div>\n';
const P = '<p class="a">Hello</p>';
/** コメントを付けた <p> の範囲 */
const loc = locate(FILE, SOURCE, P);

/** 編集して位置を追従させ、結果の位置と新しいソースを返す */
function shiftBy(start: number, end: number, text: string) {
  const { source, change } = editText(FILE, SOURCE, start, end, text);
  return { shifted: shiftLocation(loc, change), source };
}

function slice(source: string, location: SourceLocation | null): string {
  if (location === null) throw new Error("失効している");
  return source.slice(location.start, location.end);
}

describe("shiftLocation: 後ろの変更", () => {
  it("コメント範囲より後ろの変更では位置が変わらない", () => {
    const span = locate(FILE, SOURCE, "<span>x</span>");
    const { shifted, source } = shiftBy(span.start, span.end, "<em>yy</em>");
    expect(shifted).toBe(loc);
    expect(slice(source, shifted)).toBe(P);
  });

  it("終了位置ちょうどへの挿入は後ろとして扱い、範囲に含めない", () => {
    const { shifted, source } = shiftBy(loc.end, loc.end, "<p>new</p>");
    expect(shifted).toBe(loc);
    expect(slice(source, shifted)).toBe(P);
  });

  it("終了位置ちょうどから始まる置き換えも後ろとして扱う", () => {
    const { shifted } = shiftBy(loc.end, loc.end + 3, "");
    expect(shifted).toBe(loc);
  });
});

describe("shiftLocation: 前の変更", () => {
  it("コメント範囲より前への挿入では差分だけずれる", () => {
    const text = "<!-- メモ -->\n";
    const { shifted, source } = shiftBy(0, 0, text);
    expect(shifted).toEqual({
      filePath: FILE,
      start: loc.start + text.length,
      end: loc.end + text.length,
    });
    expect(slice(source, shifted)).toBe(P);
  });

  it("コメント範囲より前の削除では前へずれる", () => {
    const { shifted, source } = shiftBy(0, 5, "");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start - 5, end: loc.end - 5 });
    expect(slice(source, shifted)).toBe(P);
  });

  it("開始位置ちょうどへの挿入は前として扱い、範囲に含めない", () => {
    const text = "<h1>見出し</h1>";
    const { shifted, source } = shiftBy(loc.start, loc.start, text);
    expect(shifted).toEqual({
      filePath: FILE,
      start: loc.start + text.length,
      end: loc.end + text.length,
    });
    expect(slice(source, shifted)).toBe(P);
  });

  it("開始位置ちょうどで終わる置き換えも前として扱う", () => {
    const { shifted, source } = shiftBy(loc.start - 2, loc.start, "\n\t\t");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start + 1, end: loc.end + 1 });
    expect(slice(source, shifted)).toBe(P);
  });

  it("長さの変わらない置き換えでは同じオブジェクトを返す", () => {
    const { shifted } = shiftBy(1, 4, "DIV");
    expect(shifted).toBe(loc);
  });
});

describe("shiftLocation: 内側の変更", () => {
  it("内側への挿入で範囲が伸びる", () => {
    const at = SOURCE.indexOf("Hello") + 5;
    const { shifted, source } = shiftBy(at, at, " world");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start, end: loc.end + 6 });
    expect(slice(source, shifted)).toBe('<p class="a">Hello world</p>');
  });

  it("内側の削除で範囲が縮む", () => {
    const attr = locate(FILE, SOURCE, ' class="a"');
    const { shifted, source } = shiftBy(attr.start, attr.end, "");
    expect(slice(source, shifted)).toBe("<p>Hello</p>");
  });

  it("開始位置ちょうどから始まる内側の置き換え（タグ名の変更など）でも開始位置を保つ", () => {
    const { shifted, source } = shiftBy(loc.start, loc.start + 2, "<section");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start, end: loc.end + 6 });
    expect(slice(source, shifted)).toBe('<section class="a">Hello</p>');
  });

  it("終了位置ちょうどで終わる内側の置き換え（閉じタグの変更など）", () => {
    const { shifted, source } = shiftBy(loc.end - 4, loc.end, "</section>");
    expect(slice(source, shifted)).toBe('<p class="a">Hello</section>');
  });

  it("範囲全体を空でない文字列に置き換えたら、要素の置き換えとして置き換え後の範囲を指す", () => {
    const { shifted, source } = shiftBy(loc.start, loc.end, "<p>Bye</p>");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start, end: loc.start + 10 });
    expect(slice(source, shifted)).toBe("<p>Bye</p>");
  });
});

describe("shiftLocation: 範囲を完全に含む変更（失効）", () => {
  it("範囲全体の削除で失効する", () => {
    expect(shiftBy(loc.start, loc.end, "").shifted).toBeNull();
  });

  it("前後の空白ごとの削除で失効する", () => {
    expect(shiftBy(loc.start - 3, loc.end + 1, "").shifted).toBeNull();
  });

  it("親要素ごとの置き換えでは、空でない文字列に置き換えても失効する", () => {
    expect(shiftBy(0, SOURCE.length, "<main></main>").shifted).toBeNull();
  });

  it("開始位置ちょうどから終了位置を越える削除で失効する", () => {
    expect(shiftBy(loc.start, loc.end + 3, "").shifted).toBeNull();
  });
});

describe("shiftLocation: 開始位置ちょうどから終了位置を越える置き換え", () => {
  it("空でない文字列に置き換えた場合は、錨が残るので置き換え後の文字列を指す", () => {
    const { shifted, source } = shiftBy(loc.start, loc.end + 3, "<p>x</p>");
    expect(shifted).toEqual({ filePath: FILE, start: loc.start, end: loc.start + 8 });
    expect(slice(source, shifted)).toBe("<p>x</p>");
  });

  it("開始タグの < を消してから残りを置き換えても、まとめて置き換えた場合と同じになる", () => {
    // 1 回目: < を削除（内側）。2 回目: 残り全体と後ろの空白を "xyz" に置き換え（1 回目の後の座標）
    const first = editText(FILE, SOURCE, loc.start, loc.start + 1, "");
    const afterFirst = shiftLocation(loc, first.change);
    const second = editText(FILE, first.source, loc.start, loc.end + 2, "xyz");
    const both = afterFirst && shiftLocation(afterFirst, second.change);
    const together = shiftBy(loc.start, loc.end + 3, "xyz").shifted;
    expect(both).toEqual(together);
    expect(together).toEqual({ filePath: FILE, start: loc.start, end: loc.start + 3 });
  });
});

describe("shiftLocation: 範囲の一部と重なる変更", () => {
  it("開始位置より前から始まり範囲の途中で終わる変更は、開始タグの先頭が消えるので失効する", () => {
    expect(shiftBy(loc.start - 2, loc.start + 2, "<em").shifted).toBeNull();
  });

  it("範囲の途中から始まり終了位置を越える変更は、開始位置を保ち挿入した文字列の終わりまでを範囲にする", () => {
    const at = SOURCE.indexOf("Hello") + 2;
    const text = "y!</p>\n  ";
    const { shifted, source } = shiftBy(at, loc.end + 3, text);
    expect(shifted).toEqual({ filePath: FILE, start: loc.start, end: at + text.length });
    expect(slice(source, shifted)).toBe('<p class="a">Hey!</p>\n  ');
  });

  it("範囲の途中から終わりより後ろまでを削除した場合は、変更の開始位置までになる", () => {
    const at = SOURCE.indexOf("Hello");
    const { shifted, source } = shiftBy(at, loc.end + 3, "");
    expect(slice(source, shifted)).toBe('<p class="a">');
  });
});

describe("shiftLocation: 別ファイルの変更", () => {
  it("別ファイルの変更は、位置が重なっていても影響しない", () => {
    const change: TextChange = {
      filePath: "about.html",
      start: 0,
      end: SOURCE.length,
      insertedLength: 0,
    };
    expect(shiftLocation(loc, change)).toBe(loc);
  });
});

describe("shiftLocation: 空の範囲", () => {
  const empty: SourceLocation = { filePath: FILE, start: 10, end: 10 };

  it("空の範囲の位置ちょうどへの挿入では動かない（後ろとして扱う）", () => {
    expect(shiftLocation(empty, { filePath: FILE, start: 10, end: 10, insertedLength: 3 })).toBe(
      empty,
    );
  });

  it("空の範囲の位置で終わる置き換えでは前としてずれる", () => {
    expect(shiftLocation(empty, { filePath: FILE, start: 8, end: 10, insertedLength: 5 })).toEqual({
      filePath: FILE,
      start: 13,
      end: 13,
    });
  });
});
