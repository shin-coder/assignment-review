/// <reference lib="webworker" />
// Service Worker の入口。中身はチケット 07 で実装する
// 型チェック: pnpm exec tsc --noEmit -p tsconfig.sw.json

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

export {};
