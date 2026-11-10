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

- [x] Vite + React + TypeScript のプロジェクトを pnpm で作成する
- [x] `tsconfig.json` を strict で設定する（`lib` に `DOM`, `DOM.Iterable`, `WebWorker` 用の別 tsconfig を用意して Service Worker の型を分ける）
- [x] Vitest を設定する（環境は `jsdom`。`fake-indexeddb` を使えるようにする）
- [x] Playwright を設定する（`projects` は Chromium のみ、`webServer` で Vite 開発サーバを `localhost` で起動、テストディレクトリは `e2e/`）
- [x] ESLint（TypeScript + React Hooks）と Prettier を設定し、競合しないようにする
- [x] `package.json` の `scripts` に `dev` / `build` / `preview` を用意する（チェック系は `CLAUDE.md` のとおり `pnpm exec` で実行）
- [x] 開発サーバが `http://localhost` で起動することを確認する

### 依存パッケージ（Wave 1 で `package.json` を触らなくて済むよう、ここで全部入れる）

- [x] `parse5`（位置情報付きの HTML 解析。ブラウザと同じ規則で不正な HTML を補正する）
- [x] `idb`（IndexedDB ラッパー）、`fake-indexeddb`（テスト用）
- [x] CodeMirror 6（`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-javascript`）
- [x] `@testing-library/react`, `@testing-library/user-event`, `jsdom`
- [x] Service Worker と注入スクリプトを別エントリとしてビルドする仕組み（Vite の `build.rollupOptions.input` などで `src/sw/sw.ts` と `src/inject/inject.ts` を出力し、開発サーバでも配信できるようにする）

### サプライチェーン対策

- [x] 導入する各パッケージについて、npm と GitHub で次を確認し、確認したことと確認日をメモ欄に記録する（数値の記録は不要）
  - [x] 2026 年に新しいバージョンの公開またはリポジトリの更新がある（ない場合は代わりのパッケージを検討し、採用するなら理由をメモ欄に書く）
  - [x] GitHub リポジトリがアーカイブされていない
  - [x] npm の `repository` が想定どおりの公式リポジトリを指している（名前の似た偽パッケージでない）
- [x] `package.json` の `packageManager` で pnpm のバージョンを固定する
- [x] 依存パッケージのバージョンを範囲指定（`^` `~`）なしの完全一致で固定する（`.npmrc` に `save-exact=true`）
- [ ] `pnpm-lock.yaml` を必ずコミットし、CI やテストでは `pnpm install --frozen-lockfile` で入れる
- [x] `pnpm-workspace.yaml` に `minimumReleaseAge` を設定し、公開から一定期間（例: 7 日 = `10080` 分）たっていないバージョンを入れないようにする
- [x] インストール時のスクリプト（`postinstall` など）は既定で実行させず、必要なパッケージ（`esbuild` など）だけを `onlyBuiltDependencies` で許可する
- [x] `pnpm audit` を実行し、既知の脆弱性がないことを確認する（あれば対応方針をメモ欄に書く）

### ディレクトリ構成（空の `index.ts` を置いて雛形を作る）

- [x] `src/shared/` `src/loader/` `src/store/` `src/parser/` `src/edit/` `src/comments/` `src/preview/` `src/sw/` `src/inject/` `src/ui/layer-tree/` `src/ui/editor/` `src/ui/comments/` `src/app/` `tests/fixtures/` `e2e/`

### 共有契約（`src/shared/`）

各層はこの型だけを通じてやり取りする。中身は次の方針で定義する。

- [x] `vfs.ts`
  - `VirtualFile`: `{ path: string; mimeType: string; content: string | ArrayBuffer }`（テキストは文字列、画像などはバイナリ）
  - `VirtualFileSystem`: `Map<string, VirtualFile>`
  - パスの正規化規則: ルート相対・`/` 区切り・先頭の `/` なし（例: `index.html`, `css/style.css`）。`normalizePath()` を実装する
- [x] `location.ts`
  - `SourceLocation`: `{ filePath: string; start: number; end: number }`（ソーステキスト上の UTF-16 オフセット。`end` は含まない）
  - `TextChange`: `{ filePath: string; start: number; end: number; insertedLength: number }`（編集で「`start`〜`end` が `insertedLength` 文字に置き換わった」ことを表す。05 が出力し 06 が使う）
