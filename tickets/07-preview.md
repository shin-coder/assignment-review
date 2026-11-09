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

- [ ] `install` で `skipWaiting()`、`activate` で `clients.claim()` を呼ぶ
- [ ] `sw:put-files` を受け取り、セッションごとのファイル群を保持して `sw:ack` を返す
- [ ] Service Worker が停止・再起動してもファイルを返せるよう、メモリだけでなく Cache Storage か IndexedDB にも保存する
- [ ] `sw:clear` でセッションのファイルを破棄する
- [ ] `fetch` で `PREVIEW_PREFIX/<sessionId>/<path>` を横取りし、該当ファイルを `mimeType` 付きで返す
  - [ ] ディレクトリパス（末尾 `/`）は `index.html` を返す
  - [ ] クエリ文字列・ハッシュを無視してパスを解決する
  - [ ] パスは URL デコードしてから `normalizePath()` で正規化する
  - [ ] 該当ファイルがなければ 404 を返す
  - [ ] HTML / CSS / JS は `Cache-Control: no-store` を付ける
- [ ] `PREVIEW_PREFIX` 以外のリクエストには手を出さない

### 親アプリ側（`src/preview/`）

- [ ] `registerPreviewWorker()`: Service Worker を登録し、`navigator.serviceWorker.ready` に加えて**このページが制御下に入るまで**（`controller` が設定されるまで／`controllerchange`）待つ Promise を返す
- [ ] `putFiles(sessionId, files)`: ファイルを送って `sw:ack` を待つ
- [ ] `PreviewFrame` React コンポーネント
  - [ ] Service Worker の準備と `putFiles` の完了前は iframe を描画しない（読み込み中表示を出す）
  - [ ] `rebuildKey` が変わったら iframe を作り直す（`key` を変えて再マウント）。JS 編集時に使う
  - [ ] iframe の `onLoad` と `review:ready` メッセージを受け取ったことを親に通知する
  - [ ] iframe の DOM に React で何かを描画しない
- [ ] `postToFrame(iframe, message)` / `onFrameMessage(handler)`: `src/shared` のメッセージ型と型ガードを使ったヘルパー。`event.source` が対象の iframe のものか確認する

## テストチェックリスト

- [ ] Service Worker の `fetch` 処理を関数として切り出し、単体テストする（パス解決・`index.html` の補完・クエリ無視・404・`mimeType`）
- [ ] `sw:put-files` → 取り出しで内容が一致する（テキスト・バイナリ）
- [ ] `registerPreviewWorker()` が制御下に入るまで解決しない（`navigator.serviceWorker` のモックで、`ready` は解決済みだが `controller` が `null` のケース）
- [ ] `PreviewFrame` が準備完了前に iframe を描画しない
- [ ] `rebuildKey` を変えると iframe が再マウントされる
- [ ] `onFrameMessage` が型ガードを通らないメッセージ・別の送信元のメッセージを無視する
- [ ] （手動）`localhost` で初回アクセス時（Service Worker 未登録の状態）にもプレビューが表示されることを確認した。シークレットウィンドウか DevTools の「Unregister」で確認する

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
