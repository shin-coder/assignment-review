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

- [x] `tests/fixtures/simple-image/`: `index.html` + `css/style.css` + `images/` に PNG（または JPEG）を 1 枚。相対パスで CSS と画像を読み込む
- [x] `tests/fixtures/js-slider/`: `index.html` + `css/style.css` + `js/slider.js`。JS が DOM 要素（スライドのドットなど）を**後から生成する**処理を含める（「JS 生成要素は対象外」の確認に使う）
- [x] `tests/fixtures/broken-html/`: 閉じタグ漏れ（`<li>`, `<p>`, `<div>` の閉じ忘れ）、ネスト誤り（`<b><i></b></i>`）、属性値のクォート漏れを含む `index.html` + `css/style.css`
- [x] 各フォルダにテストで使える目印を入れる（例: 見出しに `id="title"`、CSS で `#title { color: rgb(0, 0, 255) }` など、E2E で反映を確認しやすい値）
- [x] `tests/fixtures/README.md` に各サンプルの目的・含まれる要素・「テストを通すために書き換えない」旨を書く
- [x] `.claude/hooks/protect-files.mjs` の TODO にある編集禁止ルールに `tests/fixtures/` を追加する（担当ディレクトリ外のため、ユーザーに追加を依頼するか、追加内容をメモ欄に書く）

## テストチェックリスト

- [x] 3 つのサンプルをブラウザで直接開き（`file://` ではなく `localhost` で配信）、CSS・画像・JS が正しく読み込まれることを目視確認した
- [x] `broken-html` を Chrome で開いたときの補正後の DOM 構造をメモ欄に記録した（04 の解析層の期待値に使う）

## 完了条件

- [x] 3 種類のサンプルがそろっている
- [x] `pnpm exec eslint .` が通る（サンプル内の JS を lint 対象から外す設定が 00 にない場合はメモ欄に書く）

## メモ

- 2026-11-10: 画像 `simple-image/images/hero.png` は 64x36 の PNG（上半分 `#f4a261`、下半分 `#6d4c41`）。外部の素材を使わず、Node の標準機能だけで生成した
- 2026-11-10: ブラウザでの確認は目視ではなく、Playwright の Chromium 156 で自動確認した。Claude のサンドボックス内ではポートを開けないため、`localhost` の代わりに `http://fixtures.test/` へのリクエストを横取りしてファイルを返す方法で配信した（`file://` ではないので、相対パスの解決は http 配信と同じ）。結果:
  - 3 つとも失敗したリクエストとスクリプトエラーはなし。`#title` の計算済みの色は `rgb(0, 0, 255)`
  - simple-image: `index.html` / `css/style.css` / `images/hero.png` がすべて 200。`<img>` は読み込み完了（幅 64）、`.hero` の背景画像も `images/hero.png` に解決された
  - js-slider: `js/slider.js` が 200。ドット（`.dot`）が 3 個生成され、読み込み直後は `#slide-1`、「次へ」で `#slide-2` が表示された
- 2026-11-10: `broken-html` の補正後の DOM は `tests/fixtures/README.md` に記録した。`html` `head` `body` `tbody` はソースに開始タグがない暗黙の要素
- 2026-11-10: lint・整形の対象外にする設定（`eslint.config.js` の `ignores` と `.prettierignore` の `tests/fixtures`）は 00 で入っている
- 編集禁止のフック（ユーザーに追加を依頼）: `.claude/hooks/protect-files.mjs` の `rules` の TODO を次に置き換える。追加すると Claude もサンプルを編集できなくなる（意図どおり）。サンプルを直す必要があるときは、ユーザーが一時的にこのルールを外す

  ```js
  {
    matches: () => filePath.includes("/tests/fixtures/"),
    reason: "テスト用サンプルサイトは期待値の基準なので編集禁止です",
  },
  ```

## レビュー

- 判定:
- 日付:
- 指摘事項:
