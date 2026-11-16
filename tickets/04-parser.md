# 04: 解析層（要素 ↔ ソース位置の対応付け）

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/parser/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

HTML を解析して各要素のソース上の位置を記録し、「画面の要素 ↔ ソース位置」の対応表（`ElementSourceMap`）とレイヤーツリー用のデータを作る。あわせて、iframe 内の要素からこの対応表を引けるよう、プレビュー用 HTML の各要素に `data-review-id` 属性を付ける。

## 関連する設計ルール

- 解析層: HTML を解析して各要素のソース上の位置を記録し、「画面の要素 ↔ ソース位置」の対応表を作る
- JS が後から生成した要素はソース上に対応する位置がないため、編集・コメントの保存対象外として扱う
- 中核ロジック（要素 ↔ ソース位置の対応付け）には必ず Vitest の単体テストを書く

## 実装方針

- `parse5` を `sourceCodeLocationInfo: true` で使う。parse5 はブラウザと同じ規則で不正な HTML を補正するため、iframe 内の DOM 構造と一致させやすい
- 補正で生成された要素（暗黙に作られた `<tbody>` や `<html>` `<head>` `<body>` など、ソース上に開始タグがない要素）も対応表とツリーには入れるが、`location` と `startTag` を `null` にする（`src/shared/element.ts` の定義どおり）。これらは編集・コメントの対象外
- 属性はソースのテキストに**挿入**する形で付ける（parse5 で再シリアライズしない）。生徒のソースの書き方をプレビューでも保つため

## 実装チェックリスト

- [x] `analyzeHtml(filePath, source)`: `{ map: ElementSourceMap; tree: LayerNode[] }` を返す
  - [x] `ElementId` は解析ごとに決定的に振る（同じソースなら同じ ID。例: 文書順の連番）
  - [x] 各要素の要素全体の位置（`location`）と開始タグの位置（`startTag`）を記録する
  - [x] 閉じタグがない要素の `location.end` の扱いを決めて実装する（次の兄弟の開始位置／親の終了位置など）
  - [x] `LayerNode.label` を `tag#id.class1.class2` 形式で作る
  - [x] `<script>` `<style>` 内のテキストは要素として扱わない（`<script>` `<style>` 要素自体は対象）
- [x] `injectReviewIds(source, map)`: 各要素の開始タグに `data-review-id="..."` を挿入したプレビュー用 HTML を返す
  - [x] 自己終了タグ（`<img />`）や属性のない開始タグでも正しく挿入される
  - [x] 開始タグがソースにない要素には付けない
- [x] `injectScriptTag(html, scriptUrl)`: 注入スクリプト（URL は呼び出し側が `injectScriptUrl()` で求めて渡す）を読み込む `<script type="module">` を挿入する（`<head>` がなくても動く）
- [x] `findElementAt(map, filePath, offset)`: ソース上の位置からもっとも内側の要素を返す（エディタのカーソル → ツリー選択に使う）

## テストチェックリスト

- [x] 正しい HTML で、各要素の `location` / `startTag` が `source.slice(start, end)` で期待どおりのテキストになる
- [x] 親子関係（`parentId` / `childIds`）と `tree` が DOM 構造と一致する
- [x] 閉じタグ漏れ・ネスト誤り・属性のクォート漏れを含む HTML でも例外にならず、補正後の構造と位置が期待どおり（01 の `broken-html` を使う。期待値は Chrome で開いた DOM と照合）
- [x] 同じソースを 2 回解析すると同じ ID になる
- [x] `injectReviewIds` の結果を再度 parse5 で解析したとき、全要素の `data-review-id` が対応表の ID と一致する
- [x] `injectReviewIds` は `data-review-id` 以外のテキストを変えない（挿入部分を取り除くと元のソースに戻る）
- [x] `findElementAt` がネストした要素で最も内側を返す

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### 公開 API（`src/parser/index.ts`）

```ts
analyzeHtml(filePath: string, source: string): HtmlAnalysis
interface HtmlAnalysis { map: ElementSourceMap; tree: LayerNode[] }
injectReviewIds(source: string, map: ElementSourceMap): string
injectScriptTag(html: string, scriptUrl: string): string
findElementAt(map: ElementSourceMap, filePath: string, offset: number): ElementInfo | null
buildLabel(element: { tagName: string; attrs: { name: string; value: string; namespace?: string }[] }): string
escapeAttributeValue(value: string): string // & と " をエスケープ（属性値用）
```

