import {
  isForwardedKey,
  isParentMessage,
  type ElementId,
  type FrameMode,
  type FrameToParentMessage,
  type ParentToFrameMessage,
  type TrackedRect,
} from "../shared";
import { findElementById, findReviewTarget, toElement } from "./dom";
import { createOverlay } from "./overlay";
import { replaceElement } from "./replaceElement";
import { createStylesheetReplacer } from "./stylesheet";

export interface ReviewScriptOptions {
  /** 親アプリへメッセージを送る。省略時は win.parent.postMessage（宛先は自分と同じオリジン） */
  postToParent?: (message: FrameToParentMessage) => void;
  /** メッセージを受け付ける送信元。省略時は win.parent。null なら何も受け付けない */
  parent?: MessageEventSource | null;
}

function defaultPostToParent(win: Window): (message: FrameToParentMessage) => void {
  // プレビューは Service Worker の制御下に置くため親アプリと同じオリジンで開かれる。
  // sandbox などでオリジンが "null" になった場合だけ "*" にする
  const origin = win.location.origin;
  const targetOrigin = origin && origin !== "null" ? origin : "*";
  return (message) => win.parent.postMessage(message, targetOrigin);
}

/** 画面外なら element が見えるようにスクロールする */
function scrollIntoViewIfNeeded(win: Window, element: Element): void {
  if (typeof element.scrollIntoView !== "function") return;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const viewWidth = win.innerWidth;
  const viewHeight = win.innerHeight;
  const fullyInside =
    rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewHeight && rect.right <= viewWidth;
  if (fullyInside) return;
  const fits = rect.width <= viewWidth && rect.height <= viewHeight;
  const intersects =
    rect.bottom > 0 && rect.right > 0 && rect.top < viewHeight && rect.left < viewWidth;
  // 画面より大きい要素は、一部でも見えていればスクロールしない（毎回先頭へ飛ぶのを避ける）
  if (!fits && intersects) return;
  element.scrollIntoView({
    block: fits ? "center" : "start",
    inline: "nearest",
    behavior: "smooth",
  });
}

/**
 * iframe 内の生徒サイトに操作スクリプトを取り付ける。
 * ホバーで review:hover、クリックで review:select を親へ送り、親からの review:* を処理する。
 * 戻り値を呼ぶと取り外す（イベント・監視・オーバーレイをすべて片付ける）
 */
export function installReviewScript(win: Window, options: ReviewScriptOptions = {}): () => void {
  const doc = win.document;
  const parent = options.parent === undefined ? win.parent : options.parent;
  const post = options.postToParent ?? defaultPostToParent(win);
  const overlay = createOverlay(doc);
  const stylesheets = createStylesheetReplacer(doc);
  const listeners = new AbortController();
  const { signal } = listeners;

  /** マウスが乗っている要素 */
  let hovered: { element: Element; generated: boolean } | null = null;
  /** 最後に送った review:hover の ID。同じ ID を続けて送らない */
  let lastHoverId: ElementId | null = null;
  /** 選択中（クリック・review:highlight）の要素。要素が差し替えられたら ID で探し直す */
  let selected: { element: Element | null; elementId: ElementId | null } | null = null;
  let frameHandle: number | null = null;
  /** "browse" の間は生徒のサイトをそのまま操作させ、枠も出さない */
  let mode: FrameMode = "inspect";
  /** 矩形を親へ知らせる要素 */
  let tracked: ElementId[] = [];
  /** 最後に送った review:rects の内容。変わったときだけ送る */
  let lastRectsKey = "";

  const requestFrame =
    typeof win.requestAnimationFrame === "function"
      ? (callback: () => void) => win.requestAnimationFrame(callback)
      : (callback: () => void) => win.setTimeout(callback, 16);
  const cancelFrame =
    typeof win.cancelAnimationFrame === "function"
      ? (handle: number) => win.cancelAnimationFrame(handle)
      : (handle: number) => win.clearTimeout(handle);

  function redraw(): void {
    overlay.ensureAttached();
    if (selected && !selected.element?.isConnected && selected.elementId !== null) {
      selected.element = findElementById(doc, selected.elementId);
    }
    const inspecting = mode === "inspect";
    overlay.draw("selected", inspecting ? (selected?.element ?? null) : null);
    if (hovered && !hovered.element.isConnected) hovered = null;
    overlay.draw("hover", inspecting ? (hovered?.element ?? null) : null, {
      generated: hovered?.generated,
    });
    sendRects();
  }

  /** 追跡中の要素の矩形を、変わったときだけ親へ送る */
  function sendRects(): void {
    const rects: TrackedRect[] = [];
    for (const elementId of tracked) {
      const element = findElementById(doc, elementId);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      rects.push({ elementId, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
    const key = JSON.stringify(rects);
    if (key === lastRectsKey) return;
    lastRectsKey = key;
    post({ type: "review:rects", rects });
  }

  /** スクロール・リサイズ・DOM 変化のたびに呼ぶ。描き直しは 1 フレームに 1 回にまとめる */
  function scheduleRedraw(): void {
    if (frameHandle !== null) return;
    frameHandle = requestFrame(() => {
      frameHandle = null;
      redraw();
    });
  }

  function sendHover(elementId: ElementId | null): void {
    if (elementId === lastHoverId) return;
    lastHoverId = elementId;
    post({ type: "review:hover", elementId });
  }

  function onMouseOver(event: MouseEvent): void {
    if (mode !== "inspect") return;
    const element = toElement(event.target);
    if (!element || overlay.contains(element)) return;
    const target = findReviewTarget(element);
    hovered = { element, generated: target.generated };
    overlay.draw("hover", element, { generated: target.generated });
    sendHover(target.elementId);
  }

  function onMouseOut(event: MouseEvent): void {
    // relatedTarget が null = ドキュメントの外へ出た
    if (event.relatedTarget !== null) return;
    hovered = null;
    overlay.draw("hover", null);
    sendHover(null);
  }

  function onClick(event: MouseEvent): void {
    if (mode !== "inspect") return;
    const element = toElement(event.target);
    if (!element || overlay.contains(element)) return;
    // リンク遷移・フォーム送信・生徒の JS のクリック処理を止める
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = findReviewTarget(element);
    // 親で選ばれるのは ID を持つ要素なので、枠もその要素に付ける
    const idElement = target.idElement ?? element;
    selected = { element: idElement, elementId: target.elementId };
    overlay.draw("selected", selected.element);
    const point = pointIn(idElement, event);
    post({
      type: "review:select",
      elementId: target.elementId,
      generated: target.generated,
      ...(point ? { point } : {}),
    });
  }

  /** クリックした位置を、要素に対する割合（左上 0、右下 1）で返す。大きさのない要素なら undefined */
  function pointIn(element: Element, event: MouseEvent): { x: number; y: number } | undefined {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return undefined;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return undefined;
    const ratio = (value: number) => Math.min(1, Math.max(0, value));
    return {
      x: ratio((event.clientX - rect.left) / rect.width),
      y: ratio((event.clientY - rect.top) / rect.height),
    };
  }

  /** 中クリック（新しいタブで開く）やダブルクリックも生徒のサイトへ届けない */
  function blockEvent(event: Event): void {
    if (mode !== "inspect" || overlay.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleParentMessage(message: ParentToFrameMessage): void {
    switch (message.type) {
      case "review:highlight": {
        if (message.elementId === null) {
          selected = null;
          overlay.draw("selected", null);
          return;
        }
        const element = findElementById(doc, message.elementId);
        selected = { element, elementId: message.elementId };
        overlay.draw("selected", element);
        if (element) scrollIntoViewIfNeeded(win, element);
        return;
      }
      case "review:replace-element":
        replaceElement(doc, message.elementId, message.html);
        redraw();
        return;
      case "review:replace-css":
        stylesheets.replace(message.path, message.text);
        scheduleRedraw();
        return;
      case "review:mode":
        if (message.mode === mode) return;
        mode = message.mode;
        hovered = null;
        sendHover(null);
        redraw();
        return;
      case "review:track":
        tracked = [...message.elementIds];
        // 同じ内容でも頼まれたら必ず返す（親が iframe の作り直しで状態を失っていることがある）
        lastRectsKey = "";
        redraw();
        return;
    }
  }

  function onMessage(event: MessageEvent): void {
    if (parent === null || event.source !== parent) return;
    if (!isParentMessage(event.data)) return;
    handleParentMessage(event.data);
  }

  // window のキャプチャ段階で受け取り、生徒のどのリスナーよりも先に止める
  // （ただし生徒が先に window のキャプチャ段階へ登録したリスナーは先に動く）
  win.addEventListener("click", onClick, { capture: true, signal });
  win.addEventListener("auxclick", blockEvent, { capture: true, signal });
  win.addEventListener("dblclick", blockEvent, { capture: true, signal });
  // ホバーは生徒の :hover やリスナーを妨げないよう、止めずに見るだけ
  doc.addEventListener("mouseover", onMouseOver, { capture: true, signal });
  doc.addEventListener("mouseout", onMouseOut, { capture: true, signal });
  win.addEventListener("message", onMessage, { signal });

  /** 入力欄の外で押されたツール切り替えのキーを親へ渡す（iframe にフォーカスがあると親に届かないため） */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!isForwardedKey(key)) return;
    const target = toElement(event.target);
    if (
      target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
    )
      return;
    post({ type: "review:key", key });
  }
  win.addEventListener("keydown", onKeyDown, { capture: true, signal });

  // 位置の追従。要素のスクロールは泡立たないが、キャプチャ段階なら window で受け取れる
  win.addEventListener("scroll", scheduleRedraw, { capture: true, passive: true, signal });
  win.addEventListener("resize", scheduleRedraw, { signal });
  // 画像の読み込み・アニメーションの終了でもレイアウトが変わる（load も泡立たないのでキャプチャで受ける）
  for (const type of ["load", "transitionend", "animationend"]) {
    doc.addEventListener(type, scheduleRedraw, { capture: true, signal });
  }
  // オーバーレイの中身は Shadow DOM なので、ここでは監視されない（描き直しが無限に続かない）
  const observer = new MutationObserver(scheduleRedraw);
  observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });

  const sendReady = () => post({ type: "review:ready" });
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", sendReady, { once: true, signal });
  } else {
    sendReady();
  }

  return () => {
    listeners.abort();
    observer.disconnect();
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
    overlay.dispose();
  };
}
