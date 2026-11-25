import { describe, expect, it, vi } from "vitest";
import { resolveCommentElement } from "../comments";
import type { ParentToFrameMessage } from "../shared";
import { SourceStore } from "../store";
import { GENERATED_NOTICE, ReviewController } from "./reviewController";
import { analyzePage } from "./previewFiles";
import { createStore, idOf, INDEX_HTML } from "./testUtils";

function setup() {
  const store = createStore();
  const controller = new ReviewController({ store, isDev: false });
  const sent: ParentToFrameMessage[] = [];
  controller.attachFrame((message) => sent.push(message));
  return { store, controller, sent };
}

describe("選択の連動", () => {
  it("iframe の review:select で、ツリーの選択・エディタの強調・iframe の枠が更新される", () => {
    const { controller, sent } = setup();
    const pId = idOf(controller.getState(), "p.a");
    controller.handleFrameMessage({ type: "review:select", elementId: pId, generated: false });
    const state = controller.getState();
    expect(state.selectedId).toBe(pId);
    expect(state.selectedLabel).toBe("p.a");
    expect(state.activePath).toBe("index.html");
    const start = INDEX_HTML.indexOf('<p class="a">');
    expect(state.highlight).toEqual({
      filePath: "index.html",
      start,
      end: INDEX_HTML.indexOf("</p>", start) + 4,
    });
    expect(sent).toContainEqual({ type: "review:highlight", elementId: pId });
  });

  it("レイヤーツリーの選択は iframe に review:highlight を送る", () => {
    const { controller, sent } = setup();
    const id = idOf(controller.getState(), "h1");
    controller.selectFromTree(id);
    expect(sent.at(-1)).toEqual({ type: "review:highlight", elementId: id });
    expect(controller.getState().highlight).not.toBeNull();
  });

  it("エディタのカーソル移動で要素が選ばれる（エディタの強調は出さない）", () => {
    const { controller, sent } = setup();
    controller.cursorMoved("index.html", INDEX_HTML.indexOf("second") + 1);
    const state = controller.getState();
    expect(state.selectedId).toBe(idOf(state, "p.b"));
    expect(state.highlight).toBeNull();
    expect(sent.at(-1)).toEqual({ type: "review:highlight", elementId: state.selectedId });
  });

  it("JS 生成要素は祖先を選び、案内を出してコメントを無効にする", () => {
    const { controller } = setup();
    const bodyId = idOf(controller.getState(), "body");
    controller.handleFrameMessage({ type: "review:select", elementId: bodyId, generated: true });
    const state = controller.getState();
    expect(state.selectedId).toBe(bodyId);
    expect(state.generatedNotice).toBe(GENERATED_NOTICE);
    expect(state.commentDisabledReason).toBe(GENERATED_NOTICE);
    expect(controller.addComment("x").ok).toBe(true); // 暗黙でない body には作れてしまうため、画面側で無効にする
  });

  it("review:ready で選択の枠を付け直す", () => {
    const { controller, sent } = setup();
    const id = idOf(controller.getState(), "h1");
    controller.selectFromTree(id);
    sent.length = 0;
    controller.handleFrameMessage({ type: "review:ready" });
    expect(sent).toContainEqual({ type: "review:highlight", elementId: id });
  });
});

