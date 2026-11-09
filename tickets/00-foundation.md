# 00: 基盤セットアップと共有契約

- Wave: 0（最初に単独で実施）
- 依存: なし
- 担当ディレクトリ: リポジトリのルート設定ファイル, `src/shared/`, 各ディレクトリの雛形
- 変更禁止の領域: なし（このチケットがすべての土台を決める）

## 目的

Wave 1 のチケットが互いを待たずに同時に進められるよう、ツール類・依存パッケージ・ディレクトリ構成・**層の間でやり取りする型とメッセージ**を先に確定させる。

## 関連する設計ルール

- パッケージマネージャーは pnpm（npm / yarn は使わない）
- テストは Vitest（単体）と Playwright（E2E、Chromium のみ）
- Service Worker は安全なコンテキストでしか動かないため、開発は `localhost` で配信する
- 対応ブラウザは Chrome のみ

## 実装チェックリスト

### ツール類

- [ ] Vite + React + TypeScript のプロジェクトを pnpm で作成する
- [ ] `tsconfig.json` を strict で設定する（`lib` に `DOM`, `DOM.Iterable`, `WebWorker` 用の別 tsconfig を用意して Service Worker の型を分ける）
- [ ] Vitest を設定する（環境は `jsdom`。`fake-indexeddb` を使えるようにする）
- [ ] Playwright を設定する（`projects` は Chromium のみ、`webServer` で Vite 開発サーバを `localhost` で起動、テストディレクトリは `e2e/`）
- [ ] ESLint（TypeScript + React Hooks）と Prettier を設定し、競合しないようにする
- [ ] `package.json` の `scripts` に `dev` / `build` / `preview` を用意する（チェック系は `CLAUDE.md` のとおり `pnpm exec` で実行）
- [ ] 開発サーバが `http://localhost` で起動することを確認する

### 依存パッケージ（Wave 1 で `package.json` を触らなくて済むよう、ここで全部入れる）

- [ ] `parse5`（位置情報付きの HTML 解析。ブラウザと同じ規則で不正な HTML を補正する）
- [ ] `idb`（IndexedDB ラッパー）、`fake-indexeddb`（テスト用）
- [ ] CodeMirror 6（`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-javascript`）
- [ ] `@testing-library/react`, `@testing-library/user-event`, `jsdom`
- [ ] Service Worker と注入スクリプトを別エントリとしてビルドする仕組み（Vite の `build.rollupOptions.input` などで `src/sw/sw.ts` と `src/inject/inject.ts` を出力し、開発サーバでも配信できるようにする）

### ディレクトリ構成（空の `index.ts` を置いて雛形を作る）

- [ ] `src/shared/` `src/loader/` `src/store/` `src/parser/` `src/edit/` `src/comments/` `src/preview/` `src/sw/` `src/inject/` `src/ui/layer-tree/` `src/ui/editor/` `src/ui/comments/` `src/app/` `tests/fixtures/` `e2e/`

### 共有契約（`src/shared/`）

各層はこの型だけを通じてやり取りする。中身は次の方針で定義する。

- [ ] `vfs.ts`
  - `VirtualFile`: `{ path: string; mimeType: string; content: string | ArrayBuffer }`（テキストは文字列、画像などはバイナリ）
  - `VirtualFileSystem`: `Map<string, VirtualFile>`
  - パスの正規化規則: ルート相対・`/` 区切り・先頭の `/` なし（例: `index.html`, `css/style.css`）。`normalizePath()` を実装する
- [ ] `location.ts`
  - `SourceLocation`: `{ filePath: string; start: number; end: number }`（ソーステキスト上の UTF-16 オフセット。`end` は含まない）
  - `TextChange`: `{ filePath: string; start: number; end: number; insertedLength: number }`（編集で「`start`〜`end` が `insertedLength` 文字に置き換わった」ことを表す。05 が出力し 06 が使う）
- [ ] `element.ts`
  - `ElementId`: `string`
  - `REVIEW_ID_ATTR = "data-review-id"`（プレビュー用 HTML の各要素に付ける属性名。JS が後から生成した要素には付かない）
  - `ElementInfo`: `{ id: ElementId; tagName: string; filePath: string; location: SourceLocation; startTag: SourceLocation; parentId: ElementId | null; childIds: ElementId[] }`
  - `ElementSourceMap`: `Map<ElementId, ElementInfo>`
  - `LayerNode`: `{ id: ElementId; label: string; children: LayerNode[] }`（レイヤーツリー表示用。`label` は `div.card#main` のような表記）
- [ ] `comment.ts`
  - `ReviewComment`: `{ id: string; location: SourceLocation; body: string; createdAt: number; status: "active" | "orphaned" }`（DOM ノードではなくソース位置に紐付ける。対応箇所が編集で消えたら `orphaned`）
- [ ] `project.ts`
  - `ProjectSnapshot`: `{ projectId: string; name: string; originalFiles: VirtualFileSystem; editedTexts: Record<string, string>; comments: ReviewComment[]; updatedAt: number }`
  - `ProjectRepository` インターフェース: `save(snapshot)`, `load(projectId)`, `list()`, `remove(projectId)`（03 が実装し、他はモックで使う）
- [ ] `messages.ts`（iframe ↔ 親アプリの `postMessage`。すべて `type` が `review:` で始まる判別可能なユニオン型）
  - 親 → iframe: `review:highlight { elementId | null }`, `review:replace-element { elementId, html }`, `review:replace-css { path, text }`
  - iframe → 親: `review:ready`, `review:hover { elementId | null }`, `review:select { elementId | null; generated: boolean }`（`generated` は JS が生成した要素をクリックしたとき `true`）
  - 受信側で使う型ガード `isFrameMessage()` / `isParentMessage()`
- [ ] `preview.ts`
  - `PREVIEW_PREFIX = "/__preview__/"`（iframe が開くパス。Service Worker がこの配下のリクエストに仮想ファイルを返す）
  - `INJECT_SCRIPT_PATH`（注入スクリプトの配信パス）
  - 親 → Service Worker のメッセージ型: `sw:put-files { sessionId, files }`, `sw:clear { sessionId }`、応答 `sw:ack`
- [ ] `src/shared/index.ts` からすべて再エクスポートする

## テストチェックリスト

- [ ] `normalizePath()` の単体テスト（`./a/b.css`、`a\\b.css`、先頭 `/`、`..` を含むパス）
- [ ] メッセージ型ガードの単体テスト（正しいメッセージ・`type` 違い・`null`・別オリジン由来を想定した不正な形）
- [ ] 空のテストでも `pnpm exec vitest run` が通る状態にする

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る
- [ ] `pnpm exec playwright test` が（テスト 0 件でも）エラーなく実行できる
- [ ] Wave 1 の各チケットが `src/shared/` を変更せずに着手できる状態になっている

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
