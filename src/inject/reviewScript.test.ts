import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrameToParentMessage, ParentToFrameMessage } from "../shared";
import { OVERLAY_HOST_TAG } from "./overlay";
import { installReviewScript, type ReviewScriptOptions } from "./reviewScript";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function setup(html: string, options: ReviewScriptOptions = {}) {
  document.body.innerHTML = html;
  const post = vi.fn<(message: FrameToParentMessage) => void>();
  dispose = installReviewScript(window, { postToParent: post, ...options });
  post.mockClear();
  return { post };
}

function byId(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-review-id="${id}"]`);
  if (!element) throw new Error(`data-review-id="${id}" の要素がない`);
  return element;
}

function host(): HTMLElement {
  const element = document.querySelector<HTMLElement>(OVERLAY_HOST_TAG);
  if (!element) throw new Error("オーバーレイのホストがない");
  return element;
}

function box(kind: "hover" | "selected"): HTMLElement {
  const element = host().shadowRoot?.querySelector<HTMLElement>(`.box.${kind}`);
  if (!element) throw new Error(`${kind} の枠がない`);
  return element;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockRect(element: Element, value: DOMRect) {
  return vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

function hover(target: EventTarget) {
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
}

function click(target: EventTarget): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function sendFromParent(data: unknown, source: MessageEventSource | null = window) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

function message(data: ParentToFrameMessage) {
  sendFromParent(data);
}

/** 操作スクリプトの描き直し（MutationObserver → requestAnimationFrame）を待つ */
async function nextFrames() {
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 32);
    });
  }
}

const PAGE = `
  <main data-review-id="1" class="page" style="color: red">
    <a data-review-id="2" href="https://example.com/" class="link">リンク</a>
    <div data-review-id="3" id="slider" class="slider">
      <span class="dot">JS が作った要素</span>
    </div>
  </main>