describe("編集の反映", () => {
  it("CSS の編集: ソースとファイルを更新して replace-css を送り、iframe は作り直さない", () => {
    const { store, controller, sent } = setup();
    const before = controller.getState();
    controller.editFile("style.css", "h1 { color: blue; }");
    const state = controller.getState();
    expect(store.getEdited("style.css")).toBe("h1 { color: blue; }");
    expect(state.previewFiles).not.toBe(before.previewFiles);
    expect(state.previewFiles.find((f) => f.path === "style.css")?.content).toBe(
      "h1 { color: blue; }",
    );
    expect(state.rebuildKey).toBe(before.rebuildKey);
    expect(sent).toContainEqual({
      type: "review:replace-css",
      path: "style.css",
      text: "h1 { color: blue; }",
    });
  });

  it("JS の編集: rebuildKey が増え、HTML/CSS の編集後ソースも previewFiles に入る", () => {
    const { controller, sent } = setup();
    controller.editFile("style.css", "h1 { color: blue; }");
    const html = INDEX_HTML.replace("title", "changed");
    controller.editFile("index.html", html);
    const key = controller.getState().rebuildKey;
    controller.editFile("app.js", "console.log(2);");
    const state = controller.getState();
    expect(state.rebuildKey).toBe(key + 1);
    const content = (path: string) => state.previewFiles.find((f) => f.path === path)?.content;
    expect(content("app.js")).toBe("console.log(2);");
    expect(content("style.css")).toBe("h1 { color: blue; }");
    expect(content("index.html")).toContain("changed");
    expect(sent.some((m) => m.type === "review:replace-css" && m.text === "console.log(2);")).toBe(
      false,
    );
  });

  it("HTML の中身の編集: replace-element で即時反映し、作り直さない", () => {
    const { controller, sent } = setup();
    const before = controller.getState();
    controller.editFile("index.html", INDEX_HTML.replace("first", "1st"));
    const state = controller.getState();
    expect(state.rebuildKey).toBe(before.rebuildKey);
    const message = sent.find((m) => m.type === "review:replace-element");
    expect(message).toMatchObject({ elementId: idOf(state, "p.a") });
    expect(message?.type === "review:replace-element" && message.html).toBe(
      `<p data-review-id="${idOf(state, "p.a")}" class="a">1st</p>`,
    );
  });

  it("HTML の構造が変わる編集は iframe を作り直す", () => {
    const { controller } = setup();
    const before = controller.getState();
    controller.editFile("index.html", INDEX_HTML.replace("<h1>", "<h2>x</h2><h1>"));
    expect(controller.getState().rebuildKey).toBe(before.rebuildKey + 1);
  });

  it("エディタの変更は path で振り分ける（別ファイルの変更が現在のファイルに入らない）", () => {
    const { store, controller } = setup();
    controller.openFile("style.css");
    controller.editFile("app.js", "console.log(3);");
    expect(store.getEdited("app.js")).toBe("console.log(3);");
    expect(store.getEdited("style.css")).toBe("h1 { color: red; }");
    expect(controller.getState().activePath).toBe("style.css");
  });

  it("変更のない通知は何もしない", () => {
    const { controller } = setup();
    const before = controller.getState();
    controller.editFile("style.css", "h1 { color: red; }");
    expect(controller.getState()).toBe(before);
  });

  it("バイナリや存在しないファイルは無視する", () => {
    const { controller } = setup();
    const before = controller.getState();
    controller.editFile("missing.css", "x");
    expect(controller.getState()).toBe(before);
  });
});

describe("コメント", () => {
  function commentOnP(controller: ReviewController, cls: string, body = "メモ") {
    controller.selectFromTree(idOf(controller.getState(), `p.${cls}`));
    const result = controller.addComment(body);
    expect(result.ok).toBe(true);
  }

  it("選択中の要素にコメントを付け、一覧・ツリーの目印・ラベルに反映される", () => {
    const { store, controller } = setup();
    commentOnP(controller, "b");
    const state = controller.getState();
    expect(store.getComments()).toHaveLength(1);
    expect(state.commentedIds.has(idOf(state, "p.b"))).toBe(true);
    const id = state.comments[0]!.id;
    expect(state.commentLabels[id]).toBe("p.b");
    expect(state.activeCommentId).toBe(id);
  });

  it("要素の前に要素を挿入しても、コメントは同じ要素を指す", () => {
    const { store, controller } = setup();
    commentOnP(controller, "b");
    const edited = INDEX_HTML.replace('<p class="b">', '<p class="new">n</p><p class="b">');
    controller.editFile("index.html", edited);
    const comment = store.getComments()[0]!;
    expect(comment.status).toBe("active");
    const map = analyzePage("index.html", edited, false).analysis.map;
    const id = resolveCommentElement(comment, map)!;
    expect(map.get(id)?.tagName).toBe("p");
    expect(edited.slice(comment.location.start, comment.location.end)).toBe(
      '<p class="b">second</p>',
    );
  });

  it("要素の前にテキストを追加しても、コメントの位置が追従する", () => {
    const { store, controller } = setup();
    commentOnP(controller, "a");
    controller.editFile("index.html", INDEX_HTML.replace("<h1>title", "<h1>long long title"));
    const comment = store.getComments()[0]!;
    expect(controller.getState().commentedIds.has(idOf(controller.getState(), "p.a"))).toBe(true);
    expect(comment.status).toBe("active");
  });

  it("要素を削除すると orphaned になり、選んでもエラーにならない", () => {
    const { controller } = setup();
    commentOnP(controller, "b");
    controller.editFile("index.html", INDEX_HTML.replace('<p class="b">second</p>', ""));
    const state = controller.getState();
    expect(state.comments[0]?.status).toBe("orphaned");
    controller.selectComment(state.comments[0]!.id);
    expect(controller.getState().selectedId).toBeNull();
    expect(controller.getState().highlight).not.toBeNull();
  });

  it("コメントを選ぶと要素の選択に連動する", () => {
    const { controller, sent } = setup();
    commentOnP(controller, "b");
    controller.selectFromTree(idOf(controller.getState(), "h1"));
    controller.selectComment(controller.getState().comments[0]!.id);
    expect(controller.getState().selectedId).toBe(idOf(controller.getState(), "p.b"));
    expect(sent.at(-1)).toMatchObject({ type: "review:highlight" });
  });

  it("要素を選んでいないとき・本文が空のときは作れない", () => {
    const { store, controller } = setup();
    expect(controller.addComment("x").ok).toBe(false);
    controller.selectFromTree(idOf(controller.getState(), "h1"));
    expect(controller.addComment("  ").ok).toBe(false);
    expect(store.getComments()).toHaveLength(0);
  });

  it("更新と削除", () => {
    const { store, controller } = setup();
    commentOnP(controller, "a");
    const id = store.getComments()[0]!.id;
    controller.updateComment(id, "新しい本文");
    expect(controller.getState().comments[0]?.body).toBe("新しい本文");
    controller.deleteComment(id);
    expect(store.getComments()).toHaveLength(0);
  });
});

describe("すべての編集を元に戻す", () => {
  it("編集を消し、コメントは残して位置を元のソースに追従させる", () => {
    const { store, controller } = setup();
    controller.editFile("index.html", INDEX_HTML.replace("<h1>title", "<h1>long long title"));
    controller.selectFromTree(idOf(controller.getState(), "p.b"));
    controller.addComment("残る");
    controller.editFile("style.css", "x{}");
    const key = controller.getState().rebuildKey;

    controller.resetAll();
    expect(store.editedPaths()).toEqual([]);
    const comment = store.getComments()[0]!;
    expect(INDEX_HTML.slice(comment.location.start, comment.location.end)).toBe(
      '<p class="b">second</p>',
    );
    expect(controller.getState().rebuildKey).toBe(key + 1);
    expect(controller.getState().previewFiles.find((f) => f.path === "style.css")?.content).toBe(
      "h1 { color: red; }",
    );
  });
});

describe("ページの切り替え", () => {
  function twoPages() {
    const store = createStore();
    // 2 ページ目を足した別ストア
    const files = new Map(store.toSnapshot().originalFiles);
    files.set("about.html", { path: "about.html", mimeType: "text/html", content: "<p>about</p>" });
    return new ReviewController({
      store: new SourceStore({
        projectId: "p2",
        name: "n",
        originalFiles: files,
      }),
      isDev: false,
    });
  }

  it("iframe のリンク移動を追従し、選択をクリアする", () => {
    const controller = twoPages();
    controller.selectFromTree(idOf(controller.getState(), "h1"));
    const key = controller.getState().rebuildKey;
    controller.notifyFramePath("p2", "/__preview__/p2/about.html");
    const state = controller.getState();
    expect(state.currentPage).toBe("about.html");
    expect(state.selectedId).toBeNull();
    expect(state.rebuildKey).toBe(key); // 作り直さない
  });

  it("openPage は iframe を開き直す", () => {
    const controller = twoPages();
    const key = controller.getState().rebuildKey;
    controller.openPage("about.html");
    expect(controller.getState()).toMatchObject({
      currentPage: "about.html",
      entryPath: "about.html",
      rebuildKey: key + 1,
    });
  });

  it("別セッションや未知のパスは無視する", () => {
    const controller = twoPages();
    const before = controller.getState();
    controller.notifyFramePath("p2", "/__preview__/other/about.html");
    controller.notifyFramePath("p2", "/__preview__/p2/none.html");
    expect(controller.getState()).toBe(before);
  });
});