- 12 での使い方の想定: `const { map, tree } = analyzeHtml(path, text)` → `injectScriptTag(injectReviewIds(text, map), injectScriptUrl(isDev))` をプレビュー用 HTML として Service Worker に渡す。`injectReviewIds` には **`analyzeHtml` に渡したのと同じ source** を渡すこと（位置が合わないと例外）。HTML を編集したら、編集後のテキストで `analyzeHtml` からやり直す
- `injectScriptTag` は `injectReviewIds` の後に呼ぶ（挿入した `<script>` は対応表に入らず、`data-review-id` も付かない）

### 設計判断

- **ID**: 文書順（深さ優先の行きがけ順）の連番を文字列にしたもの（`"0"`, `"1"`, ...）。暗黙の要素も番号を消費する。同じソースなら同じ ID。編集で要素が増減すると後ろの ID はずれるため、ID を永続化しないこと（コメントはソース位置に紐付ける設計どおり）。`map` の挿入順も文書順
- **閉じタグがない要素の `location.end`**: parse5 の記録どおり「その要素を暗黙に閉じたトークンの開始位置」とする。具体的には次の兄弟の開始タグ（`<li>a\n  <li>` → `"<li>a\n  "`）、親の閉じタグ（`</ul>` の手前）、ファイル末尾（`source.length`）。DOM 上でその要素に入る末尾の空白・改行も範囲に含まれる（DOM の中身とソース範囲を一致させるため）。念のため、親の範囲が子を含まない場合は親の end を子の end まで広げる
- **暗黙の要素**（開始タグがソースにない html / head / body / tbody など）: 対応表とツリーには入れ、`location` と `startTag` を `null` にする。`data-review-id` は付けない。`findElementAt` も返さない
- **書式要素の再構築・adoption agency で複製された要素**（例: `<p><b>x<p>y</b>` の 2 つ目の `<p>` 内の `<b>`）: parse5 は複製元と同じ開始タグの位置を記録するが、1 つの開始タグには文書順で最初の要素だけを対応させ、複製は暗黙の要素（`location: null`）として扱う。ただしブラウザは開始タグの属性ごと複製するため、**iframe 内では複製も複製元と同じ `data-review-id` を持つ**（同じ ID の要素が 2 つ以上ありうる）。08/12 で `querySelector` を使う場合は最初の 1 つになる点に注意（ハイライトは `querySelectorAll` で全部に付けてもよい）
- `<script>` `<style>` `<textarea>` `<title>` の中身はテキストなので要素にならない。`<template>` の中身は表示される DOM に入らないため対象外（template 要素自体は対象）
- `tagName` は小文字（SVG の `linearGradient` なども小文字にする。共有型の定義どおり）
- ラベルは `tag#id.class1.class2`。id・class が空なら省く。class は空白（タブ・改行を含む）で区切る
- `injectReviewIds` はタグ名の直後に ` data-review-id="N"` を挿入する（`<div class="a">` → `<div data-review-id="3" class="a">`）。HTML では重複した属性は先に書いたほうが有効なので、生徒のソースに同名の属性があってもこちらが優先される
- `injectScriptTag` の挿入位置: `<head>` の開始タグの直後 → なければ `<html>` の開始タグの直後 → どちらもなければ文書先頭の DOCTYPE・コメントの直後（DOCTYPE より前に入れると互換モードになるため）。どの場合もブラウザは script を head に入れる（テストで確認）
- オフセットは UTF-16 のインデックス（CRLF・サロゲートペアでずれないことをテストで確認）

### 他チケットへの申し送り

- 08（操作スクリプト）/ 12: 暗黙の html / head / body / tbody は対応表に ID があるが、iframe の DOM には `data-review-id` がない。レイヤーツリーでこれらを選んだときにハイライトしたい場合は、08 側で `document.documentElement` / `document.body` などで引くか、ハイライト対象外にするかを決める必要がある。また、暗黙の body の直下（要素の外の余白）をクリックすると `data-review-id` を持つ祖先が見つからないため、`generated: true` と区別したいなら 08 側で「暗黙の要素」と「JS が生成した要素」を分ける判断が要る（共有型の変更は不要だと思うが、必要なら 00 へ）
- テストでは `node:fs` で `tests/fixtures` を読み、broken-html の期待値は `tests/fixtures/README.md` の「Chrome で開いたときの補正後の DOM」のコードブロックを読み取ってそのまま比較している（README が更新されれば期待値も追従する）
- 共有型・依存パッケージの追加依頼はなし

## レビュー

- 判定:
- 日付:
- 指摘事項:
