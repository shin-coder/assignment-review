import { language } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceLocation } from "../../shared";
import { CodeEditor, type CodeEditorProps } from "./CodeEditor";
import { CHANGE_DEBOUNCE_MS, HIGHLIGHT_CLASS } from "./constants";

// jsdom にはレイアウトの API がないため、CodeMirror が使う分だけ空の値を返すようにする
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
const emptyRects = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
const originals = {
  getClientRects: Range.prototype.getClientRects,
  getBoundingClientRect: Range.prototype.getBoundingClientRect,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

beforeAll(() => {
  Range.prototype.getClientRects = emptyRects;
  Range.prototype.getBoundingClientRect = emptyRect;
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
});

afterAll(() => {
  Range.prototype.getClientRects = originals.getClientRects;
  Range.prototype.getBoundingClientRect = originals.getBoundingClientRect;
  URL.createObjectURL = originals.createObjectURL;
  URL.revokeObjectURL = originals.revokeObjectURL;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderEditor(props: Partial<CodeEditorProps> = {}) {
  const onChange = vi.fn<CodeEditorProps["onChange"]>();
  const all: CodeEditorProps = {
    path: "index.html",
    value: "<p>hello</p>",
    onChange,
    highlight: null,
    ...props,
  };
  const result = render(<CodeEditor {...all} />);
  return {
    ...result,
    onChange: (props.onChange as typeof onChange | undefined) ?? onChange,
    rerenderWith: (next: Partial<CodeEditorProps>) =>
      result.rerender(<CodeEditor {...all} {...next} />),
  };
}

function getView(): EditorView {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor");
  const view = dom && EditorView.findFromDOM(dom);
  if (!view) throw new Error("エディタが見つからない");
  return view;
}

/** ユーザーの入力と同じ種類のトランザクションで文字を挿入する */
function typeText(view: EditorView, text: string, at = view.state.doc.length) {
  act(() => {
    view.dispatch({
      changes: { from: at, insert: text },
      selection: { anchor: at + text.length },
      userEvent: "input.type",
    });
  });
}

describe("CodeEditor: 変更の通知", () => {
  it("入力すると間隔を置いて onChange が最新のテキストで 1 回呼ばれる", () => {
    const { onChange } = renderEditor({ path: "css/style.css", value: "p {}" });
    const view = getView();

    typeText(view, "\na");
    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1));
    typeText(view, "b");
    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("p {}\nab", "css/style.css");
  });

  it("JS ファイルでは「適用」ボタンを押すまで onChange が呼ばれない", () => {
    const { onChange } = renderEditor({ path: "js/main.js", value: "let a = 1;" });
    const view = getView();
    const applyButton = screen.getByRole("button", { name: "適用" });
    expect(applyButton).toBeDisabled();

    typeText(view, "\nlet b = 2;");
    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 10));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("未適用の変更があります")).toBeInTheDocument();

    fireEvent.click(applyButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("let a = 1;\nlet b = 2;", "js/main.js");
    expect(screen.queryByText("未適用の変更があります")).toBeNull();
    expect(applyButton).toBeDisabled();
  });

  it("JS ファイルは Ctrl+Enter でも確定できる", () => {
    const { onChange } = renderEditor({ path: "js/main.js", value: "let a = 1;" });
    const view = getView();

    typeText(view, "2");
    fireEvent.keyDown(view.contentDOM, { key: "Enter", code: "Enter", keyCode: 13, ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("let a = 1;2", "js/main.js");
  });

  it("Ctrl+S で待ち時間を待たずに渡す", () => {
    const { onChange } = renderEditor({ path: "css/style.css", value: "p {}" });
    const view = getView();

    typeText(view, "a");
    fireEvent.keyDown(view.contentDOM, { key: "s", code: "KeyS", keyCode: 83, ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に保留中の変更を渡す", () => {
    const { onChange, unmount } = renderEditor({ path: "css/style.css", value: "p {}" });

    typeText(getView(), "a");
    unmount();
    expect(onChange).toHaveBeenCalledWith("p {}a", "css/style.css");
  });

  it("ファイルを切り替えると、前のファイルの保留中の変更を前のパスで渡す", () => {
    const { onChange, rerenderWith } = renderEditor({ path: "css/a.css", value: "a {}" });

    typeText(getView(), "x");
    rerenderWith({ path: "css/b.css", value: "b {}" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("a {}x", "css/a.css");
    expect(getView().state.doc.toString()).toBe("b {}");
  });

  it("カーソルが動くと onCursorChange にオフセットを渡す", () => {
    const onCursorChange = vi.fn();
    renderEditor({ onCursorChange });
    const view = getView();

    act(() => view.dispatch({ selection: { anchor: 4 }, userEvent: "select" }));
    expect(onCursorChange).toHaveBeenLastCalledWith(4);
  });
});

describe("CodeEditor: 外からの value の変更", () => {
  it("value を外から変えるとエディタの内容が変わり、onChange は呼ばれない", () => {
    const onCursorChange = vi.fn();
    const { onChange, rerenderWith } = renderEditor({ onCursorChange });

    rerenderWith({ value: "<p>world</p>" });
    expect(getView().state.doc.toString()).toBe("<p>world</p>");

    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 10));
    expect(onChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
  });

  it("変わっていない部分にあるカーソル位置を保つ", () => {
    const { rerenderWith } = renderEditor({ value: "<p>hello</p>\n<p>end</p>" });
    const view = getView();
    act(() => view.dispatch({ selection: { anchor: 16 } }));

    rerenderWith({ value: "<p>hello, world</p>\n<p>end</p>" });
    // 前に 7 文字挿入されたぶんだけずれる
    expect(view.state.selection.main.head).toBe(23);
  });

  it("自分の onChange をそのまま value に返されても、その後の入力を巻き戻さない", () => {
    let latest: Partial<CodeEditorProps> = {};
    const onChange = vi.fn((text: string) => {
      latest = { value: text };
    });
    const { rerenderWith } = renderEditor({ path: "a.css", value: "a", onChange });
    const view = getView();

    typeText(view, "b");
    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS));
    typeText(view, "c");
    // 親が "ab" を value として返してくる間に "c" が入力されていた
    rerenderWith(latest);
    expect(view.state.doc.toString()).toBe("abc");

    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("abc", "a.css");
  });

  it("外から変わったら JS の未適用の変更を捨てる", () => {
    const { onChange, rerenderWith } = renderEditor({ path: "main.js", value: "a" });

    typeText(getView(), "b");
    rerenderWith({ value: "z" });
    expect(getView().state.doc.toString()).toBe("z");
    expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CodeEditor: 強調表示", () => {
  const value = "<div>\n  <p>hello</p>\n</div>";
  const location: SourceLocation = { filePath: "index.html", start: 8, end: 20 };

  function highlighted(): string {
    return Array.from(
      screen.getByTestId("code-editor").querySelectorAll(`.${HIGHLIGHT_CLASS}`),
      (element) => element.textContent,
    ).join("");
  }

  it("highlight を渡すと該当範囲に強調用のクラスが付く", () => {
    const { rerenderWith } = renderEditor({ value });
    expect(highlighted()).toBe("");

    rerenderWith({ highlight: location });
    expect(highlighted()).toBe("<p>hello</p>");

    rerenderWith({ highlight: null });
    expect(highlighted()).toBe("");
  });

  it("別のファイルの位置は強調しない", () => {
    renderEditor({ value, highlight: { ...location, filePath: "about.html" } });
    expect(highlighted()).toBe("");
  });

  it("強調する範囲の先頭が見える位置までスクロールし、同じ範囲なら繰り返さない", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { rerenderWith } = renderEditor({ value });

    rerenderWith({ highlight: location });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith(8, { y: "center" });

    // 親が同じ範囲の新しいオブジェクトを渡しても再スクロールしない
    rerenderWith({ highlight: { ...location } });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe("CodeEditor: 言語とファイルの種類", () => {
  it.each([
    ["index.html", "html"],
    ["css/style.css", "css"],
    ["js/main.js", "javascript"],
  ])("%s は %s として開く", (path, expected) => {
    renderEditor({ path, value: "" });

    expect(screen.getByTestId("code-editor")).toHaveAttribute("data-language", expected);
    expect(getView().state.facet(language)?.name).toBe(expected);
  });

  it("ファイルを切り替えると言語も切り替わる", () => {
    const { rerenderWith } = renderEditor({ path: "index.html", value: "<p></p>" });

    rerenderWith({ path: "css/style.css", value: "p {}" });
    expect(getView().state.facet(language)?.name).toBe("css");
  });

  it("対応する言語がないテキストは言語なしで開く", () => {
    renderEditor({ path: "data.json", value: "{}" });
    expect(getView().state.facet(language)).toBeNull();
  });

  it("バイナリファイルではエディタを開かず、編集できないと表示する", () => {
    renderEditor({ path: "fonts/a.woff2", value: new ArrayBuffer(8), mimeType: "font/woff2" });

    const root = screen.getByTestId("code-editor");
    expect(root.querySelector(".cm-editor")).toBeNull();
    expect(screen.getByText(/編集できません/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("画像ファイルはプレビューを表示する", () => {
    renderEditor({ path: "images/top.png", value: new ArrayBuffer(8), mimeType: "image/png" });

    expect(screen.getByTestId("code-editor").querySelector(".cm-editor")).toBeNull();
    expect(screen.getByRole("img", { name: "images/top.png" })).toHaveAttribute(
      "src",
      "blob:preview",
    );
  });

  it("readOnly では編集できない", () => {
    renderEditor({ readOnly: true });
    expect(getView().state.readOnly).toBe(true);
    expect(getView().contentDOM).toHaveAttribute("contenteditable", "false");
  });
});

describe("CodeEditor: 元に戻す", () => {
  it("「元に戻す」で onReset を呼び、保留中の変更は渡さない", () => {
    const onReset = vi.fn();
    const { onChange } = renderEditor({ path: "a.css", value: "a", modified: true, onReset });

    typeText(getView(), "b");
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(onReset).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("編集されていなければ「元に戻す」は押せない", () => {
    renderEditor({ modified: false, onReset: vi.fn() });
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  });

  it("onReset を渡さなければボタンを出さない", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "元に戻す" })).toBeNull();
  });
});

describe("CodeEditor: 画面共有での見やすさ", () => {
  it("行番号を表示する", () => {
    renderEditor({ value: "a\nb\nc" });
    expect(screen.getByTestId("code-editor").querySelector(".cm-lineNumbers")).not.toBeNull();
  });
});