`;

/** 閉じタグ漏れで <b> がブラウザに複製され、同じ data-review-id が 2 つの要素に付くページ */
const DUPLICATED = `<p data-review-id="1"><b data-review-id="2">x<p data-review-id="3">y</b>`;

describe("review:ready", () => {
  it("取り付けた時点で読み込みが終わっていれば、すぐに送る", () => {
    const post = vi.fn();
    dispose = installReviewScript(window, { postToParent: post });
    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "review:ready" });
  });

  it("読み込み中なら DOMContentLoaded を待って送る", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const post = vi.fn();
    dispose = installReviewScript(window, { postToParent: post });
    expect(post).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "review:ready" });
  });
});

describe("ホバー", () => {
  it("マウスが乗った要素の ID で review:hover を送り、枠を描く", () => {
    const { post } = setup(PAGE);
    mockRect(byId("2"), rect(20, 30, 100, 40));

    hover(byId("2"));

    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "review:hover", elementId: "2" });
    const hoverBox = box("hover");
    expect(hoverBox.classList.contains("visible")).toBe(true);
    expect(hoverBox.style.top).toBe("30px");
    expect(hoverBox.style.left).toBe("20px");
    expect(hoverBox.style.width).toBe("100px");
    expect(hoverBox.style.height).toBe("40px");
    expect(hoverBox.textContent).toBe("a.link");
  });

  it("同じ ID のままなら続けて送らず、ドキュメントの外へ出たら null を送る", () => {
    const { post } = setup(PAGE);

    hover(byId("3"));
    hover(document.querySelector(".dot")!);
    byId("3").dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));

    expect(post.mock.calls.map(([m]) => m)).toEqual([
      { type: "review:hover", elementId: "3" },
      { type: "review:hover", elementId: null },
    ]);
    expect(box("hover").classList.contains("visible")).toBe(false);
  });

  it("JS が作った要素には祖先の ID を送り、枠を破線にしてラベルで示す", () => {
    const { post } = setup(PAGE);
    const dot = document.querySelector(".dot")!;
    mockRect(dot, rect(0, 100, 10, 10));

    hover(dot);

    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "review:hover", elementId: "3" });
    expect(box("hover").classList.contains("generated")).toBe(true);
    expect(box("hover").textContent).toBe("span.dot（JS 生成）");
  });
});

describe("クリック", () => {
  it("クリックした要素の ID で review:select を送る", () => {
    const { post } = setup(PAGE);

    click(byId("3"));

    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "review:select",
      elementId: "3",
      generated: false,
      rules: [],
    });
  });

  it("data-review-id のない要素（JS 生成）は、最も近い祖先の ID と generated: true を送る", () => {
    const { post } = setup(PAGE);
    mockRect(byId("3"), rect(0, 50, 300, 100));

    click(document.querySelector(".dot")!);

    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "review:select",
      elementId: "3",
      generated: true,
    });
    // 選択の枠は、親で選ばれる祖先に付ける
    expect(box("selected").classList.contains("visible")).toBe(true);
    expect(box("selected").textContent).toBe("div#slider.slider");
  });

  it("開始タグのない body の余白をクリックしたら、JS 生成ではなく elementId: null を送る", () => {
    // 解析層は暗黙に作られた html / head / body / tbody に data-review-id を付けない
    const { post } = setup(PAGE);

    click(document.body);
    click(document.documentElement);

    expect(post.mock.calls.map(([m]) => m)).toEqual([
      { type: "review:select", elementId: null, generated: false },
      { type: "review:select", elementId: null, generated: false },
    ]);
  });

  it("暗黙に作られた tbody をクリックしたら、祖先の table の ID を generated: false で送る", () => {
    const { post } = setup(
      `<table data-review-id="7"><tr data-review-id="8"><td>a</td></tr></table>`,
    );
    const tbody = document.querySelector("tbody")!;
    expect(tbody.hasAttribute("data-review-id")).toBe(false);

    click(tbody);

    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "review:select",
      elementId: "7",
      generated: false,
      rules: [],
    });
  });

  it("祖先にも ID がなければ elementId: null を送る", () => {
    const { post } = setup(`<p>ID なし</p>`);

    click(document.querySelector("p")!);

    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "review:select",
      elementId: null,
      generated: true,
    });
  });

  it("<a> の遷移を止め、生徒の JS のクリック処理にも届けない", () => {
    setup(PAGE);
    const onLink = vi.fn();
    const onBody = vi.fn();
    byId("2").addEventListener("click", onLink);
    document.body.addEventListener("click", onBody, { capture: true });

    const event = click(byId("2"));

    expect(event.defaultPrevented).toBe(true);
    expect(onLink).not.toHaveBeenCalled();
    expect(onBody).not.toHaveBeenCalled();
  });

  it("中クリックとダブルクリックも生徒のサイトへ届けない", () => {
    const { post } = setup(PAGE);
    const onAux = vi.fn();
    const onDouble = vi.fn();
    byId("2").addEventListener("auxclick", onAux);
    byId("2").addEventListener("dblclick", onDouble);

    const aux = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    byId("2").dispatchEvent(aux);
    byId("2").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));

    expect(aux.defaultPrevented).toBe(true);
    expect(onAux).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("オーバーレイ", () => {
  it("ホスト要素は pointer-events: none で、body の外（documentElement の末尾）に置く", () => {
    setup(PAGE);

    expect(host().parentNode).toBe(document.documentElement);
    expect(document.body.contains(host())).toBe(false);
    expect(host().getAttribute("style")).toContain("pointer-events: none !important");
    expect(host().shadowRoot?.querySelector("style")?.textContent).toContain(
      "pointer-events: none",
    );
  });

  it("オーバーレイ（ホストや Shadow DOM の中）はホバー・クリックの対象にならない", () => {
    const { post } = setup(PAGE);

    hover(host());
    const onHost = click(host());
    const onBox = click(box("hover"));

    expect(post).not.toHaveBeenCalled();
    expect(onHost.defaultPrevented).toBe(false);
    expect(onBox.defaultPrevented).toBe(false);
  });

  it("生徒の JS などでホスト要素が外されても付け直す", async () => {
    setup(PAGE);
    host().remove();

    await nextFrames();

    expect(document.querySelector(OVERLAY_HOST_TAG)?.parentNode).toBe(document.documentElement);
  });

  it("ホバー・クリック・ハイライトで生徒の要素の style 属性や class が変わらない", () => {
    setup(PAGE);
    const before = document.body.innerHTML;
    const rootAttributes = document.documentElement.getAttributeNames();

    hover(byId("1"));
    hover(document.querySelector(".dot")!);
    click(byId("2"));
    click(document.querySelector(".dot")!);
    message({ type: "review:highlight", elementId: "1" });

    expect(document.body.innerHTML).toBe(before);
    expect(document.documentElement.getAttributeNames()).toEqual(rootAttributes);
  });
});

describe("位置の追従", () => {
  it("スクロールで枠の位置を描き直す", async () => {
    setup(PAGE);
    const spy = mockRect(byId("2"), rect(10, 200, 50, 20));
    message({ type: "review:highlight", elementId: "2" });
    expect(box("selected").style.top).toBe("200px");

    spy.mockReturnValue(rect(10, 120, 50, 20));
    window.dispatchEvent(new Event("scroll"));
    await nextFrames();

    expect(box("selected").style.top).toBe("120px");
  });

  it("リサイズで枠の位置を描き直す", async () => {
    setup(PAGE);
    const spy = mockRect(byId("2"), rect(10, 200, 50, 20));
    hover(byId("2"));

    spy.mockReturnValue(rect(40, 200, 50, 20));
    window.dispatchEvent(new Event("resize"));
    await nextFrames();

    expect(box("hover").style.left).toBe("40px");
  });

  it("DOM が変化したら枠の位置を描き直す", async () => {
    setup(PAGE);
    const spy = mockRect(byId("3"), rect(0, 300, 100, 100));
    message({ type: "review:highlight", elementId: "3" });

    spy.mockReturnValue(rect(0, 350, 100, 100));
    byId("1").insertAdjacentHTML("afterbegin", "<p>上に追加</p>");
    await nextFrames();

    expect(box("selected").style.top).toBe("350px");
  });

  it("ホバー中の要素が DOM から消えたら枠を消す", async () => {
    setup(PAGE);
    const dot = document.querySelector(".dot")!;
    mockRect(dot, rect(0, 0, 10, 10));
    hover(dot);
    expect(box("hover").classList.contains("visible")).toBe(true);

    dot.remove();
    await nextFrames();

    expect(box("hover").classList.contains("visible")).toBe(false);
  });
});

describe("review:highlight", () => {
  it("指定 ID の要素に枠を描き、画面外ならスクロールする", () => {
    setup(PAGE);
    const target = byId("3");
    mockRect(target, rect(0, 2000, 300, 100));
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    message({ type: "review:highlight", elementId: "3" });

    expect(box("selected").classList.contains("visible")).toBe(true);
    expect(box("selected").style.top).toBe("2000px");
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  });

  it("画面内に収まっていればスクロールしない", () => {
    setup(PAGE);
    const target = byId("3");
    mockRect(target, rect(0, 10, 300, 100));
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    message({ type: "review:highlight", elementId: "3" });

    expect(box("selected").classList.contains("visible")).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("画面より大きい要素は、一部でも見えていればスクロールしない", () => {
    setup(PAGE);
    const target = byId("1");
    mockRect(target, rect(0, -100, 300, window.innerHeight + 500));
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    message({ type: "review:highlight", elementId: "1" });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("elementId: null で枠を消す", () => {
    setup(PAGE);
    mockRect(byId("2"), rect(0, 0, 10, 10));
    message({ type: "review:highlight", elementId: "2" });

    message({ type: "review:highlight", elementId: null });

    expect(box("selected").classList.contains("visible")).toBe(false);
  });

  it("見つからない ID なら枠を消す", () => {
    setup(PAGE);
    mockRect(byId("2"), rect(0, 0, 10, 10));
    message({ type: "review:highlight", elementId: "2" });

    message({ type: "review:highlight", elementId: "999" });

    expect(box("selected").classList.contains("visible")).toBe(false);
  });

  it("複製された書式要素で同じ ID が複数あれば、文書順で最初の要素に枠を描く", () => {
    // <b> が 2 つ目の <p> の中に属性ごと複製される
    setup(DUPLICATED);
    const [first, second] = document.querySelectorAll('[data-review-id="2"]');
    expect(second).toBeDefined();
    mockRect(first!, rect(0, 10, 50, 20));
    mockRect(second!, rect(0, 40, 50, 20));

    message({ type: "review:highlight", elementId: "2" });

    expect(box("selected").style.top).toBe("10px");
  });
});

describe("review:replace-element", () => {
  it("同じ ID が複数あれば、文書順で最初の要素だけを差し替える", () => {
    setup(DUPLICATED);

    message({
      type: "review:replace-element",
      elementId: "2",
      html: `<i data-review-id="2">x</i>`,
    });

    expect(document.body.innerHTML).toBe(
      `<p data-review-id="1"><i data-review-id="2">x</i></p>` +
        `<p data-review-id="3"><b data-review-id="2">y</b></p>`,
    );
  });

  it("指定 ID の要素を差し替え、選択の枠は同じ ID の新しい要素に付け直す", () => {
    setup(PAGE);
    mockRect(byId("2"), rect(0, 0, 10, 10));
    message({ type: "review:highlight", elementId: "2" });
    const spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(rect(5, 60, 80, 20));

    message({
      type: "review:replace-element",
      elementId: "2",
      html: `<a data-review-id="2" href="/new" class="link">新しいリンク</a>`,
    });

    expect(byId("2").textContent).toBe("新しいリンク");
    expect(byId("2").getAttribute("href")).toBe("/new");
    expect(document.querySelectorAll('[data-review-id="2"]')).toHaveLength(1);
    expect(box("selected").style.top).toBe("60px");
    spy.mockRestore();
  });
});

describe("review:replace-css", () => {
  it("指定パスの <link rel=stylesheet> を <style> に差し替え、2 回目は中身だけ書き換える", () => {
    document.head.innerHTML = `
      <link data-review-id="10" rel="stylesheet" href="css/style.css" media="screen">
      <link data-review-id="11" rel="stylesheet" href="css/other.css">
    `;
    setup(PAGE);

    message({ type: "review:replace-css", path: "css/style.css", text: "p { color: blue; }" });

    const style = document.head.querySelector("style");
    expect(style?.textContent).toBe("p { color: blue; }");
    expect(style?.getAttribute("media")).toBe("screen");
    expect(document.head.querySelector('link[href="css/style.css"]')).toBeNull();
    expect(document.head.querySelector('link[href="css/other.css"]')).not.toBeNull();

    message({ type: "review:replace-css", path: "css/style.css", text: "p { color: green; }" });

    expect(document.head.querySelectorAll("style")).toHaveLength(1);
    expect(document.head.querySelector("style")).toBe(style);
    expect(style?.textContent).toBe("p { color: green; }");
  });
});

describe("受信メッセージの検証", () => {
  it("不正なメッセージは無視する", () => {
    setup(PAGE);
    mockRect(byId("2"), rect(0, 0, 10, 10));
    const before = document.body.innerHTML;

    for (const data of [
      null,
      "review:highlight",
      { type: "review:highlight" },
      { type: "review:highlight", elementId: 2 },
      { type: "review:replace-element", elementId: "2" },
      { type: "review:replace-css", path: "css/style.css" },
      { type: "review:select", elementId: "2", generated: false },
    ]) {
      sendFromParent(data);
    }

    expect(box("selected").classList.contains("visible")).toBe(false);
    expect(document.body.innerHTML).toBe(before);
  });

  it("window.parent 以外からのメッセージは無視する", () => {
    setup(PAGE);
    mockRect(byId("2"), rect(0, 0, 10, 10));
    const other = document.createElement("iframe");
    document.body.append(other);
    const before = document.body.innerHTML;

    const replace = { type: "review:replace-element", elementId: "2", html: "<b>x</b>" };
    sendFromParent(replace, other.contentWindow);
    sendFromParent(replace, null);
    sendFromParent({ type: "review:highlight", elementId: "2" }, other.contentWindow);

    expect(document.body.innerHTML).toBe(before);
    expect(box("selected").classList.contains("visible")).toBe(false);
  });

  it("parent: null なら何も受け付けない", () => {
    setup(PAGE, { parent: null });
    const before = document.body.innerHTML;

    sendFromParent({ type: "review:replace-element", elementId: "2", html: "<b>x</b>" });

    expect(document.body.innerHTML).toBe(before);
  });
});

describe("取り付けと取り外し", () => {
  it("グローバル変数を増やさない", () => {
    const before = new Set(Object.getOwnPropertyNames(window));
    setup(PAGE);
    const added = Object.getOwnPropertyNames(window).filter((name) => !before.has(name));
    expect(added).toEqual([]);
  });

  it("既定では window.parent.postMessage に自分のオリジン宛てで送る", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    dispose = installReviewScript(window);
    expect(postMessage).toHaveBeenCalledWith({ type: "review:ready" }, window.location.origin);
  });

  it("取り外すとオーバーレイを消し、イベントにも反応しなくなる", () => {
    const { post } = setup(PAGE);
    dispose?.();
    dispose = null;

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    const event = click(byId("3"));
    hover(byId("3"));
    expect(event.defaultPrevented).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("review:mode", () => {
  it("browse ではクリックを止めず、選択も送らない", () => {
    const { post } = setup(PAGE);
    message({ type: "review:mode", mode: "browse" });
    post.mockClear();
    const event = click(byId("3"));
    expect(event.defaultPrevented).toBe(false);
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: "review:select" }));
  });

  it("browse ではホバーの枠を出さず、選択の枠も隠す。inspect に戻すと選択の枠が戻る", () => {
    setup(PAGE);
    mockRect(byId("1"), rect(0, 40, 100, 50));
    message({ type: "review:highlight", elementId: "1" });
    expect(box("selected").classList.contains("visible")).toBe(true);

    message({ type: "review:mode", mode: "browse" });
    expect(box("selected").classList.contains("visible")).toBe(false);
    hover(byId("1"));
    expect(box("hover").classList.contains("visible")).toBe(false);

    message({ type: "review:mode", mode: "inspect" });
    expect(box("selected").classList.contains("visible")).toBe(true);
  });

  it("browse に切り替えたら、ホバーの解除を親へ送る", () => {
    const { post } = setup(PAGE);
    hover(byId("2"));
    post.mockClear();
    message({ type: "review:mode", mode: "browse" });
    expect(post).toHaveBeenCalledWith({ type: "review:hover", elementId: null });
  });
});

describe("キーの転送", () => {
  function press(target: EventTarget, init: KeyboardEventInit) {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  }

  it("ツール切り替えのキーと Escape を親へ送る", () => {
    const { post } = setup(PAGE);
    press(document.body, { key: "D" });
    press(document.body, { key: "Escape" });
    expect(post).toHaveBeenCalledWith({ type: "review:key", key: "d" });
    expect(post).toHaveBeenCalledWith({ type: "review:key", key: "Escape" });
  });

  it("入力欄の中・修飾キー付き・対象外のキーは送らない", () => {
    const { post } = setup(`${PAGE}<input data-review-id="9" />`);
    press(byId("9"), { key: "d" });
    press(document.body, { key: "d", metaKey: true });
    press(document.body, { key: "c" });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("要素に当たっている CSS ルール", () => {
  it("クリックした要素に当たる、CSS ファイルのルールを review:select で送る", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="css/style.css">';
    const { post } = setup(`<p data-review-id="1" class="lead">a</p>`);
    // jsdom は <link> を読み込まないので、CSS を差し替えて <style> にする（編集後と同じ状態）
    message({
      type: "review:replace-css",
      path: "css/style.css",
      text: ".lead { color: red; } .other { color: blue; } p::before { content: '' }",
    });
    click(byId("1"));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "review:select",
        elementId: "1",
        rules: [
          expect.objectContaining({ path: "css/style.css", selector: ".lead", occurrence: 0 }),
          expect.objectContaining({ path: "css/style.css", selector: "p::before" }),
        ],
      }),
    );
  });

  it("HTML の中の <style> のルールは対象外（ファイルがないため）", () => {
    document.head.innerHTML = "<style>.lead { color: red; }</style>";
    const { post } = setup(`<p data-review-id="1" class="lead">a</p>`);
    click(byId("1"));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ elementId: "1", rules: [] }));
  });
});
