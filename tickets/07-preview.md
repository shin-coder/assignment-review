# 07: プレビュー層（Service Worker と iframe）

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/preview/`, `src/sw/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

iframe でプレビュー用のパス（`PREVIEW_PREFIX` 配下）を開き、Service Worker がそのリクエストに仮想ファイルを返す仕組みを作る。

## 関連する設計ルール

- プレビュー層: iframe でプレビュー用のパスを開き、Service Worker がそのリクエストに仮想ファイルを返す
- Service Worker の登録完了を待ってから iframe を表示する（登録直後の読み込みは Service Worker の制御下に入らない）
- Service Worker は安全なコンテキストでしか動かないため、開発は `localhost`、公開時は HTTPS で配信する
- JS が編集されたら、編集後の HTML/CSS/JS から iframe を作り直す
- React は親アプリの UI にだけ使う。iframe 内の生徒サイトを React で描画しない

## 責務の範囲

Service Worker は「受け取ったファイルをそのまま返す」だけにする。`data-review-id` や注入スクリプトの挿入は 04 の関数を使って 12（統合）で行い、変換済みのファイルを Service Worker に渡す。

## 実装チェックリスト

### Service Worker（`src/sw/sw.ts`）

- [x] `install` で `skipWaiting()`、`activate` で `clients.claim()` を呼ぶ
- [x] `sw:put-files` を受け取り、セッションごとのファイル群を保持して `sw:ack` を返す
- [x] Service Worker が停止・再起動してもファイルを返せるよう、メモリだけでなく Cache Storage か IndexedDB にも保存する
- [x] `sw:clear` でセッションのファイルを破棄する
- [x] `fetch` で `PREVIEW_PREFIX/<sessionId>/<path>` を横取りし、該当ファイルを `mimeType` 付きで返す
  - [x] ディレクトリパス（末尾 `/`）は `index.html` を返す
  - [x] クエリ文字列・ハッシュを無視してパスを解決する
  - [x] パスは URL デコードしてから `normalizePath()` で正規化する
  - [x] 該当ファイルがなければ 404 を返す
  - [x] HTML / CSS / JS は `Cache-Control: no-store` を付ける
- [x] `PREVIEW_PREFIX` 以外のリクエストには手を出さない

### 親アプリ側（`src/preview/`）

- [x] `registerPreviewWorker()`: Service Worker を `serviceWorkerScriptUrl(import.meta.env.DEV)` から `{ type: "module", scope: "/" }` で登録し（開発時は Vite が TS を ES モジュールとして配信するため `type: "module"` が必要。スコープ `/` は開発サーバの `Service-Worker-Allowed` ヘッダーで許可済み）、`navigator.serviceWorker.ready` に加えて**このページが制御下に入るまで**（`controller` が設定されるまで／`controllerchange`）待つ Promise を返す
- [x] `putFiles(sessionId, files)`: ファイルを送って `sw:ack` を待つ
- [x] `PreviewFrame` React コンポーネント
  - [x] Service Worker の準備と `putFiles` の完了前は iframe を描画しない（読み込み中表示を出す）
  - [x] `rebuildKey` が変わったら iframe を作り直す（`key` を変えて再マウント）。JS 編集時に使う
  - [x] iframe の `onLoad` と `review:ready` メッセージを受け取ったことを親に通知する
  - [x] iframe の DOM に React で何かを描画しない
- [x] `postToFrame(iframe, message)` / `onFrameMessage(handler)`: `src/shared` のメッセージ型と型ガードを使ったヘルパー。`event.source` が対象の iframe のものか確認する

## テストチェックリスト

- [x] Service Worker の `fetch` 処理を関数として切り出し、単体テストする（パス解決・`index.html` の補完・クエリ無視・404・`mimeType`）
- [x] `sw:put-files` → 取り出しで内容が一致する（テキスト・バイナリ）
- [x] `registerPreviewWorker()` が制御下に入るまで解決しない（`navigator.serviceWorker` のモックで、`ready` は解決済みだが `controller` が `null` のケース）
- [x] `PreviewFrame` が準備完了前に iframe を描画しない
- [x] `rebuildKey` を変えると iframe が再マウントされる
- [x] `onFrameMessage` が型ガードを通らないメッセージ・別の送信元のメッセージを無視する
- [ ] （手動）`localhost` で初回アクセス時（Service Worker 未登録の状態）にもプレビューが表示されることを確認した。シークレットウィンドウか DevTools の「Unregister」で確認する（この環境ではブラウザを起動できないため未実施。13 の E2E「Service Worker 初回登録時の表示」で確認する）

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec tsc --noEmit -p tsconfig.sw.json` が通る（Service Worker は DOM と型が衝突するため別の設定で確認する）
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### 構成

- `src/sw/sw.ts`: イベント（install / activate / message / fetch）につなぐだけ。処理の本体は `src/preview/worker/` にある。`tsconfig.json` は `src/sw` を除外しているため、型に依存しない処理を `src/preview/worker/` に置いてテストし、`tsconfig.sw.json`（WebWorker の型）が import をたどって同じコードを型チェックする（`Response` / `Headers` / `URL` / IndexedDB など DOM と WebWorker の両方にある API だけを使う）
- `src/preview/worker/serve.ts`: `handlePreviewFetch(request, origin, reader)`。`PREVIEW_PREFIX` 外は `null`（`respondWith` しない）。ディレクトリ（末尾 `/`・セッション直下）は `index.html`、クエリ・ハッシュ無視、URL デコード後に `normalizePath()`、なければ 404、不正なパスは 400、GET / HEAD 以外は 405、読み出し失敗は 500。`foo` が無く `foo/index.html` があれば `foo/` へ 301（相対パスを正しく解決させるため）。HTML / CSS / JS は `Cache-Control: no-store`。テキストには `charset=utf-8` を補う
- `src/preview/worker/fileStore.ts`: メモリ＋IndexedDB（DB 名 `student-site-review-preview`、キー `[sessionId, path]`）。`putFiles` は、セッションのファイルをまるごと置き換え、変わったファイルだけを IndexedDB に書く。保存が終わってから ack を返す。書き込みは 1 本の列で順番に処理する。Service Worker が再起動してメモリが空でも、最初の `getFile` で IndexedDB から読み直す。ArrayBuffer のバイナリも保存できる
- `src/preview/worker/messages.ts`: `sw:put-files` / `sw:clear` / `sw:claim` の検証と処理。`requestId` 付きの不正な `sw:` メッセージには `ok: false` を返す

### 公開 API（`src/preview/index.ts`、12 が使う）

- `registerPreviewWorker(options?)`: `Promise<ServiceWorkerRegistration>`。起動時に 1 回だけ呼び、返ってきた Promise を保持して `PreviewFrame` の `workerReady` に渡す。`ready` の後、`controller` が設定される（`controllerchange`）まで解決しない。10 秒で `PreviewError("no-controller")`。`navigator.serviceWorker` がなければ `PreviewError("unsupported")`
- `putFiles(sessionId, files, options?)`: `Promise<void>`。セッションのファイルをまるごと置き換え、保存完了の `sw:ack` を待つ。`ok: false` は `PreviewError("worker-error")`、30 秒で `"timeout"`、制御下にないと `"no-controller"`
- `clearFiles(sessionId, options?)`: `sw:clear` を送る（プロジェクト削除時に使う）
- `PreviewFrame`（props）
  - `sessionId`, `files: readonly VirtualFile[]`（変換済みのプレビュー用ファイル。`data-review-id` と操作スクリプトは 12 が入れる）, `entryPath`（例 `"index.html"`）, `workerReady: Promise<unknown>`
  - `rebuildKey?`: 変わると、`files` を送り直してから iframe を作り直す（送信中は前の iframe を表示したまま）
  - `files` が変わると送り直す（iframe はそのまま）。CSS 編集時は新しい `files` を渡してから `review:replace-css` を送る。`files` の中身が変わったときだけ新しい配列を渡すこと（毎回新しい配列だと毎回送信する。`useMemo` で作る）
  - `sessionId` が変わると読み込み中表示に戻る
  - `onLoad(iframe)`, `onReady(iframe)`（`review:ready` 受信）, `onMessage(message, iframe)`（検証済みの全メッセージ）, `onError(error)`, `ref`（iframe 要素）, `title`, `className`, `sendFiles`（テスト用の差し替え）
  - 準備前・失敗時は iframe を描画せず、`role="status"` / `role="alert"` の文を出す
- `postToFrame(iframe, message): boolean`: `ParentToFrameMessage` を `window.location.origin` 宛てに送る
- `onFrameMessage(frame, handler, target?)`: `frame` は iframe 要素か `() => iframe | null`。`event.source` が iframe の `contentWindow` と一致し、オリジンが同じで、`isFrameMessage` を通るものだけ `handler(message, event)` を呼ぶ。戻り値で解除
- `PreviewError` / `PreviewErrorCode`、`ServiceWorkerContainerLike` などの型

### Service Worker とのメッセージの流れ

1. 親が `registerPreviewWorker()` で登録 → SW の `install` で `skipWaiting()`、`activate` で `clients.claim()` → 親の `controllerchange` で解決
2. 親が `putFiles()`: `navigator.serviceWorker.controller.postMessage({ type: "sw:put-files", requestId, sessionId, files }, [port2])`。`MessageChannel` を作り、返事は port1 で受ける（ArrayBuffer は transfer せず複製）
3. SW が IndexedDB への保存まで終えてから `{ type: "sw:ack", requestId, ok, error? }` を `event.ports[0]` に返す（port がなければ `event.source`）。`event.waitUntil` で保存中に止められないようにする
4. iframe が `previewUrl(sessionId, path)` を開く → SW の `fetch` が横取りして返す。iframe 内の相対パス（css / 画像 / js）も同じセッションの配下に解決される

### 共有契約への依頼・補足（00 または 12 向け）

- `registerPreviewWorker()` は、ページが制御下に入らないまま開かれた場合（Shift+再読み込みなど。この場合 `activate` が起きず `controllerchange` も来ない）に備え、有効な SW に `{ type: "sw:claim", requestId }` を送って `clients.claim()` を呼ばせる。この型は `src/shared` にないため `src/preview/worker/messages.ts` に `WorkerClaimMessage` としてローカルに定義した。`src/shared/preview.ts` の `ParentToWorkerMessage` に取り込むかは 00 側で判断してほしい（取り込まなくても動く）
- プロジェクトを削除・切り替えたら、12 は `clearFiles(oldSessionId)` を呼んで IndexedDB の古いセッションを消すこと（呼ばないと残り続ける）
- セッション ID は起動のたびに新しい値にするより、プロジェクト ID から決めるほうが IndexedDB に溜まらない（12 で決める）

### 未実施

- 手動確認（localhost で Service Worker 未登録の初回表示）は、この環境にブラウザがなく未実施。13 の E2E「Service Worker の初回登録時でも、プレビューが正しく表示される」で確認する
- 実ブラウザでの Service Worker の fetch、`type: "module"` での登録、`pnpm build` で出力した `dist/sw.js`（単一ファイルにまとまり、IndexedDB 処理を含むことは確認済み）の動作は、13 の E2E で確認する

### 確認結果

- `pnpm exec tsc --noEmit` / `pnpm exec tsc --noEmit -p tsconfig.sw.json` / `pnpm exec eslint .` / `pnpm exec prettier --check .` / `pnpm build`（`dist/sw.js` を出力）が通る
- `pnpm exec vitest run` は 174 件が通る（07 のテストは `src/preview/**/*.test.ts(x)`）

## レビュー

- 判定:
- 日付:
- 指摘事項:
