/// <reference lib="webworker" />
// Service Worker の入口。PREVIEW_PREFIX 配下のリクエストに仮想ファイルを返す。
// 処理の中身は src/preview/worker/ にあり（単体テストもそこ）、ここではイベントにつなぐだけにする。
// 型チェック: pnpm exec tsc --noEmit -p tsconfig.sw.json
import { createPreviewFileStore, handlePreviewFetch, handleWorkerMessage } from "../preview/worker";

declare const self: ServiceWorkerGlobalScope;

// メモリ + IndexedDB。Service Worker が止められて起動し直しても IndexedDB から読み直す
const store = createPreviewFileStore();

self.addEventListener("install", () => {
  // 新しい版をすぐに有効にする
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 登録したページをすぐに制御下に入れる（親アプリは controllerchange を待っている）
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const port = event.ports[0];
  const source = event.source;
  const task = handleWorkerMessage(event.data, {
    store,
    claim: () => self.clients.claim(),
  }).then((ack) => {
    if (ack === null) return;
    // 親アプリは MessageChannel の port を付けて送る。付いていなければ送信元に返す
    if (port) port.postMessage(ack);
    else source?.postMessage(ack);
  });
  // 保存が終わるまで Service Worker を止めさせない
  event.waitUntil(task);
});

self.addEventListener("fetch", (event) => {
  // PREVIEW_PREFIX 以外のリクエストには手を出さない（respondWith を呼ばずにブラウザに任せる）
  const response = handlePreviewFetch(event.request, self.location.origin, store);
  if (response) event.respondWith(response);
});
