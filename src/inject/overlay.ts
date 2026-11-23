import type { FrameMode } from "../shared";
import { describeElement } from "./dom";

// ハイライトの重ね表示（オーバーレイ）。
// 生徒の要素には一切触れず、documentElement の末尾に置いたホスト要素の Shadow DOM の中に枠を描く。
// - Shadow DOM なので生徒の CSS のセレクタは中身に届かない
// - ホスト要素自体はインラインの !important で固め、生徒の CSS（* { ... } など）の影響を受けないようにする
// - ホストも枠も pointer-events: none なので、ホバー・クリックの対象にならない

/** オーバーレイのホスト要素のタグ名。生徒のサイトとぶつからないようハイフン入りの独自名にする */
export const OVERLAY_HOST_TAG = "review-tool-overlay";

export type BoxKind = "hover" | "selected";

export interface DrawOptions {
  /** JS が後から生成した要素（data-review-id がない要素）なら true。枠を破線にする */
  generated?: boolean;
}

export interface Overlay {
  readonly host: HTMLElement;
  /** node がオーバーレイ（ホスト要素とその中身）に属するか */
  contains(node: unknown): boolean;
  /** element を囲む枠を描く。null・切り離された要素・大きさのない要素なら枠を消す */
  draw(kind: BoxKind, element: Element | null, options?: DrawOptions): void;
  /** 生徒の JS や要素の差し替えでホスト要素が外されていたら付け直す */
  ensureAttached(): void;
  /** 操作モード。"comment" ではラベルを出さず、選択の枠を薄くする */
  setMode(mode: FrameMode): void;
  dispose(): void;
}

const HOST_STYLE = [
  "all: initial !important",
  "display: block !important",
  "position: fixed !important",
  "top: 0 !important",
  "left: 0 !important",
  "width: 0 !important",
  "height: 0 !important",
  "overflow: visible !important",
  "pointer-events: none !important",
  "z-index: 2147483647 !important",
].join("; ");

const SHADOW_STYLE = `
:host { all: initial; }
.box {
  position: fixed;
  box-sizing: border-box;
  pointer-events: none;
  display: none;
  border: 2px solid var(--color);
  background: var(--fill);
}
.box.visible { display: block; }
.box.generated { border-style: dashed; }
.hover { --color: #2563eb; --fill: rgb(37 99 235 / 0.12); }
.selected { --color: #ea580c; --fill: rgb(234 88 12 / 0.1); }
.label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  padding: 1px 6px;
  border-radius: 3px 3px 0 0;
  background: var(--color);
  color: #fff;
  font: 12px/1.5 system-ui, sans-serif;
  white-space: nowrap;
}
:host([data-mode="comment"]) .label { display: none; }
:host([data-mode="comment"]) .selected {
  --color: rgb(37 99 235 / 0.55);
  --fill: rgb(37 99 235 / 0.06);
  border-width: 1.5px;
  border-radius: 4px;
}
.box.label-inside .label { bottom: auto; top: 0; border-radius: 0 0 3px 0; }
`;

/** ラベルの高さの目安。これより上に余白がなければラベルを枠の内側に出す */
const LABEL_HEIGHT = 20;

const GENERATED_SUFFIX = "（JS 生成）";

export function createOverlay(doc: Document): Overlay {
  const host = doc.createElement(OVERLAY_HOST_TAG);
  host.setAttribute("style", HOST_STYLE);
  const shadow = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = SHADOW_STYLE;
  shadow.append(style);

  const boxes = {} as Record<BoxKind, { box: HTMLElement; label: HTMLElement }>;
  for (const kind of ["selected", "hover"] as const) {
    const box = doc.createElement("div");
    box.className = `box ${kind}`;
    box.dataset.kind = kind;
    const label = doc.createElement("span");
    label.className = "label";
    box.append(label);
    shadow.append(box);
    boxes[kind] = { box, label };
  }

  function ensureAttached(): void {
    const root = doc.documentElement;
    if (root && host.parentNode !== root) root.append(host);
  }

  function hide(kind: BoxKind): void {
    boxes[kind].box.classList.remove("visible");
  }

  function draw(kind: BoxKind, element: Element | null, options: DrawOptions = {}): void {
    if (!element || !element.isConnected) {
      hide(kind);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hide(kind);
      return;
    }
    const { box, label } = boxes[kind];
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.classList.toggle("generated", options.generated === true);
    box.classList.toggle("label-inside", rect.top < LABEL_HEIGHT);
    label.textContent = describeElement(element) + (options.generated ? GENERATED_SUFFIX : "");
    box.classList.add("visible");
  }

  ensureAttached();

  return {
    host,
    // Shadow DOM の中のノードは host.contains() では見つからないため、属する木の根でも確かめる
    contains: (node) =>
      node === host ||
      (node instanceof Node && (host.contains(node) || node.getRootNode() === shadow)),
    draw,
    ensureAttached,
    setMode: (mode) => host.setAttribute("data-mode", mode),
    dispose: () => host.remove(),
  };
}
