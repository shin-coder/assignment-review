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
- 補正で生成された要素（閉じタグ漏れで暗黙に作られた `<tbody>` や `<html>` `<head>` `<body>` など、ソース上に開始タグがない要素）は位置情報がないので、その旨を `ElementInfo` で判別できるようにする（必要なら共有型の変更依頼をメモ欄に書く）
- 属性はソースのテキストに**挿入**する形で付ける（parse5 で再シリアライズしない）。生徒のソースの書き方をプレビューでも保つため

## 実装チェックリスト

- [ ] `analyzeHtml(filePath, source)`: `{ map: ElementSourceMap; tree: LayerNode[] }` を返す
  - [ ] `ElementId` は解析ごとに決定的に振る（同じソースなら同じ ID。例: 文書順の連番）
  - [ ] 各要素の要素全体の位置（`location`）と開始タグの位置（`startTag`）を記録する
  - [ ] 閉じタグがない要素の `location.end` の扱いを決めて実装する（次の兄弟の開始位置／親の終了位置など）
  - [ ] `LayerNode.label` を `tag#id.class1.class2` 形式で作る
  - [ ] `<script>` `<style>` 内のテキストは要素として扱わない（`<script>` `<style>` 要素自体は対象）
- [ ] `injectReviewIds(source, map)`: 各要素の開始タグに `data-review-id="..."` を挿入したプレビュー用 HTML を返す
  - [ ] 自己終了タグ（`<img />`）や属性のない開始タグでも正しく挿入される
  - [ ] 開始タグがソースにない要素には付けない
- [ ] `injectScriptTag(html, scriptUrl)`: 注入スクリプト（`INJECT_SCRIPT_PATH`）を読み込む `<script>` を挿入する（`<head>` がなくても動く）
- [ ] `findElementAt(map, filePath, offset)`: ソース上の位置からもっとも内側の要素を返す（エディタのカーソル → ツリー選択に使う）

## テストチェックリスト

- [ ] 正しい HTML で、各要素の `location` / `startTag` が `source.slice(start, end)` で期待どおりのテキストになる
- [ ] 親子関係（`parentId` / `childIds`）と `tree` が DOM 構造と一致する
- [ ] 閉じタグ漏れ・ネスト誤り・属性のクォート漏れを含む HTML でも例外にならず、補正後の構造と位置が期待どおり（01 の `broken-html` を使う。期待値は Chrome で開いた DOM と照合）
- [ ] 同じソースを 2 回解析すると同じ ID になる
- [ ] `injectReviewIds` の結果を再度 parse5 で解析したとき、全要素の `data-review-id` が対応表の ID と一致する
- [ ] `injectReviewIds` は `data-review-id` 以外のテキストを変えない（挿入部分を取り除くと元のソースに戻る）
- [ ] `findElementAt` がネストした要素で最も内側を返す

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
