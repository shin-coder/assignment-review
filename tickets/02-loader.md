# 02: 読み込み層

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/loader/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

`showDirectoryPicker()` で生徒のフォルダを選び、その中身を `VirtualFileSystem`（パス → ファイル内容）として読み込む。

## 関連する設計ルール

- 読み込み層: `showDirectoryPicker()` で生徒のフォルダを選び、「パス → ファイル内容」の仮想ファイル群として保持する
- 読み込んだ生徒のフォルダには書き込まない

## 実装チェックリスト

- [x] `pickDirectory()`: `showDirectoryPicker({ mode: "read" })` を呼ぶ（型は `src/shared/file-system-access.d.ts`。Chrome 以外では存在しないので、ない場合は対応ブラウザでない旨のエラーを返す）。ユーザーがキャンセルした場合（`AbortError`）は `null` を返し、例外にしない
- [x] `loadDirectory(handle)`: フォルダを再帰的に辿り `VirtualFileSystem` を返す
  - [x] 引数は `FileSystemDirectoryHandle` の必要最小限（`name`, `kind`, `values()` / `entries()`, `getFile()`）だけに依存する型にする（E2E と単体テストで偽のハンドルを渡せるようにするため）
  - [x] パスは `src/shared` の `normalizePath()` で正規化する
  - [x] テキスト系（`.html` `.htm` `.css` `.js` `.mjs` `.json` `.svg` `.txt`）は文字列、それ以外は `ArrayBuffer` で保持する
  - [x] 拡張子から `mimeType` を決める表を用意する（不明なものは `application/octet-stream`）
  - [x] `node_modules` `.git` `.DS_Store` などは読み込まない
  - [x] ファイル数・合計サイズの上限を設け、超えたらわかりやすいエラーを返す
- [x] 書き込み系 API（`createWritable`, `removeEntry`, `getFileHandle({ create: true })` など）を一切使っていない
- [x] エントリポイントの HTML を決める `findEntryHtml(vfs)`（`index.html` を優先、なければ最も浅い階層の `.html`）

## テストチェックリスト

- [x] 偽のディレクトリハンドルで、ネストしたフォルダが正しいパスで読み込まれる
- [x] テキストとバイナリが正しく判別される（画像が `ArrayBuffer` になる）
- [x] 除外対象のフォルダ・ファイルが含まれない
- [x] キャンセル時に `null` が返る
- [x] 上限超過時にエラーになる
- [x] `findEntryHtml()` の優先順位
- [x] 偽のハンドルの書き込み系メソッドが一度も呼ばれない

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

- 2026-11-10: 公開している関数は `src/loader/index.ts` から。`pickDirectory()` / `loadDirectory(handle, { maxFiles, maxTotalBytes })` / `findEntryHtml(files)` / `getMimeType()` / `isTextPath()` / `LoaderError`（`code` は `"unsupported-browser" | "too-many-files" | "too-large"`、`message` はそのまま画面に出せる日本語）
- `loadDirectory()` の戻り値は `VirtualFileSystem` そのものではなく `{ name: string; files: VirtualFileSystem }`（`LoadedDirectory`）。`name` は選んだフォルダの名前で、`ProjectSnapshot.name` に使える
- 2026-11-10（レビュー後）: 改善案を反映。型の互換性テストを `expectTypeOf` に、`mime.test.ts` を追加、合計サイズ超過のメッセージも検証
- 除外のルール: 名前がドットで始まるもの（`.git` `.DS_Store` `.vscode` など）と `node_modules` `Thumbs.db`。フォルダ内のどの階層でも同じ
- 上限の既定値: 2000 ファイル・合計 100 MB（`DEFAULT_MAX_FILES` / `DEFAULT_MAX_TOTAL_BYTES`）。サイズはファイルを読む前に `size` で数える
- 読み込み順（`Map` の順）は、各フォルダの中で名前順。ハンドルが返す順番に左右されない
- テキストは UTF-8 として読む（`File.text()`）。Shift_JIS など他の文字コードのファイルは文字化けする。必要になったら別チケットで対応する
- `src/loader/fakeHandles.ts` の `createFakeDirectory()` は、書き込み系メソッドの呼び出しを記録できる偽のハンドル。12 の結合テストでも使える
- `src/loader/fixtures.test.ts` で、`tests/fixtures` の 3 つのサンプルを実ファイルから読み込めることも確認している（画像が PNG のバイト列のまま `ArrayBuffer` になる、など）

## レビュー

- 判定: 承認
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功
  - vitest: 成功（全体 71 件、うち `src/loader` 30 件）
  - eslint: 成功
  - prettier --check: 成功
  - playwright: 対象外
- 確認した根拠:
  - `pickDirectory()`: `src/loader/pickDirectory.ts:10-25`（`mode: "read"`、関数がなければ `unsupported-browser`、`AbortError` は `null`）
  - `loadDirectory()` の再帰: `src/loader/loadDirectory.ts:61-100`。最小限の型: `src/loader/loadDirectory.ts:9-25`（`name` / `kind` / `values()` / `getFile()` のみ。`src/loader/loadDirectory.test.ts:116-121` の型チェックで本物の `FileSystemDirectoryHandle` が渡せることを tsc が確認）
  - `normalizePath()`: `src/loader/loadDirectory.ts:70`
  - テキストと `ArrayBuffer` の判別: `src/loader/mime.ts:2,45-47`、`src/loader/loadDirectory.ts:94`
  - MIME の表と `application/octet-stream`: `src/loader/mime.ts:4-43`
  - 除外: `src/loader/loadDirectory.ts:44-49,64`
  - 上限: `src/loader/loadDirectory.ts:76-89`（日本語のエラーメッセージ）
  - 書き込み系 API: `src/loader/` の実装コードに `createWritable` / `removeEntry` / `getFileHandle` / `getDirectoryHandle` / `readwrite` の使用なし（偽のハンドル `src/loader/fakeHandles.ts` 内の記録用メソッドのみ）
  - `findEntryHtml()`: `src/loader/findEntryHtml.ts:10-26`
  - テスト: ネスト `src/loader/loadDirectory.test.ts:9-30`、テキスト／バイナリ `:32-52`、除外 `:54-68`、上限 `:79-96`、書き込みなし `:98-109`、キャンセル `src/loader/pickDirectory.test.ts:15-21`、優先順位 `src/loader/findEntryHtml.test.ts:9-36`、実ファイル `src/loader/fixtures.test.ts`。`skip` / `only` の残りや期待値のない `expect` はなし
- 未達の項目: なし
- ルール違反: なし（変更は `src/loader/` と `tickets/02-loader.md` のみ。`src/shared/`・`package.json`・`pnpm-lock.yaml`・ルートの設定ファイル・`tests/fixtures/` は未変更。`package-lock.json` / `yarn.lock` なし）
- その他の指摘（任意・判定には影響しない改善案）:
  - `loadDirectory()` はチェックリストの「`VirtualFileSystem` を返す」と違い `{ name, files }`（`LoadedDirectory`）を返す（`src/loader/loadDirectory.ts:37-41,101`）。フォルダ名を持てるので妥当だが、12 の担当が迷わないようメモ欄に戻り値の形を書いておくとよい
  - `src/loader/loadDirectory.test.ts:116-121` は実行時には常に通る（`null` を渡して `not.toThrow()`）。意味があるのは tsc の型チェックの部分なので、`expectTypeOf<FileSystemDirectoryHandle>().toMatchTypeOf<DirectoryHandleLike>()` などにすると意図がはっきりする
  - `getMimeType()` の不明な拡張子（`application/octet-stream`）と拡張子なしのファイル、大文字の拡張子（`.PNG`）の直接のテストがない。`src/loader/mime.ts` 用の小さなテストを足すとよい
  - 合計サイズ超過のエラーメッセージ（`too-large`）の文面は検証していない（`src/loader/loadDirectory.test.ts:89-96`）。件数のテストと同様に `toContain("MB")` 程度を足してもよい
  - ドットで始まる名前をすべて除外するため、`.well-known/` や `.htaccess` も読み込まれない。生徒サイトでは問題になりにくいが、仕様としてメモに書いてあるのでそのままでよい