describe("購読", () => {
  it("状態が変わると通知する", () => {
    const { controller } = setup();
    const listener = vi.fn();
    const off = controller.subscribe(listener);
    controller.setHovered("1");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    controller.setHovered("2");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("モードの切り替え", () => {
  it("最初は View mode。切り替えると iframe にモードを送る", () => {
    const { controller, sent } = setup();
    expect(controller.getState().tool).toBe("browse");
    controller.setTool("dev");
    expect(controller.getState().tool).toBe("dev");
    expect(sent).toContainEqual({ type: "review:mode", mode: "inspect" });
    controller.setTool("browse");
    expect(sent).toContainEqual({ type: "review:mode", mode: "browse" });
  });

  it("review:ready でモードと選択の枠を送り直す", () => {
    const { controller, sent } = setup();
    controller.setTool("dev");
    const id = idOf(controller.getState(), "p.a");
    controller.selectFromTree(id);
    sent.length = 0;
    controller.handleFrameMessage({ type: "review:ready" });
    expect(sent).toContainEqual({ type: "review:mode", mode: "inspect" });
    expect(sent).toContainEqual({ type: "review:highlight", elementId: id });
  });

  it("clearSelection で選択を外す", () => {
    const { controller, sent } = setup();
    controller.selectFromTree(idOf(controller.getState(), "p.a"));
    controller.clearSelection();
    expect(controller.getState().selectedId).toBeNull();
    expect(sent.at(-1)).toEqual({ type: "review:highlight", elementId: null });
  });
});

describe("選んだ要素に当たっている CSS ルール", () => {
  const rule = { path: "style.css", selector: "h1", media: null, occurrence: 0, cssText: "h1 {}" };

  it("プレビューで選んだときに iframe から届いたルールを持つ", () => {
    const { controller } = setup();
    const id = idOf(controller.getState(), "h1");
    controller.handleFrameMessage({
      type: "review:select",
      elementId: id,
      generated: false,
      rules: [rule],
    });
    expect(controller.getState().selectedRules).toEqual([rule]);
  });

  it("別の方法で選び直したり、選択を外したりすると空になる", () => {
    const { controller } = setup();
    const id = idOf(controller.getState(), "h1");
    controller.handleFrameMessage({
      type: "review:select",
      elementId: id,
      generated: false,
      rules: [rule],
    });
    controller.selectFromTree(idOf(controller.getState(), "p.a"));
    expect(controller.getState().selectedRules).toEqual([]);
    controller.handleFrameMessage({
      type: "review:select",
      elementId: id,
      generated: false,
      rules: [rule],
    });
    controller.clearSelection();
    expect(controller.getState().selectedRules).toEqual([]);
  });
});

describe("選択中の要素のソース範囲と selectionSeq", () => {
  it("選ぶと selectedLocation が入り、selectionSeq が増える", () => {
    const { controller } = setup();
    const seq = controller.getState().selectionSeq;
    controller.selectFromTree(idOf(controller.getState(), "p.a"));
    const state = controller.getState();
    const start = INDEX_HTML.indexOf('<p class="a">');
    expect(state.selectedLocation).toEqual({
      filePath: "index.html",
      start,
      end: INDEX_HTML.indexOf("</p>", start) + 4,
    });
    expect(state.selectionSeq).toBe(seq + 1);
  });

  it("HTML の編集では selectionSeq が変わらない", () => {
    const { controller } = setup();
    controller.selectFromTree(idOf(controller.getState(), "p.b"));
    const seq = controller.getState().selectionSeq;
    controller.editFile("index.html", INDEX_HTML.replace("second", "second!"));
    expect(controller.getState().selectionSeq).toBe(seq);
    expect(controller.getState().selectedLabel).toBe("p.b");
  });

  it("JS 生成要素を選んだときは selectedLocation が null", () => {
    const { controller } = setup();
    const bodyId = idOf(controller.getState(), "body");
    controller.handleFrameMessage({ type: "review:select", elementId: bodyId, generated: true });
    expect(controller.getState().selectedLocation).toBeNull();
  });
});
