import { describe, expect, it } from "vitest";
import { diffText } from "./textDiff";

function apply(before: string, after: string): string {
  const change = diffText(before, after);
  if (!change) return before;
  return before.slice(0, change.from) + change.insert + before.slice(change.to);
}

describe("diffText", () => {
  it("同じテキストなら null", () => {
    expect(diffText("abc", "abc")).toBeNull();
  });

  it("共通の先頭・末尾を除いた部分だけを置き換える", () => {
    expect(diffText("<p>hello</p>", "<p>world</p>")).toEqual({ from: 3, to: 8, insert: "world" });
  });

  it("挿入と削除を表せる", () => {
    expect(diffText("ac", "abc")).toEqual({ from: 1, to: 1, insert: "b" });
    expect(diffText("abc", "ac")).toEqual({ from: 1, to: 2, insert: "" });
  });

  it("繰り返しを含んでも先頭と末尾が重ならない", () => {
    expect(diffText("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
    expect(diffText("aa", "aaa")).toEqual({ from: 2, to: 2, insert: "a" });
  });

  it.each([
    ["", "abc"],
    ["abc", ""],
    ["p { color: red; }", "p { color: blue; }"],
    ["abab", "ab"],
    ["こんにちは", "こんばんは"],
  ])("適用すると after になる: %s → %s", (before, after) => {
    expect(apply(before, after)).toBe(after);
  });
});
