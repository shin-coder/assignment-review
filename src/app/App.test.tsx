// 結合テスト: 各層の実物（解析・編集・コメント・保存・UI）をつなぎ、
// iframe と Service Worker が絡む部分（PreviewFrame・コードエディタ）だけを差し替える
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDirectory, type WriteCall } from "../loader/fakeHandles";
import type { PreviewFrameProps } from "../preview";
import type { ParentToFrameMessage } from "../shared";
import { IndexedDbProjectRepository } from "../store";
import { App } from "./App";
import type { AppDeps } from "./deps";
import { createStore, idOf, INDEX_HTML } from "./testUtils";
import type { ReviewState } from "./reviewController";

// コードエディタ（CodeMirror）は jsdom で動かさず、渡された props を見て onChange を呼べる偽物にする
let editorProps: {
  path: string;
  value: string | ArrayBuffer;
  highlight: { start: number; end: number } | null;
  onChange: (text: string, path: string) => void;
  onCursorChange?: (offset: number) => void;
} | null = null;

vi.mock("../ui/editor", async (importOriginal) => {
  const original = await importOriginal<typeof import("../ui/editor")>();
  return {
    ...original,
    CodeEditor: (props: NonNullable<typeof editorProps>) => {
      editorProps = props;
      return (
        <div
          data-testid="fake-editor"
          data-path={props.path}
          data-highlight={props.highlight ? `${props.highlight.start}-${props.highlight.end}` : ""}
        />
      );
    },
  };
});

function assignFrameRef(
  ref: Ref<HTMLIFrameElement> | undefined,
  element: HTMLIFrameElement | null,
) {
  if (typeof ref === "function") ref(element);
  else if (ref) ref.current = element;
}

let frameProps: PreviewFrameProps | null = null;
function FakePreviewFrame(props: PreviewFrameProps) {
  useLayoutEffect(() => {
    frameProps = props;
  });
  return (
    <iframe
      ref={(element) => assignFrameRef(props.ref, element)}
      title="fake"
      data-testid="fake-iframe"
    />
  );
}

let dbCount = 0;
function createDeps(overrides: Partial<AppDeps> = {}) {
  const posted: ParentToFrameMessage[] = [];
  const repository = new IndexedDbProjectRepository({ dbName: `app-test-${dbCount++}` });
  const deps: AppDeps = {
    repository,
    registerWorker: () => Promise.resolve(),
    clearFiles: vi.fn(() => Promise.resolve()),
    postToFrame: (_iframe, message) => {
      posted.push(message);
      return true;
    },
    pickDirectory: () => Promise.resolve(null),
    isPickerSupported: () => true,
    PreviewFrame: FakePreviewFrame,
    isDev: false,
    autoSaveDelayMs: 10,
    ...overrides,
  };
  return { deps, posted, repository };
}

async function restoreProject(deps: AppDeps) {
  await deps.repository.save(createStore().toSnapshot());
  render(<App deps={deps} />);
  await screen.findByTestId("review-screen");
}

function currentState(): Pick<ReviewState, "tree"> {
  // ツリーの ID は画面の data-layer-id から作る（表示名は label から）
  const rows = [...document.querySelectorAll<HTMLElement>("[data-layer-id]")];
  return {
    tree: rows.map((row) => ({
      id: row.dataset.layerId!,
      label: row.querySelector(".layer-tree__label")!.textContent!,
      children: [],
    })),
  };
}

beforeEach(() => {
  // jsdom には scrollIntoView がない（レイヤーツリーが選択ノードをスクロールする）
  Element.prototype.scrollIntoView = vi.fn();
  editorProps = null;
  frameProps = null;
});
afterEach(cleanup);

function selectFromFrame(id: string, generated = false) {
  const iframe = screen.getByTestId("fake-iframe") as HTMLIFrameElement;
  frameProps!.onMessage!({ type: "review:select", elementId: id, generated }, iframe);
}

describe("起動", () => {
  it("保存済みのプロジェクトがあれば復元して表示する", async () => {
    const { deps } = createDeps();
    const store = createStore();
    store.setEdited("style.css", "h1 { color: green; }");
    store.addComment({
      id: "c1",
      location: {
        filePath: "index.html",
        start: INDEX_HTML.indexOf('<p class="a">'),
        end: INDEX_HTML.indexOf("</p>") + 4,
      },
      body: "復元されるコメント",
      createdAt: 1,
      status: "active",
    });
    await deps.repository.save(store.toSnapshot());
    render(<App deps={deps} />);
    await screen.findByTestId("review-screen");
    expect(frameProps?.entryPath).toBe("index.html");
    expect(frameProps?.sessionId).toBe("project-1");
    expect(frameProps?.files.find((f) => f.path === "style.css")?.content).toBe(
      "h1 { color: green; }",
    );
    expect(screen.getByText("復元されるコメント")).toBeInTheDocument();
    expect(screen.getByTestId("save-status")).toHaveTextContent("保存済み");
  });

  it("保存済みがなければフォルダ選択を促す", async () => {
    const { deps } = createDeps();
    render(<App deps={deps} />);
    expect(await screen.findByText(/フォルダを選んでください/)).toBeInTheDocument();
    expect(screen.queryByTestId("review-screen")).toBeNull();
  });

  it("showDirectoryPicker がないブラウザでは案内を出し、ボタンを無効にする", async () => {
    const { deps } = createDeps({ isPickerSupported: () => false });
    render(<App deps={deps} />);
    expect(await screen.findByTestId("unsupported-browser")).toHaveTextContent("Chrome");
    expect(screen.getByTestId("open-folder")).toBeDisabled();
  });

  it("起動時に Service Worker の登録を 1 回始める（StrictMode でなければ 1 回）", async () => {
    const registerWorker = vi.fn(() => Promise.resolve());
    const { deps } = createDeps({ registerWorker });
    render(<App deps={deps} />);
    await screen.findByText(/フォルダを選んでください/);
    expect(registerWorker).toHaveBeenCalledTimes(1);
  });
});

describe("フォルダの読み込み", () => {
  const tree = {
    "index.html": INDEX_HTML,
    "style.css": "h1 { color: red; }",
    "app.js": "console.log(1);",
  };

  it("選んだフォルダを読み込み、保存し、書き込み系 API を呼ばない", async () => {
    const writeCalls: WriteCall[] = [];
    const handle = createFakeDirectory("student", tree, { writeCalls });
    const { deps, repository } = createDeps({ pickDirectory: () => Promise.resolve(handle) });
    render(<App deps={deps} />);
    fireEvent.click(await screen.findByTestId("open-folder"));
    await screen.findByTestId("review-screen");
    expect(writeCalls).toEqual([]);
    expect(screen.getByText("student")).toBeInTheDocument();
    const saved = await repository.loadLatest();
    expect(saved?.name).toBe("student");
    expect([...saved!.originalFiles.keys()].sort()).toEqual(["app.js", "index.html", "style.css"]);
  });

  it("別のフォルダを選ぶと新しいプロジェクトになり、古いセッションのファイルを消す", async () => {
    let n = 0;
    const handle = () => createFakeDirectory("student", tree);
    const clearFiles = vi.fn(() => Promise.resolve());
    const { deps, repository } = createDeps({
      pickDirectory: () => Promise.resolve(handle()),
      clearFiles,
      createProjectId: () => `id-${++n}`,
    });
    render(<App deps={deps} />);
    fireEvent.click(await screen.findByTestId("open-folder"));
    await waitFor(() => expect(frameProps?.sessionId).toBe("id-1"));
    fireEvent.click(screen.getByTestId("open-folder"));
    await waitFor(() => expect(frameProps?.sessionId).toBe("id-2"));
    expect(clearFiles).toHaveBeenCalledWith("id-1");
    expect((await repository.loadLatest())?.projectId).toBe("id-2");
  });

  it("HTML のないフォルダはエラーを表示する", async () => {
    const handle = createFakeDirectory("empty", { "readme.txt": "x" });
    const { deps } = createDeps({ pickDirectory: () => Promise.resolve(handle) });
    render(<App deps={deps} />);
    fireEvent.click(await screen.findByTestId("open-folder"));
    expect(await screen.findByTestId("app-error")).toHaveTextContent("HTML");
  });

  it("キャンセルしても何も起きない", async () => {
    const { deps } = createDeps();
    render(<App deps={deps} />);
    fireEvent.click(await screen.findByTestId("open-folder"));
    await waitFor(() => expect(screen.getByTestId("open-folder")).toBeEnabled());
    expect(screen.queryByTestId("app-error")).toBeNull();
  });
});

describe("選択の連動", () => {
  it("iframe の review:select でツリーの選択とエディタの強調が更新される", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    const id = idOf(currentState(), "p.a");
    selectFromFrame(id);
    await waitFor(() =>
      expect(screen.getByTestId(`layer-node-${id}`)).toHaveAttribute("aria-selected", "true"),
    );
    const start = INDEX_HTML.indexOf('<p class="a">');
    expect(screen.getByTestId("fake-editor")).toHaveAttribute(
      "data-highlight",
      `${start}-${INDEX_HTML.indexOf("</p>", start) + 4}`,
    );
    expect(posted).toContainEqual({ type: "review:highlight", elementId: id });
  });

  it("JS 生成要素は祖先を選んで案内を出し、コメント入力を無効にする", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    const bodyId = idOf(currentState(), "body");
    selectFromFrame(bodyId, true);
    expect(await screen.findByTestId("generated-notice")).toHaveTextContent(
      "JS が生成した要素は編集・コメントの対象外",
    );
    expect(screen.getByRole("textbox", { name: "コメント" })).toBeDisabled();
    expect(screen.getByTestId(`layer-node-${bodyId}`)).toHaveAttribute("aria-selected", "true");
  });

  it("エディタのカーソル移動でツリーが選択される", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    editorProps!.onCursorChange!(INDEX_HTML.indexOf("second") + 1);
    const id = idOf(currentState(), "p.b");
    await waitFor(() =>
      expect(screen.getByTestId(`layer-node-${id}`)).toHaveAttribute("aria-selected", "true"),
    );
  });
});

