import { describe, expect, it } from "vitest";
import type { ElementSourceMap, ReviewComment } from "../shared";
import { applyChangesToComments } from "./applyChangesToComments";
import { createComment } from "./createComment";
import { resolveCommentElement } from "./resolveCommentElement";
import { buildMap, editText } from "./testUtils";

const FILE = "index.html";
const SOURCE = '<body>\n  <h1>Title</h1>\n  <p class="lead">Hello</p>\n</body>\n';

/** SOURCE を 04 で解析した結果に相当する対応表（html / head は暗黙に作られた要素） */
function analyze(source: string, extra: { tagName: string; outer: string }[] = []) {
  return buildMap(FILE, source, [
    { tagName: "html", outer: null },
    { tagName: "head", outer: null },
    {
      tagName: "body",
      outer: source.slice(source.indexOf("<body>"), source.indexOf("</body>") + 7),
    },
    ...extra,
    { tagName: "h1", outer: source.match(/<h1>.*?<\/h1>/)![0] },
    { tagName: "p", outer: source.match(/<p class.*?<\/p>/)![0] },
  ]);
}

function commentOn(map: ElementSourceMap, id: string): ReviewComment {
  const result = createComment(map.get(id) ?? null, "コメント", {
    idFactory: () => "c1",
    now: () => 0,
  });
  if (!result.ok) throw new Error(result.message);
  return result.comment;
}

function tagOf(map: ElementSourceMap, id: string | null): string | undefined {
  return id === null ? undefined : map.get(id)?.tagName;
}

describe("resolveCommentElement", () => {
  const map = analyze(SOURCE);
  const pId = "4";

  it("作った直後のコメントは、元の要素の ID を返す", () => {
    expect(resolveCommentElement(commentOn(map, pId), map)).toBe(pId);
  });

  it("要素の中身を編集した後も同じ要素を返す", () => {
    const at = SOURCE.indexOf("Hello") + 5;
    const edited = editText(FILE, SOURCE, at, at, ", world");
    const [moved] = applyChangesToComments([commentOn(map, pId)], [edited.change]);
    expect(resolveCommentElement(moved!, analyze(edited.source))).toBe(pId);
  });

  it("要素の属性を編集した後も同じ要素を返す", () => {
    const attr = SOURCE.indexOf('"lead"');
    const edited = editText(FILE, SOURCE, attr, attr + 6, '"lead large"');
    const [moved] = applyChangesToComments([commentOn(map, pId)], [edited.change]);
    expect(resolveCommentElement(moved!, analyze(edited.source))).toBe(pId);
  });

  it("前に要素を追加して ID が振り直されても、同じ要素の新しい ID を返す", () => {
    const at = SOURCE.indexOf("<h1>");
    const edited = editText(FILE, SOURCE, at, at, "<nav>menu</nav>\n  ");
    const [moved] = applyChangesToComments([commentOn(map, pId)], [edited.change]);
    const newMap = analyze(edited.source, [{ tagName: "nav", outer: "<nav>menu</nav>" }]);

    const id = resolveCommentElement(moved!, newMap);
    expect(id).toBe("5");
    expect(tagOf(newMap, id)).toBe("p");
  });

  it("要素を削除すると orphaned になり、null を返す", () => {
    const h1Comment = commentOn(map, "3");
    const h1 = map.get("3")!.location!;
    const edited = editText(FILE, SOURCE, h1.start, h1.end, "");
    const [moved] = applyChangesToComments([h1Comment], [edited.change]);
    expect(moved?.status).toBe("orphaned");
    // 失効した位置にはちょうど次の要素（の前の空白）があるが、それを指さない
    const newMap = buildMap(FILE, edited.source, [
      { tagName: "body", outer: edited.source.slice(0, edited.source.indexOf("</body>") + 7) },
      { tagName: "p", outer: edited.source.match(/<p class.*?<\/p>/)![0] },
    ]);
    expect(resolveCommentElement(moved!, newMap)).toBeNull();
  });

  it("失効したコメントは、同じ位置に要素があっても null を返す", () => {
    const orphaned: ReviewComment = { ...commentOn(map, pId), status: "orphaned" };
    expect(resolveCommentElement(orphaned, map)).toBeNull();
  });

  it("終了位置が変わっていても、開始位置が一致すれば同じ要素を返す（閉じタグのない要素など）", () => {
    const comment = commentOn(map, pId);
    const longer: ReviewComment = {
      ...comment,
      location: { ...comment.location, end: comment.location.end + 3 },
    };
    expect(resolveCommentElement(longer, map)).toBe(pId);
  });

  it("開始位置に要素がなければ null を返す", () => {
    const comment = commentOn(map, pId);
    const shifted: ReviewComment = {
      ...comment,
      location: { ...comment.location, start: comment.location.start + 1 },
    };
    expect(resolveCommentElement(shifted, map)).toBeNull();
  });

  it("別ファイルの同じ位置の要素は返さない", () => {
    const comment = commentOn(map, pId);
    const other: ReviewComment = {
      ...comment,
      location: { ...comment.location, filePath: "about.html" },
    };
    expect(resolveCommentElement(other, map)).toBeNull();
  });

  it("開始タグの先頭を書き換えて要素でなくなった場合は null を返す", () => {
    const comment = commentOn(map, pId);
    const start = comment.location.start;
    const edited = editText(FILE, SOURCE, start, start + 1, "");
    const [moved] = applyChangesToComments([comment], [edited.change]);
    expect(moved?.status).toBe("active");
    const newMap = buildMap(FILE, edited.source, [
      { tagName: "body", outer: edited.source.slice(0, edited.source.indexOf("</body>") + 7) },
      { tagName: "h1", outer: "<h1>Title</h1>" },
    ]);
    expect(resolveCommentElement(moved!, newMap)).toBeNull();
  });
});
