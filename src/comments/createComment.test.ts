import { describe, expect, it } from "vitest";
import type { ElementInfo } from "../shared";
import { createComment } from "./createComment";

const info: ElementInfo = {
  id: "3",
  tagName: "p",
  filePath: "index.html",
  location: { filePath: "index.html", start: 10, end: 30 },
  startTag: { filePath: "index.html", start: 10, end: 13 },
  parentId: "2",
  childIds: [],
};

const options = { idFactory: () => "comment-1", now: () => 1_700_000_000_000 };

describe("createComment", () => {
  it("要素全体の位置に紐付けたコメントを作る", () => {
    expect(createComment(info, "余白を広げましょう", options)).toEqual({
      ok: true,
      comment: {
        id: "comment-1",
        location: { filePath: "index.html", start: 10, end: 30 },
        body: "余白を広げましょう",
        createdAt: 1_700_000_000_000,
        status: "active",
      },
    });
  });

  it("位置は ElementInfo と共有しない（後から対応表を作り直しても影響しない）", () => {
    const result = createComment(info, "a", options);
    if (!result.ok) throw new Error("作れなかった");
    expect(result.comment.location).not.toBe(info.location);
  });

  it("JS が生成した要素（info が null）ではコメントを作らず理由を返す", () => {
    const result = createComment(null, "a", options);
    expect(result).toMatchObject({ ok: false, reason: "generated-element" });
    if (result.ok) throw new Error("作られてしまった");
    expect(result.message).toContain("JS");
  });

  it("暗黙に作られた要素（location が null）ではコメントを作らず理由を返す", () => {
    const implicit: ElementInfo = { ...info, tagName: "tbody", location: null, startTag: null };
    expect(createComment(implicit, "a", options)).toMatchObject({
      ok: false,
      reason: "implicit-element",
    });
  });

  it("空白だけの本文ではコメントを作らない", () => {
    expect(createComment(info, " \n\t", options)).toMatchObject({
      ok: false,
      reason: "empty-body",
    });
  });

  it("本文は受け取ったまま保存する", () => {
    const result = createComment(info, "  1 行目\n2 行目\n", options);
    expect(result.ok && result.comment.body).toBe("  1 行目\n2 行目\n");
  });

  it("idFactory / now を省略すると、毎回異なる ID と現在時刻を使う", () => {
    const before = Date.now();
    const a = createComment(info, "a");
    const b = createComment(info, "b");
    if (!a.ok || !b.ok) throw new Error("作れなかった");
    expect(a.comment.id).not.toBe(b.comment.id);
    expect(a.comment.createdAt).toBeGreaterThanOrEqual(before);
    expect(a.comment.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
