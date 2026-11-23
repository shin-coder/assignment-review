// 結合テスト: 各層の実物（解析・編集・コメント・保存・UI）をつなぎ、
// iframe と Service Worker が絡む部分（PreviewFrame・コードエディタ）だけを差し替える
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useLayoutEffect, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDirectory, type WriteCall } from "../loader/fakeHandles";
import type { PreviewFrameProps } from "../preview";
import type { ParentToFrameMessage } from "../shared";
import { IndexedDbProjectRepository } from "../store";
import { App } from "./App";
import type { AppDeps } from "./deps";
import { analyzePage } from "./previewFiles";
import { createStore, idOf, INDEX_HTML } from "./testUtils";

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
  // 画面は act の外（IndexedDB の読み込みの後）で描かれるため、購読などの effect を流し切ってから操作する
  await act(async () => {});
}

/** HTML を解析した要素の ID（プレビューに付く data-review-id と同じ） */
function idIn(html: string, prefix: string): string {
  return idOf({ tree: analyzePage("index.html", html, false).analysis.tree }, prefix);
}

function chooseTool(tool: "browse" | "comment" | "dev") {
  fireEvent.click(screen.getByTestId(`tool-${tool}`));
  expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", tool);
}

/** 開発モードの「ファイル」を開き、エディタ（偽物）が出るのを待つ */
async function openFileView() {
  chooseTool("dev");
  fireEvent.click(screen.getByTestId("dev-view-file"));
  await screen.findByTestId("fake-editor");
}

function openMenu() {
  fireEvent.click(screen.getByTestId("project-menu"));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
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
    await act(async () => {});
    expect(frameProps?.entryPath).toBe("index.html");
    expect(frameProps?.sessionId).toBe("project-1");
    expect(frameProps?.files.find((f) => f.path === "style.css")?.content).toBe(
      "h1 { color: green; }",
    );
    chooseTool("comment");
    expect(screen.getByText("復元されるコメント")).toBeInTheDocument();
    expect(screen.getByTestId("save-status")).toHaveTextContent("保存済み");
  });

  it("保存済みがなければフォルダ選択を促す", async () => {
    const { deps } = createDeps();
    render(<App deps={deps} />);
    expect(await screen.findByText(/フォルダを選んでください/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "生徒サイト レビューツール" })).toBeInTheDocument();
    expect(screen.queryByTestId("review-screen")).toBeNull();
  });

  it("レビュー画面にはヘッダーもレイヤーツリーも出さず、パネルはモードに応じて出す", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("tree")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    chooseTool("comment");
    expect(screen.getByRole("complementary", { name: "コメント" })).toBeInTheDocument();
    chooseTool("dev");
    expect(screen.getByRole("complementary", { name: "開発" })).toBeInTheDocument();
    chooseTool("browse");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("プレビューの幅を PC / タブレット / モバイルで切り替える", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    const device = () => document.querySelector<HTMLElement>(".device")!;
    expect(device().dataset.device).toBe("pc");
    expect(document.querySelector<HTMLElement>(".device-viewport")!.style.width).toBe("1440px");
    fireEvent.click(screen.getByTestId("device-mobile"));
    expect(device().dataset.device).toBe("mobile");
    expect(document.querySelector<HTMLElement>(".device-viewport")!.style.width).toBe("390px");
    fireEvent.click(screen.getByTestId("device-tablet"));
    expect(document.querySelector<HTMLElement>(".device-viewport")!.style.width).toBe("768px");
  });

  it("V / C / D キーでツールを切り替える（入力欄の中では切り替えない）", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", "comment");
    expect(posted).toContainEqual({ type: "review:mode", mode: "inspect" });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", "dev");
    fireEvent.keyDown(window, { key: "v" });
    expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", "browse");

    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.a"));
    const textbox = await screen.findByRole("textbox", { name: "コメント" });
    fireEvent.keyDown(textbox, { key: "d" });
    expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", "comment");
  });

  it("iframe から転送されたキーでもツールを切り替える", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    const iframe = screen.getByTestId("fake-iframe") as HTMLIFrameElement;
    act(() => frameProps!.onMessage!({ type: "review:key", key: "d" }, iframe));
    expect(screen.getByTestId("review-screen")).toHaveAttribute("data-tool", "dev");
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
    openMenu();
    fireEvent.click(screen.getByTestId("menu-open-folder"));
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
  it("開発モードで iframe の要素を選ぶと、その要素のコードだけを出し、iframe に枠を送る", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    chooseTool("dev");
    const id = idIn(INDEX_HTML, "p.a");
    selectFromFrame(id);
    await waitFor(() => expect(editorProps?.value).toBe('<p class="a">first</p>'));
    expect(screen.getByTestId("element-code")).toBeInTheDocument();
    expect(screen.getByText("p.a")).toBeInTheDocument();
    expect(posted).toContainEqual({ type: "review:highlight", elementId: id });
  });

  it("要素のコードを編集すると、ファイル全体のその部分だけが置き換わる", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    chooseTool("dev");
    selectFromFrame(idIn(INDEX_HTML, "p.b"));
    await waitFor(() => expect(editorProps?.value).toBe('<p class="b">second</p>'));
    act(() => editorProps!.onChange('<p class="b">2nd</p>', "index.html"));
    const expected = INDEX_HTML.replace("second", "2nd");
    await waitFor(() =>
      expect(frameProps!.files.find((f) => f.path === "index.html")?.content).toContain("2nd"),
    );
    // 続けて編集しても、同じ要素の範囲に入る
    act(() => editorProps!.onChange('<p class="b">two</p>', "index.html"));
    await waitFor(() => expect(editorProps?.value).toBe('<p class="b">two</p>'));
    fireEvent.click(screen.getByTestId("dev-view-file"));
    await waitFor(() => expect(editorProps?.value).toBe(expected.replace("2nd", "two")));
  });

  it("コメントモードで要素を選ぶと入力欄が出る。JS 生成要素も祖先に紐付けてコメントできる", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.a"));
    const composer = await screen.findByTestId("comment-composer");
    // 要素名（タグ名）は出さない
    expect(composer).not.toHaveTextContent("p.a");
    expect(screen.getByRole("textbox", { name: "コメント" })).toBeEnabled();
    // キャンセル・追加のボタンはなく、送信ボタン 1 つだけ
    expect(screen.queryByRole("button", { name: "キャンセル" })).toBeNull();

    // JS 生成要素も、ソースにある祖先に紐付けてそのままコメントできる（案内は出さない）
    selectFromFrame(idIn(INDEX_HTML, "p.b"), true);
    expect(screen.queryByTestId("generated-notice")).toBeNull();
    expect(screen.getByRole("textbox", { name: "コメント" })).toBeEnabled();
  });

  it("Enter でコメントを送信し、Shift + Enter では送信しない", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.a"));
    const textbox = await screen.findByRole("textbox", { name: "コメント" });
    fireEvent.change(textbox, { target: { value: "一行目" } });
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });
    expect(screen.queryByRole("list", { name: "コメント一覧" })).toBeNull();
    fireEvent.keyDown(textbox, { key: "Enter" });
    const list = await screen.findByRole("list", { name: "コメント一覧" });
    expect(list).toHaveTextContent("一行目");
    await waitFor(async () =>
      expect((await repository.loadLatest())?.comments[0]?.body).toBe("一行目"),
    );
  });

  it("一覧の「…」から削除できる（一覧では編集できない）", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.a"));
    const textbox = await screen.findByRole("textbox", { name: "コメント" });
    fireEvent.change(textbox, { target: { value: "消すコメント" } });
    fireEvent.keyDown(textbox, { key: "Enter" });
    const list = await screen.findByRole("list", { name: "コメント一覧" });
    fireEvent.click(within(list).getByRole("button", { name: "コメントの操作" }));
    expect(within(list).queryByRole("menuitem", { name: "編集" })).toBeNull();
    fireEvent.click(within(list).getByRole("menuitem", { name: "削除" }));
    await waitFor(() => expect(screen.queryByText("消すコメント")).toBeNull());
  });

  it("ピンは要素に対する割合の位置に立ち、要素の大きさが変わっても同じ割合の場所に立つ", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    // 等倍で表示される幅にして、iframe 内の座標 = 画面上の座標にする
    fireEvent.click(screen.getByTestId("device-mobile"));
    chooseTool("comment");
    const id = idIn(INDEX_HTML, "p.a");
    const iframe = screen.getByTestId("fake-iframe") as HTMLIFrameElement;
    act(() =>
      frameProps!.onMessage!(
        { type: "review:select", elementId: id, generated: false, point: { x: 0.5, y: 0.25 } },
        iframe,
      ),
    );
    const textbox = await screen.findByRole("textbox", { name: "コメント" });
    fireEvent.change(textbox, { target: { value: "真ん中" } });
    fireEvent.keyDown(textbox, { key: "Enter" });
    await waitFor(async () =>
      expect((await repository.loadLatest())?.comments[0]?.pin).toEqual({ x: 0.5, y: 0.25 }),
    );
    const sendRect = (width: number, height: number) =>
      act(() =>
        frameProps!.onMessage!(
          { type: "review:rects", rects: [{ elementId: id, x: 100, y: 200, width, height }] },
          iframe,
        ),
      );
    const pin = () => screen.getByRole("button", { name: /コメント 1を開く/ });
    sendRect(200, 40);
    // ピンの先（左下）が要素の (50%, 25%) = (200, 210) に来る
    await waitFor(() => expect(pin().style.left).toBe("200px"));
    expect(pin().style.top).toBe(`${210 - 32}px`);
    // 幅を変えて要素が小さくなっても、同じ割合の場所に立つ
    sendRect(100, 80);
    await waitFor(() => expect(pin().style.left).toBe("150px"));
    expect(pin().style.top).toBe(`${220 - 32}px`);
    // ドラッグしても動かない（ドラッグの仕組みを持たない）
    expect(pin().getAttribute("draggable")).not.toBe("true");
  });

  it("枠の上端にある要素のピンも向きを変えず、ピンの先を要素の上に置く", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    fireEvent.click(screen.getByTestId("device-mobile"));
    chooseTool("comment");
    const id = idIn(INDEX_HTML, "h1");
    const iframe = screen.getByTestId("fake-iframe") as HTMLIFrameElement;
    act(() =>
      frameProps!.onMessage!(
        { type: "review:select", elementId: id, generated: false, point: { x: 0, y: 0 } },
        iframe,
      ),
    );
    const textbox = await screen.findByRole("textbox", { name: "コメント" });
    fireEvent.change(textbox, { target: { value: "上端" } });
    fireEvent.keyDown(textbox, { key: "Enter" });
    act(() =>
      frameProps!.onMessage!(
        { type: "review:rects", rects: [{ elementId: id, x: 0, y: 0, width: 300, height: 40 }] },
        iframe,
      ),
    );
    const pin = await screen.findByRole("button", { name: /コメント 1を開く/ });
    // 本体は枠の上の余白に収まる（枠の上端より上、ピン 1 本分）
    expect(pin.style.top).toBe("-32px");
    expect(pin.style.left).toBe("0px");
    expect(pin.hasAttribute("data-flip")).toBe(false);
  });

  it("Escape で選択を外し、入力欄を閉じる", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.a"));
    await screen.findByTestId("comment-composer");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("comment-composer")).toBeNull());
  });

  it("矩形が届くと、コメントの要素にピンを立てる", async () => {
    const { deps } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    const id = idIn(INDEX_HTML, "p.a");
    selectFromFrame(id);
    fireEvent.change(await screen.findByRole("textbox", { name: "コメント" }), {
      target: { value: "ピンのテスト" },
    });
    fireEvent.click(screen.getByRole("button", { name: "コメントを追加" }));
    const iframe = screen.getByTestId("fake-iframe") as HTMLIFrameElement;
    act(() =>
      frameProps!.onMessage!(
        { type: "review:rects", rects: [{ elementId: id, x: 100, y: 200, width: 50, height: 20 }] },
        iframe,
      ),
    );
    const pin = await screen.findByRole("button", { name: /コメント 1を開く/ });
    expect(pin).toHaveAttribute("data-active", "true");
    // スクロールで画面外に出たらピンを隠す
    act(() =>
      frameProps!.onMessage!(
        {
          type: "review:rects",
          rects: [{ elementId: id, x: 100, y: -300, width: 50, height: 20 }],
        },
        iframe,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /コメント 1を開く/ })).toBeNull(),
    );
  });

  it("ファイル表示のエディタのカーソル移動で要素が選ばれる", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    await openFileView();
    act(() => editorProps!.onCursorChange!(INDEX_HTML.indexOf("second") + 1));
    const id = idIn(INDEX_HTML, "p.b");
    await waitFor(() => expect(posted).toContainEqual({ type: "review:highlight", elementId: id }));
  });
});

