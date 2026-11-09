# 01: テスト用サンプルサイト

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `tests/fixtures/`
- 変更禁止の領域: `src/`, `src/shared/`, `package.json`, ルートの設定ファイル

## 目的

単体テストと E2E テストの期待値の基準になる、生徒サイトを模したサンプルを用意する。

## 関連する設計ルール

- テスト用サンプルサイトとして、次の種類を用意して使う
  - 1ページ＋画像
  - JS（スライダーなど）入り
  - 閉じタグ漏れなどの不正な HTML 入り
- テスト用サンプルサイトは期待値の基準なので、テストを通すために書き換えない

## 実装チェックリスト

- [ ] `tests/fixtures/simple-image/`: `index.html` + `css/style.css` + `images/` に PNG（または JPEG）を 1 枚。相対パスで CSS と画像を読み込む
- [ ] `tests/fixtures/js-slider/`: `index.html` + `css/style.css` + `js/slider.js`。JS が DOM 要素（スライドのドットなど）を**後から生成する**処理を含める（「JS 生成要素は対象外」の確認に使う）
- [ ] `tests/fixtures/broken-html/`: 閉じタグ漏れ（`<li>`, `<p>`, `<div>` の閉じ忘れ）、ネスト誤り（`<b><i></b></i>`）、属性値のクォート漏れを含む `index.html` + `css/style.css`
- [ ] 各フォルダにテストで使える目印を入れる（例: 見出しに `id="title"`、CSS で `#title { color: rgb(0, 0, 255) }` など、E2E で反映を確認しやすい値）
- [ ] `tests/fixtures/README.md` に各サンプルの目的・含まれる要素・「テストを通すために書き換えない」旨を書く
- [ ] `.claude/hooks/protect-files.mjs` の TODO にある編集禁止ルールに `tests/fixtures/` を追加する（担当ディレクトリ外のため、ユーザーに追加を依頼するか、追加内容をメモ欄に書く）

## テストチェックリスト

- [ ] 3 つのサンプルをブラウザで直接開き（`file://` ではなく `localhost` で配信）、CSS・画像・JS が正しく読み込まれることを目視確認した
- [ ] `broken-html` を Chrome で開いたときの補正後の DOM 構造をメモ欄に記録した（04 の解析層の期待値に使う）

## 完了条件

- [ ] 3 種類のサンプルがそろっている
- [ ] `pnpm exec eslint .` が通る（サンプル内の JS を lint 対象から外す設定が 00 にない場合はメモ欄に書く）

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
