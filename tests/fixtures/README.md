# テスト用サンプルサイト

生徒が実装したサイトを模したサンプル。単体テストと E2E テストの**期待値の基準**として使う。

**テストを通すためにここのファイルを書き換えないこと。** テストが通らないときは、テストか実装の側を直す。
（ESLint と Prettier の対象からも外している。整形で中身が変わると期待値が変わるため）

## 共通の目印

どのサンプルにも `<h1 id="title">` があり、CSS で `#title { color: rgb(0, 0, 255); }` を指定している。
E2E で「CSS を編集するとプレビューに反映される」ことを確かめるときは、この色を変えて計算済みスタイルを比べる。

## simple-image（1 ページ＋画像）

| ファイル            | 内容                                                         |
| ------------------- | ------------------------------------------------------------ |
| `index.html`        | カフェのサイト。ヘッダー・ナビ・カード・フッター             |
| `css/style.css`     | 相対パス `css/style.css` で読み込む                          |
| `images/hero.png`   | 64x36 の PNG。`<img id="hero-image">` と CSS の背景の両方で使う |

- HTML からの相対パス（`images/hero.png`）と、CSS からの相対パス（`../images/hero.png`）の両方で同じ画像を読む。Service Worker のパス解決の確認に使う
- 正しい HTML なので、解析層の基本的な期待値に使う

## js-slider（JS 入り）

| ファイル        | 内容                                                       |
| --------------- | ---------------------------------------------------------- |
| `index.html`    | 3 枚のスライド（`#slide-1`〜`#slide-3`）と前へ／次へボタン |
| `css/style.css` | `.slide.is-active` だけを表示する                          |
| `js/slider.js`  | スライドの切り替えと、ドットの生成                         |

- ドット（`.dots` の中の `button.dot` 3 個）は HTML に書かれておらず、JS が生成する。**ソース上に対応する位置がない要素**として、「JS が生成した要素は編集・コメントの対象外」の確認に使う
- 読み込み直後は `#slide-1` が表示され、「次へ」で `#slide-2` に切り替わる
- 自動で切り替わるタイマーは付けていない（E2E が不安定になるため）

## broken-html（不正な HTML 入り）

| ファイル        | 内容                          |
| --------------- | ----------------------------- |
| `index.html`    | 閉じタグ漏れなどを含むポートフォリオ |
| `css/style.css` | 通常の CSS                    |

含まれている不正な書き方:

- `<html>` `<head>` `<body>` の開始タグがない（ブラウザが暗黙に作る）
- `<li>` の閉じタグ漏れ（ナビの 3 項目）
- `<p class="intro">` の閉じタグ漏れ（直後の `<div>` で暗黙に閉じる）
- `<h2>作品 2` の閉じタグ漏れ（次の `<p>` が `<h2>` の中に入る）
- `<p>` の閉じタグ漏れ（作品の説明、お問い合わせ）
- `<b><i>…</b></i>` のネスト誤り
- 属性値のクォート漏れ（`href=#works class=nav-link`）
- `<table>` に `<tbody>` がなく、`<tr>` `<th>` `<td>` の閉じタグもない（`<tbody>` が暗黙に作られる）
- `<div class="profile">` の閉じタグ漏れ（後ろの `<div class="contact">` がその中に入る）
- `</body>` `</html>` がない

### Chrome で開いたときの補正後の DOM（2026-11-10、Chromium 156 で確認）

解析層（チケット 04）の期待値に使う。`（暗黙）` はソースに開始タグがなく、ブラウザが作った要素。

```
html（暗黙）
  head（暗黙）
    meta
    title
    link
  body（暗黙）
    h1#title
    ul.nav
      li
        a.nav-link
      li
        a.nav-link
      li
        a.nav-link
    p.intro
    div#works.works
      div.work
        h2
        p
      div.work
        h2
          p
    div#profile.profile
      p.hobby
        b
          i
      table.skills
        tbody（暗黙）
          tr
            th
            td
          tr
            th
            td
      div#contact.contact
        p
```
