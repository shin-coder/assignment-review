import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発時の Service Worker は /src/sw/sw.ts から配信されるため、
// スコープを "/" にできるよう Service-Worker-Allowed ヘッダーを付ける
const serviceWorkerHeaders = { "Service-Worker-Allowed": "/" };

// Service Worker と操作スクリプトはルートに固定名で出力する（src/shared/preview.ts の URL と対応）
const fixedNameEntries = new Set(["sw", "inject"]);

export default defineConfig({
  plugins: [react()],
  // Service Worker は安全なコンテキストでしか動かないため localhost で配信する
  server: { host: "localhost", port: 5173, strictPort: true, headers: serviceWorkerHeaders },
  preview: { host: "localhost", port: 4173, strictPort: true, headers: serviceWorkerHeaders },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        sw: "src/sw/sw.ts",
        inject: "src/inject/inject.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          fixedNameEntries.has(chunk.name) ? "[name].js" : "assets/[name]-[hash].js",
      },
    },
  },
});