- [x] `element.ts`
  - `ElementId`: `string`
  - `REVIEW_ID_ATTR = "data-review-id"`（プレビュー用 HTML の各要素に付ける属性名。JS が後から生成した要素には付かない）
  - `ElementInfo`: `{ id: ElementId; tagName: string; filePath: string; location: SourceLocation | null; startTag: SourceLocation | null; parentId: ElementId | null; childIds: ElementId[] }`（parse5 が補正で暗黙に作った要素は `location` / `startTag` が `null`）
  - `ElementSourceMap`: `Map<ElementId, ElementInfo>`
  - `LayerNode`: `{ id: ElementId; label: string; children: LayerNode[] }`（レイヤーツリー表示用。`label` は `div#main.card` のような表記）
- [x] `comment.ts`
  - `ReviewComment`: `{ id: string; location: SourceLocation; body: string; createdAt: number; status: "active" | "orphaned" }`（DOM ノードではなくソース位置に紐付ける。対応箇所が編集で消えたら `orphaned`）
- [x] `project.ts`
  - `ProjectSnapshot`: `{ projectId: string; name: string; originalFiles: VirtualFileSystem; editedTexts: Record<string, string>; comments: ReviewComment[]; updatedAt: number }`
  - `ProjectRepository` インターフェース: `save(snapshot)`, `load(projectId)`, `list()`, `remove(projectId)`（03 が実装し、他はモックで使う）
- [x] `messages.ts`（iframe ↔ 親アプリの `postMessage`。すべて `type` が `review:` で始まる判別可能なユニオン型）
  - 親 → iframe: `review:highlight { elementId | null }`, `review:replace-element { elementId, html }`, `review:replace-css { path, text }`
  - iframe → 親: `review:ready`, `review:hover { elementId | null }`, `review:select { elementId | null; generated: boolean }`（`generated` は JS が生成した要素をクリックしたとき `true`）
  - 受信側で使う型ガード `isFrameMessage()` / `isParentMessage()`
- [x] `preview.ts`
  - `PREVIEW_PREFIX = "/__preview__/"`（iframe が開くパス。Service Worker がこの配下のリクエストに仮想ファイルを返す）
  - `previewUrl(sessionId, path)`、`serviceWorkerScriptUrl(isDev)`、`injectScriptUrl(isDev)`（`src/shared` は Service Worker からも読むため `import.meta.env` に依存せず、呼び出し側が `import.meta.env.DEV` を渡す）
  - 親 → Service Worker のメッセージ型: `sw:put-files { requestId, sessionId, files }`, `sw:clear { requestId, sessionId }`、応答 `sw:ack { requestId, ok, error? }`
- [x] `src/shared/index.ts` からすべて再エクスポートする

## テストチェックリスト

- [x] `normalizePath()` の単体テスト（`./a/b.css`、`a\\b.css`、先頭 `/`、`..` を含むパス）
- [x] メッセージ型ガードの単体テスト（正しいメッセージ・`type` 違い・`null`・別オリジン由来を想定した不正な形）
- [x] 空のテストでも `pnpm exec vitest run` が通る状態にする

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る
- [x] `pnpm exec playwright test` が（テスト 0 件でも）エラーなく実行できる
- [x] Wave 1 の各チケットが `src/shared/` を変更せずに着手できる状態になっている

## メモ

- 2026-11-10: parse5・idb・CodeMirror 6 の更新状況はユーザーが npm / GitHub で確認済み。開発用の依存（Vite・TypeScript・Vitest・Playwright・ESLint・Prettier・Testing Library・fake-indexeddb・jsdom など）はユーザーが確認したうえで自分でインストールした。数値の記録は不要とユーザーが判断した
- 2026-11-10: `minimumReleaseAge` により parse5 は 8.1.1 ではなく 8.1.0 が入った
- 2026-11-10: TypeScript は 6.0.3 に固定。7.0 は typescript-eslint 8.72 が未対応で ESLint が起動しない（typescript-eslint の issue #10940）。対応したら 7 系への更新を検討する
- 2026-11-10: `pnpm build` で `dist/sw.js` と `dist/inject.js` がルートに出力されることを確認した
- 2026-11-10: 開発サーバと E2E は Claude のサンドボックス内ではポートを開けない。ユーザーが `pnpm exec playwright test` を実行し、`e2e/smoke.spec.ts` の 1 件が成功した（開発サーバが localhost で起動することも確認）
- 依存パッケージの追加は、Claude のサンドボックス内で実行するとプロジェクト内に `.pnpm-store` が作られて食い違うため、ユーザーが実行する
- 2026-11-10（レビュー対応）: `showDirectoryPicker` は TypeScript 6 の標準の型にないため、`src/shared/file-system-access.d.ts` で `Window` に省略可能なメソッドとして宣言した（Chrome 以外では存在しないので、呼び出し側で有無を確かめる）。`FileSystemDirectoryHandle.values()` は TypeScript 6 では `DOM.AsyncIterable` を足さなくても型が通ることを確認した
- 2026-11-10（レビュー対応）: `tsconfig.json` の `types` から `node` を外しても、テスト・設定ファイル経由で Node.js の型が全体に入ることを確認した。そのため `types` は元に戻し、`src/`（テストを除く）で `process` などの Node.js のグローバル変数を使うと ESLint の `no-restricted-globals` でエラーにした
- 2026-11-10（レビュー対応）: `src/sw/sw.ts` の `skipWaiting()` / `clients.claim()` は、ビルドの入口を用意するための仮の中身。チケット 07 が引き継いで書き換えてよい
- 2026-11-10（レビュー対応）: `pnpm build` で Vite 8 から `rollupOptions` についての警告は出ていない
- 2026-11-10: `pnpm audit` の結果は moderate 1 件。`eslint > minimatch`（`>=7.0.0 <11.0.1`、GHSA-g3hv-75wg-m249、パターンの展開によるサービス拒否）。lint 実行時だけ使う開発用の依存で、照合するパターンはこのリポジトリの設定ファイルにあるものだけのため、実害はほぼないと判断して受け入れる。`pnpm.overrides` で 11 系に上げると ESLint との互換性が保証されないため行わない。ESLint の更新で解消したら記録を消す
- Service Worker は DOM と WebWorker の型が衝突するため `tsconfig.sw.json` で別に型チェックする。`CLAUDE.md` のコマンドと Stop フック（`.claude/hooks/check.mjs`）にはまだ含まれていない

## レビュー

- 判定: 要修正
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功（`pnpm exec tsc --noEmit`）
  - tsc（Service Worker 用）: 成功（`pnpm exec tsc --noEmit -p tsconfig.sw.json`）
  - vitest: 成功（3 ファイル・41 件）
  - eslint: 成功（0 件）
  - prettier: 成功（`pnpm exec prettier --check .`）
  - playwright: 成功（ユーザー実行。2026-11-10、`e2e/smoke.spec.ts` の「アプリが localhost で表示される」1 件が成功。サンドボックス内ではポートを開けないためレビュワーは未実行）
- 未達の項目:
  - サプライチェーン対策「導入する各パッケージについて npm と GitHub で確認し、結果（確認日・最新バージョン・最終公開日・週間ダウンロード数）をメモ欄に記録する」とその 3 つの子項目: メモ欄（`tickets/00-foundation.md:104`）には parse5・idb・CodeMirror 6 について「確認済み（数値の記録はなし）」とあるだけで、求められている数値が記録されていない。開発用の依存は未記録と明記されている。さらに `react` / `react-dom`、`@codemirror/commands` / `@codemirror/language`、`@testing-library/dom` / `@testing-library/jest-dom`、`@vitejs/plugin-react`、`typescript-eslint`、`eslint-plugin-react-hooks` / `eslint-plugin-react-refresh`、`eslint-config-prettier`、`@eslint/js`、`globals`、`@types/*` はメモ欄に名前すら出てこない（`package.json:12-48`）。2026 年の更新・アーカイブの有無・`repository` の正しさをパッケージごとに記録する
  - サプライチェーン対策「`pnpm-lock.yaml` を必ずコミットし、CI やテストでは `pnpm install --frozen-lockfile` で入れる」: `pnpm-lock.yaml` は存在し、`importers` の `specifier` は `package.json` と完全一致している（`pnpm-lock.yaml:7-110`）が、未コミット（`git status` で untracked）。また `--frozen-lockfile` で入れる手順がどこにも書かれていない（CI 設定・`CLAUDE.md`・`package.json` のいずれにもない）
  - サプライチェーン対策「`pnpm audit` を実行し、既知の脆弱性がないことを確認する」: 実行結果の記録がメモ欄にない。ネットワークが必要なので、ユーザーがサンドボックス外で実行して結果をメモ欄に書く
  - 完了条件「Wave 1 の各チケットが `src/shared/` を変更せずに着手できる状態になっている」: 実装者が未チェック。レビュワーが 02〜11 のチケットと `src/shared/` を突き合わせた範囲では、各チケットが参照する型・定数・関数（`VirtualFile` / `normalizePath` / `SourceLocation` / `TextChange` / `ElementInfo`（`location` / `startTag` が `null` 可）/ `LayerNode` / `ReviewComment` / `ProjectRepository` / メッセージ型と型ガード / `PREVIEW_PREFIX` / `previewUrl` / `injectScriptUrl` / `serviceWorkerScriptUrl` / `sw:*` メッセージ）はすべてそろっており、大きな不足は見当たらない。ただし下の「その他の指摘」2 の型定義の件を確認したうえで、実装者が判断してチェックを付けること
