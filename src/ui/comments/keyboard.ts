import type { KeyboardEvent } from "react";

/**
 * コメントの送信キーか。Enter で送信、Shift + Enter は改行（Figma と同じ）。
 * 日本語入力の変換確定中の Enter は送信扱いにしない
 */
export function isSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing;
}
