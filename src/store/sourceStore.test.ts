import { describe, expect, it, vi } from "vitest";
import { SourceStore, type SourceStoreChange } from "./sourceStore";
import { createComment, createFiles, PNG_BYTES } from "./testData";

function createStore(now: () => number = () => 1000) {
  return new SourceStore({
    projectId: "p1",
    name: "student-site",
    originalFiles: createFiles(),
    now,
  });
}

describe("SourceStore: ソース", () => {
  it("未編集のファイルは getEdited が元のソースを返す", () => {
    const store = createStore();

    expect(store.getEdited("index.html")).toBe("<h1>トップ</h1>");
    expect(store.getEdited("css/style.css")).toBe(store.getOriginal("css/style.css"));
    expect(new Uint8Array(store.getEdited("images/hero.png") as ArrayBuffer)).toEqual(PNG_BYTES);
    expect(store.isEdited("index.html")).toBe(false);
    expect(store.editedPaths()).toEqual([]);
  });

  it("存在しないパスは undefined を返す", () => {
    const store = createStore();

    expect(store.hasFile("nope.html")).toBe(false);
    expect(store.getOriginal("nope.html")).toBeUndefined();
    expect(store.getEdited("nope.html")).toBeUndefined();
  });

  it("setEdited で編集後のソースが変わり、元のソースは変わらない", () => {
    const store = createStore();

    store.setEdited("css/style.css", "h1 { color: blue; }");

    expect(store.getEdited("css/style.css")).toBe("h1 { color: blue; }");
    expect(store.getOriginal("css/style.css")).toBe("h1 { color: red; }");
    expect(store.toSnapshot().originalFiles.get("css/style.css")?.content).toBe(
      "h1 { color: red; }",
    );
    expect(store.isEdited("css/style.css")).toBe(true);
    expect(store.editedPaths()).toEqual(["css/style.css"]);
  });

  it("渡した Map を後で変えても元のソースは変わらない", () => {
    const files = createFiles();
    const store = new SourceStore({ projectId: "p1", name: "s", originalFiles: files });

    files.set("index.html", { path: "index.html", mimeType: "text/html", content: "差し替え" });
    files.delete("css/style.css");

    expect(store.getOriginal("index.html")).toBe("<h1>トップ</h1>");
    expect(store.hasFile("css/style.css")).toBe(true);
  });

  it("スナップショットの originalFiles とその中身は書き換えられない", () => {
    const { originalFiles } = createStore().toSnapshot();
    const file = originalFiles.get("index.html");

    expect(() =>
      originalFiles.set("index.html", { path: "index.html", mimeType: "text/html", content: "" }),
    ).toThrow("変更できません");
    expect(() => originalFiles.delete("index.html")).toThrow("変更できません");
    expect(() => originalFiles.clear()).toThrow("変更できません");
    expect(Object.isFrozen(file)).toBe(true);
    expect(originalFiles.size).toBe(4);
  });

  it("元と同じ内容を設定すると未編集に戻る", () => {
    const store = createStore();

    store.setEdited("index.html", "<h1>変更</h1>");
    store.setEdited("index.html", "<h1>トップ</h1>");

    expect(store.isEdited("index.html")).toBe(false);
    expect(store.editedPaths()).toEqual([]);
  });

  it("存在しないファイル・バイナリのファイルは編集できない", () => {
    const store = createStore();

    expect(() => store.setEdited("nope.html", "")).toThrow("存在しないファイル");
    expect(() => store.setEdited("images/hero.png", "")).toThrow("テキストではない");
  });

  it("resetFile でそのファイルだけ元に戻る", () => {
    const store = createStore();
    store.setEdited("index.html", "<h1>変更</h1>");
    store.setEdited("css/style.css", "h1 {}");

    store.resetFile("index.html");

    expect(store.getEdited("index.html")).toBe("<h1>トップ</h1>");
    expect(store.isEdited("index.html")).toBe(false);
    expect(store.getEdited("css/style.css")).toBe("h1 {}");
  });

  it("resetAll ですべて元に戻り、コメントは残る", () => {
    const store = createStore();
    store.setEdited("index.html", "<h1>変更</h1>");
    store.setEdited("js/main.js", "console.log(2);");
    store.addComment(createComment("c1"));

    store.resetAll();

    expect(store.editedPaths()).toEqual([]);
    expect(store.getEdited("index.html")).toBe("<h1>トップ</h1>");
    expect(store.getEdited("js/main.js")).toBe("console.log(1);");
    expect(store.getComments()).toHaveLength(1);
  });

  it("currentFiles は編集後の内容を反映し、読み込み順を保つ", () => {
    const store = createStore();
    store.setEdited("css/style.css", "h1 {}");

    const files = store.currentFiles();

    expect(files.map((file) => file.path)).toEqual(store.paths());
    expect(files.find((file) => file.path === "css/style.css")).toEqual({
      path: "css/style.css",
      mimeType: "text/css",
      content: "h1 {}",
    });
    expect(store.getOriginal("css/style.css")).toBe("h1 { color: red; }");
  });

  it("復元時の editedTexts のうち、存在しない・バイナリ・元と同じものは捨てる", () => {
    const store = new SourceStore({
      projectId: "p1",
      name: "s",
      originalFiles: createFiles(),
      editedTexts: {
        "index.html": "<h1>変更</h1>",
        "css/style.css": "h1 { color: red; }",
        "images/hero.png": "x",
        "gone.html": "x",
      },
    });

    expect(store.editedPaths()).toEqual(["index.html"]);
  });
});

describe("SourceStore: コメント", () => {
  it("追加・更新・削除・一覧ができる", () => {
    const store = createStore();

    store.addComment(createComment("c1"));
    store.addComment(createComment("c2"));
    store.updateComment("c1", { body: "直した", status: "orphaned" });
    store.removeComment("c2");

    expect(store.getComments()).toEqual([
      { ...createComment("c1"), body: "直した", status: "orphaned" },
    ]);
    expect(store.getComment("c1")?.body).toBe("直した");
    expect(store.getComment("c2")).toBeUndefined();
  });

  it("同じ id の追加・存在しない id の更新は例外になり、存在しない id の削除は何もしない", () => {
    const store = createStore();
    store.addComment(createComment("c1"));
    const listener = vi.fn();
    store.subscribe(listener);

    expect(() => store.addComment(createComment("c1"))).toThrow("同じ id");
    expect(() => store.updateComment("nope", { body: "" })).toThrow("存在しないコメント");
    store.removeComment("nope");

    expect(listener).not.toHaveBeenCalled();
  });

  it("渡したコメントを後で書き換えても保持している内容は変わらない", () => {
    const store = createStore();
    const comment = createComment("c1");

    store.addComment(comment);
    comment.body = "書き換え";
    comment.location.start = 99;

    expect(store.getComment("c1")?.body).toBe("コメント c1");
    expect(store.getComment("c1")?.location.start).toBe(0);
  });

  it("replaceComments でまとめて置き換える", () => {
    const store = createStore();
    store.addComment(createComment("c1"));

    store.replaceComments([createComment("c2"), createComment("c3")]);

    expect(store.getComments().map((comment) => comment.id)).toEqual(["c2", "c3"]);
  });
});

describe("SourceStore: 購読とスナップショット", () => {
  it("変更があると種類つきで通知し、購読をやめると通知しない", () => {
    const store = createStore();
    const changes: SourceStoreChange[] = [];
    const unsubscribe = store.subscribe((change) => changes.push(change));

    store.setEdited("index.html", "a");
    store.setEdited("index.html", "a"); // 同じ内容は通知しない
    store.addComment(createComment("c1"));
    store.resetAll();
    store.resetAll(); // 編集がなければ通知しない
    store.resetFile("index.html");
    unsubscribe();
    store.setEdited("index.html", "b");

    expect(changes).toEqual([
      { type: "edit", paths: ["index.html"] },
      { type: "comments" },
      { type: "edit", paths: ["index.html"] },
    ]);
  });

  it("toSnapshot は変更までは同じオブジェクトを返し、変更後は新しい内容を返す", () => {
    let now = 1000;
    const store = createStore(() => now);
    const first = store.toSnapshot();

    expect(store.toSnapshot()).toBe(first);

    now = 2000;
    store.setEdited("index.html", "a");
    store.addComment(createComment("c1"));
    const second = store.toSnapshot();

    expect(second).not.toBe(first);
    expect(second).toMatchObject({
      projectId: "p1",
      name: "student-site",
      editedTexts: { "index.html": "a" },
      comments: [createComment("c1")],
      updatedAt: 2000,
    });
    expect(second.originalFiles).toBe(first.originalFiles);
    expect(first.editedTexts).toEqual({});
    expect(first.updatedAt).toBe(1000);
  });

  it("fromSnapshot で同じ内容を復元する", () => {
    const store = createStore();
    store.setEdited("js/main.js", "console.log(2);");
    store.addComment(createComment("c1"));

    const restored = SourceStore.fromSnapshot(store.toSnapshot());

    expect(restored.toSnapshot()).toEqual(store.toSnapshot());
  });
});
