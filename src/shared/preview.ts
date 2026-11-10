import type { VirtualFile } from "./vfs";

/** iframe が開くパスの接頭辞。Service Worker がこの配下に仮想ファイルを返す */
export const PREVIEW_PREFIX = "/__preview__/";

/** プレビュー用の URL パス（例: "/__preview__/abc/index.html"） */
export function previewUrl(sessionId: string, path: string): string {
  return `${PREVIEW_PREFIX}${encodeURIComponent(sessionId)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

// 開発サーバでは TS のまま Vite が配信し、ビルド後はルートに出力した JS を使う。
// src/shared は Service Worker からも読むため import.meta.env に依存せず、呼び出し側が isDev を渡す

/** Service Worker のスクリプトの URL */
export function serviceWorkerScriptUrl(isDev: boolean): string {
  return isDev ? "/src/sw/sw.ts" : "/sw.js";
}

/** iframe 内に注入する操作スクリプトの URL */
export function injectScriptUrl(isDev: boolean): string {
  return isDev ? "/src/inject/inject.ts" : "/inject.js";
}

// 親アプリ → Service Worker

export type ParentToWorkerMessage =
  | { type: "sw:put-files"; requestId: string; sessionId: string; files: VirtualFile[] }
  | { type: "sw:clear"; requestId: string; sessionId: string };

/** Service Worker → 親アプリ。requestId で対応する依頼を示す */
export interface WorkerAckMessage {
  type: "sw:ack";
  requestId: string;
  ok: boolean;
  error?: string;
}