describe("編集の反映", () => {
  it("CSS の編集: putFiles に渡すファイルが更新され、replace-css を送り、iframe は作り直さない", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    const filesBefore = frameProps!.files;
    const keyBefore = frameProps!.rebuildKey;
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    await waitFor(() => expect(frameProps!.files).not.toBe(filesBefore));
    expect(frameProps!.files.find((f) => f.path === "style.css")?.content).toBe(
      "h1 { color: blue; }",
    );
    expect(frameProps!.rebuildKey).toBe(keyBefore);
    expect(posted).toContainEqual({
      type: "review:replace-css",
      path: "style.css",
      text: "h1 { color: blue; }",
    });
  });

  it("JS の編集: iframe を作り直し、HTML/CSS の編集後ソースが送るファイルに入っている", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    editorProps!.onChange(INDEX_HTML.replace("title", "edited"), "index.html");
    const key = frameProps!.rebuildKey;
    editorProps!.onChange("console.log(2);", "app.js");
    await waitFor(() => expect(frameProps!.rebuildKey).toBe((key as number) + 1));
    const content = (path: string) => frameProps!.files.find((f) => f.path === path)?.content;
    expect(content("app.js")).toBe("console.log(2);");
    expect(content("style.css")).toBe("h1 { color: blue; }");
    expect(content("index.html")).toContain("edited");
    expect(content("index.html")).toContain("data-review-id");
  });

  it("エディタの変更は渡された path で振り分ける", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    // 現在のタブは index.html のまま、別ファイル（切り替え前のファイル）の変更が届く
    editorProps!.onChange("console.log(9);", "app.js");
    await waitFor(async () =>
      expect((await repository.loadLatest())?.editedTexts).toEqual({ "app.js": "console.log(9);" }),
    );
  });

  it("要素の前に要素を足す編集をしても、コメントが同じ要素を指す", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    selectFromFrame(idOf(currentState(), "p.b"));
    fireEvent.change(await screen.findByRole("textbox", { name: "コメント" }), {
      target: { value: "ここ" },
    });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "コメント" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "コメントを追加" }));
    await screen.findByText("ここ");

    editorProps!.onChange(
      INDEX_HTML.replace('<p class="b">', '<p class="new">n</p><p class="b">'),
      "index.html",
    );
    const id = idOf(currentState(), "p.b");
    await waitFor(() =>
      expect(screen.getByTestId(`layer-node-${id}`)).toHaveAttribute("data-commented", "true"),
    );
    expect(document.querySelectorAll('[data-commented="true"]')).toHaveLength(1);
  });

  it("編集は自動保存され、保存状態が表示される", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("保存中"));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("保存済み"));
    expect((await repository.loadLatest())?.editedTexts["style.css"]).toBe("h1 { color: blue; }");
  });

  it("保存に失敗したら「保存失敗」を表示する", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    vi.spyOn(repository, "save").mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("保存失敗"));
  });
});

describe("リセットと削除", () => {
  it("すべての編集を元に戻す", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    fireEvent.click(screen.getByTestId("reset-all"));
    fireEvent.click(screen.getByTestId("reset-all-confirm"));
    await waitFor(() =>
      expect(frameProps!.files.find((f) => f.path === "style.css")?.content).toBe(
        "h1 { color: red; }",
      ),
    );
    await waitFor(async () => expect((await repository.loadLatest())?.editedTexts).toEqual({}));
  });

  it("プロジェクトを削除すると保存も消え、セッションのファイルを消す", async () => {
    const clearFiles = vi.fn(() => Promise.resolve());
    const { deps, repository } = createDeps({ clearFiles });
    await restoreProject(deps);
    fireEvent.click(screen.getByTestId("delete-project"));
    fireEvent.click(screen.getByTestId("delete-project-confirm"));
    await screen.findByText(/フォルダを選んでください/);
    expect(clearFiles).toHaveBeenCalledWith("project-1");
    expect(await repository.loadLatest()).toBeNull();
    expect(await repository.list()).toEqual([]);
  });
});
