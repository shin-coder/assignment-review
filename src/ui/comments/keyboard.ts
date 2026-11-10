import type { KeyboardEvent } from "react";

/**
 * Ctrl + Enter（Mac では Cmd + Enter）が押されたかを返す。
 * 日本語入力の変換確定中の Enter は送信扱いにしない
 */
export function isSubmitShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing
  );
}
