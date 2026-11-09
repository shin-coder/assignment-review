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

- [ ] `pickDirectory()`: `showDirectoryPicker({ mode: "read" })` を呼ぶ。ユーザーがキャンセルした場合（`AbortError`）は `null` を返し、例外にしない
- [ ] `loadDirectory(handle)`: フォルダを再帰的に辿り `VirtualFileSystem` を返す
  - [ ] 引数は `FileSystemDirectoryHandle` の必要最小限（`name`, `kind`, `values()` / `entries()`, `getFile()`）だけに依存する型にする（E2E と単体テストで偽のハンドルを渡せるようにするため）
  - [ ] パスは `src/shared` の `normalizePath()` で正規化する
  - [ ] テキスト系（`.html` `.htm` `.css` `.js` `.mjs` `.json` `.svg` `.txt`）は文字列、それ以外は `ArrayBuffer` で保持する
  - [ ] 拡張子から `mimeType` を決める表を用意する（不明なものは `application/octet-stream`）
  - [ ] `node_modules` `.git` `.DS_Store` などは読み込まない
  - [ ] ファイル数・合計サイズの上限を設け、超えたらわかりやすいエラーを返す
- [ ] 書き込み系 API（`createWritable`, `removeEntry`, `getFileHandle({ create: true })` など）を一切使っていない
- [ ] エントリポイントの HTML を決める `findEntryHtml(vfs)`（`index.html` を優先、なければ最も浅い階層の `.html`）

## テストチェックリスト

- [ ] 偽のディレクトリハンドルで、ネストしたフォルダが正しいパスで読み込まれる
- [ ] テキストとバイナリが正しく判別される（画像が `ArrayBuffer` になる）
- [ ] 除外対象のフォルダ・ファイルが含まれない
- [ ] キャンセル時に `null` が返る
- [ ] 上限超過時にエラーになる
- [ ] `findEntryHtml()` の優先順位
- [ ] 偽のハンドルの書き込み系メソッドが一度も呼ばれない

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