- ルール違反:
  - なし（`package-lock.json` / `yarn.lock` なし。依存はすべて完全一致で固定、`.npmrc:1` に `save-exact=true`、`pnpm-workspace.yaml:2,4-5` に `minimumReleaseAge` と `onlyBuiltDependencies` あり。他層のディレクトリは `export {};` だけの雛形。`tickets/04・06・07・08・README` の変更は 00 で確定した共有契約に合わせた記述の更新で、コードの変更ではない）
- その他の指摘（任意・判定には影響しない改善案）:
  1. `src/sw/sw.ts:7-13` に `install` で `skipWaiting()`、`activate` で `clients.claim()` が入っている。これはチケット 07 の最初の実装項目そのもの。雛形としては問題ないが、07 の担当者が自分の作業として扱い、テストを書くよう 07 のメモ欄に一言残すとよい
  2. `tsconfig.json:4` の `lib` に `DOM.AsyncIterable` がない。チケット 02 は `FileSystemDirectoryHandle` の `values()` / `entries()` を使うが、TypeScript ではこれらの非同期反復の型は `DOM.AsyncIterable` に入っている。また `showDirectoryPicker()` は TypeScript 標準の DOM 型に含まれていない可能性がある（レビュワーの環境では型定義ファイルを検索できず未確認）。02 は自分のディレクトリ内で型を宣言すれば進められるが、ルートの設定ファイルは Wave 1 で変更できないため、必要なら 00 のうちに `lib` へ追加しておくとよい
  3. `LayerNode.label` の表記が文書ごとに違う。このチケットの共有契約（`tickets/00-foundation.md:72`）は `div.card#main`、`src/shared/element.ts:30` は `div#main.card`、チケット 04 は `tag#id.class1.class2`。コードとチケット 04 に合わせて、このチケットの記述を `div#main.card` に直す
  4. `tsconfig.json:8` の `types` に `node` が入っているため、ブラウザ用のコード（`src/`）でも `process` や `Buffer` が型エラーにならない。設定ファイルと E2E 用に別の tsconfig を分けるか、`src` 側で Node の型を使わないよう注意する
  5. Service Worker と注入スクリプトは開発時に Vite が ESM として配信し、ビルド後も `src/shared` を import すれば共有チャンクを import する ESM になる。07 では `navigator.serviceWorker.register(url, { type: "module", scope: "/" })` で登録する必要がある（04 の `<script type="module">` は対応済み）。07 のメモ欄に書いておくとよい。開発サーバで `Service-Worker-Allowed` ヘッダー（`vite.config.ts:6,14`）が実際に付くかは未確認なので、07 で確認する
  6. Vite 8 では `build.rollupOptions`（`vite.config.ts:17`）が非推奨の別名になっている可能性があるので、ドキュメントを確認し、必要なら `rolldownOptions` に移す（ビルドは成功しており、`dist/sw.js` と `dist/inject.js` が出力されていることは確認した）
  7. `CLAUDE.md` のコマンド一覧と Stop フックに、`pnpm exec tsc --noEmit -p tsconfig.sw.json` と `pnpm install --frozen-lockfile` が入っていない（メモ欄に記載あり）。`tickets/README.md` の並列開発ルールに書かれた `.prettierrc` は、実際のファイル名 `.prettierrc.json` に合わせる
