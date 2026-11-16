import { describe, expect, it } from "vitest";
import { replaceFile } from "../edit";
import { alignChangeToTagBoundary } from "./alignChange";

function align(oldText: string, newText: string) {
  return alignChangeToTagBoundary(oldText, newText, replaceFile(oldText, newText, "a.html").change);
}

describe("alignChangeToTagBoundary", () => {
  it("要素の前への挿入を、開始タグの前の位置に寄せる", () => {
    const oldText = "<p>b</p>";
    const newText = "<p>a</p><p>b</p>";
    // そのままの最小差分は開始タグ `<p>` の途中になる
    expect(replaceFile(oldText, newText, "a.html").change.start).toBe(3);
    expect(align(oldText, newText)).toEqual({
      filePath: "a.html",
      start: 0,
      end: 0,
      insertedLength: 8,
    });
  });

  it("入れ子の中への挿入も寄せる", () => {
    const change = align("<div><p>b</p></div>", "<div><p>a</p><p>b</p></div>");
    expect(change).toMatchObject({ start: 5, end: 5, insertedLength: 8 });
  });

  it("要素の削除も、削除する要素の範囲に寄せる", () => {
    const change = align("<p>a</p><p>b</p>", "<p>b</p>");
    expect(change).toEqual({ filePath: "a.html", start: 0, end: 8, insertedLength: 0 });
  });

  it("置換や、寄せられない差分はそのまま返す", () => {
    const text = align("<p>abc</p>", "<p>abd</p>");
    expect(text).toMatchObject({ start: 5, end: 6, insertedLength: 1 });
    const inner = align("<p>ab</p>", "<p>aXb</p>");
    expect(inner).toMatchObject({ start: 4, end: 4, insertedLength: 1 });
  });

  it("変化がなければそのまま返す", () => {
    expect(align("<p>a</p>", "<p>a</p>")).toMatchObject({ insertedLength: 0 });
  });
});
