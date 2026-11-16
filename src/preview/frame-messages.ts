// 親アプリ ↔ iframe（操作スクリプト）の postMessage のヘルパー
import { isFrameMessage, type FrameToParentMessage, type ParentToFrameMessage } from "../shared";

/** 対象の iframe。作り直しで要素が変わるため、その時点の要素を返す関数も受け付ける */
export type FrameTarget = HTMLIFrameElement | (() => HTMLIFrameElement | null);

function resolveFrame(target: FrameTarget): HTMLIFrameElement | null {
  return typeof target === "function" ? target() : target;
}

/**
 * iframe にメッセージを送る。プレビューは親アプリと同じオリジンで配信するため、
 * 送り先のオリジンを自分のオリジンに限る（生徒サイトのリンクで外部サイトに移動していたら届かない）。
 * iframe がまだ読み込まれていなければ false を返す
 */
export function postToFrame(iframe: HTMLIFrameElement, message: ParentToFrameMessage): boolean {
  const target = iframe.contentWindow;
  if (!target) return false;
  target.postMessage(message, window.location.origin);
  return true;
}

/**
 * iframe からのメッセージを受け取る。次のものは無視する
 * - 送信元が対象の iframe のウィンドウでない
 * - オリジンが親アプリと違う
 * - src/shared の型ガード（isFrameMessage）を通らない
 * 戻り値の関数で受け取りをやめる
 */
export function onFrameMessage(
  frame: FrameTarget,
  handler: (message: FrameToParentMessage, event: MessageEvent) => void,
  target: Window = window,
): () => void {
  const listener = (event: MessageEvent) => {
    const iframe = resolveFrame(frame);
    if (!iframe || iframe.contentWindow === null || event.source !== iframe.contentWindow) return;
    if (event.origin !== target.location.origin) return;
    const data: unknown = event.data;
    if (!isFrameMessage(data)) return;
    handler(data, event);
  };
  target.addEventListener("message", listener);
  return () => target.removeEventListener("message", listener);
}