describe("編集の反映", () => {
  it("CSS の編集: putFiles に渡すファイルが更新され、replace-css を送り、iframe は作り直さない", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    await openFileView();
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
    await openFileView();
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
    await openFileView();
    // 現在のタブは index.html のまま、別ファイル（切り替え前のファイル）の変更が届く
    editorProps!.onChange("console.log(9);", "app.js");
    await waitFor(async () =>
      expect((await repository.loadLatest())?.editedTexts).toEqual({ "app.js": "console.log(9);" }),
    );
  });

  it("要素の前に要素を足す編集をしても、コメントが同じ要素を指す", async () => {
    const { deps, posted } = createDeps();
    await restoreProject(deps);
    chooseTool("comment");
    selectFromFrame(idIn(INDEX_HTML, "p.b"));
    fireEvent.change(await screen.findByRole("textbox", { name: "コメント" }), {
      target: { value: "ここ" },
    });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "コメント" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "コメントを追加" }));
    await screen.findByText("ここ");

    await openFileView();
    act(() =>
      editorProps!.onChange(
        INDEX_HTML.replace('<p class="b">', '<p class="new">n</p><p class="b">'),
        "index.html",
      ),
    );
    chooseTool("comment");
    // 編集後のソースで p.b を探し直し、その要素のピンの矩形を iframe に頼んでいる
    const movedId = idIn(
      INDEX_HTML.replace('<p class="b">', '<p class="new">n</p><p class="b">'),
      "p.b",
    );
    await waitFor(() =>
      expect(posted).toContainEqual({ type: "review:track", elementIds: [movedId] }),
    );
    const list = await screen.findByRole("list", { name: "コメント一覧" });
    expect(list.querySelector('[data-status="active"]')).not.toBeNull();
  });

  it("編集は自動保存され、保存状態が表示される", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    await openFileView();
    editorProps!.onChange("h1 { color: blue; }", "style.css");
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("保存中"));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("保存済み"));
    expect((await repository.loadLatest())?.editedTexts["style.css"]).toBe("h1 { color: blue; }");
  });

  it("保存に失敗したら「保存失敗」を表示する", async () => {
    const { deps, repository } = createDeps();
    await restoreProject(deps);
    await openFileView();
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
    await openFileView();
    act(() => editorProps!.onChange("h1 { color: blue; }", "style.css"));
    openMenu();
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
    openMenu();
    fireEvent.click(screen.getByTestId("delete-project"));
    fireEvent.click(screen.getByTestId("delete-project-confirm"));
    await screen.findByText(/フォルダを選んでください/);
    expect(clearFiles).toHaveBeenCalledWith("project-1");
    expect(await repository.loadLatest()).toBeNull();
    expect(await repository.list()).toEqual([]);
  });
});
