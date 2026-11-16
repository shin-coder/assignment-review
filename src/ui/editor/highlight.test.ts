import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { highlightField, setHighlightEffect, toHighlightRange } from "./highlight";

function ranges(state: EditorState): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  state.field(highlightField).between(0, state.doc.length, (from, to) => {
    result.push([from, to]);
  });
  return result;
}

describe("toHighlightRange", () => {
  it("同じファイルの位置を範囲にする", () => {
    expect(
      toHighlightRange({ filePath: "index.html", start: 2, end: 5 }, "index.html", 10),
    ).toEqual({ from: 2, to: 5 });
  });

  it("null や別ファイルの位置なら null", () => {
    expect(toHighlightRange(null, "index.html", 10)).toBeNull();
    expect(toHighlightRange({ filePath: "a.css", start: 0, end: 3 }, "index.html", 10)).toBeNull();
  });

  it("ドキュメントの長さに収め、空になったら null", () => {
    expect(toHighlightRange({ filePath: "a.css", start: 5, end: 99 }, "a.css", 10)).toEqual({
      from: 5,
      to: 10,
    });
    expect(toHighlightRange({ filePath: "a.css", start: 20, end: 30 }, "a.css", 10)).toBeNull();
    expect(toHighlightRange({ filePath: "a.css", start: 3, end: 3 }, "a.css", 10)).toBeNull();
  });
});

describe("highlightField", () => {
  const base = EditorState.create({ doc: "<p>hello</p>", extensions: [highlightField] });

  it("効果で範囲を設定し、null で消す", () => {
    const highlighted = base.update({ effects: setHighlightEffect.of({ from: 3, to: 8 }) }).state;
    expect(ranges(highlighted)).toEqual([[3, 8]]);

    const cleared = highlighted.update({ effects: setHighlightEffect.of(null) }).state;
    expect(ranges(cleared)).toEqual([]);
  });

  it("前に文字が挿入されると範囲がずれて追従する", () => {
    const highlighted = base.update({ effects: setHighlightEffect.of({ from: 3, to: 8 }) }).state;
    const edited = highlighted.update({ changes: { from: 0, insert: "\n\n" } }).state;
    expect(ranges(edited)).toEqual([[5, 10]]);
  });
});
