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
- 除外のルール: 名前がドットで始まるもの（`.git` `.DS_Store` `.vscode` など）と `node_modules` `Thumbs.db`。フォルダ内のどの階層でも同じ
- 上限の既定値: 2000 ファイル・合計 100 MB（`DEFAULT_MAX_FILES` / `DEFAULT_MAX_TOTAL_BYTES`）。サイズはファイルを読む前に `size` で数える
- 読み込み順（`Map` の順）は、各フォルダの中で名前順。ハンドルが返す順番に左右されない
- テキストは UTF-8 として読む（`File.text()`）。Shift_JIS など他の文字コードのファイルは文字化けする。必要になったら別チケットで対応する
- `src/loader/fakeHandles.ts` の `createFakeDirectory()` は、書き込み系メソッドの呼び出しを記録できる偽のハンドル。12 の結合テストでも使える
- `src/loader/fixtures.test.ts` で、`tests/fixtures` の 3 つのサンプルを実ファイルから読み込めることも確認している（画像が PNG のバイト列のまま `ArrayBuffer` になる、など）

## レビュー

- 判定:
- 日付:
- 指摘事項:
