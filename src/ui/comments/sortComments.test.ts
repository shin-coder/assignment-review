import { describe, expect, it } from "vitest";
import type { ReviewComment } from "../../shared";
import { sortComments } from "./sortComments";

function comment(id: string, filePath: string, start: number, createdAt = 0): ReviewComment {
  return {
    id,
    location: { filePath, start, end: start + 1 },
    body: id,
    createdAt,
    status: "active",
  };
}

describe("sortComments", () => {
  it("ファイルパス → 開始位置の順に並べる", () => {
    const comments = [
      comment("c", "index.html", 50),
      comment("d", "about.html", 10),
      comment("a", "index.html", 5),
      comment("b", "index.html", 20),
    ];
    expect(sortComments(comments).map((c) => c.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("開始位置が同じなら作成日時、さらに ID の順に並べる", () => {
    const comments = [
      comment("z", "index.html", 5, 200),
      comment("y", "index.html", 5, 100),
      comment("x", "index.html", 5, 100),
    ];
    expect(sortComments(comments).map((c) => c.id)).toEqual(["x", "y", "z"]);
  });

  it("元の配列を変更しない", () => {
    const comments = [comment("b", "b.html", 0), comment("a", "a.html", 0)];
    sortComments(comments);
    expect(comments.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
