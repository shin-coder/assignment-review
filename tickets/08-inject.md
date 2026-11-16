# 08: 操作スクリプト（iframe 内に注入）

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/inject/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

iframe 内の生徒サイトに注入し、ホバー時のハイライトとクリック検知を行い、結果を親アプリへ `postMessage` で伝える。親からの指示でハイライトや要素・CSS の差し替えも行う。

## 関連する設計ルール

- 操作スクリプト: iframe 内に注入し、ホバー時のハイライトとクリック検知を行う
- React は親アプリの UI にだけ使う。iframe 内の操作は素の DOM API で行う
- JS が後から生成した要素はソース上に対応する位置がないため、編集・コメントの保存対象外として扱う

## 実装チェックリスト

- [x] `src/inject/inject.ts` をエントリとし、React や他層の実装を `import` しない（`src/shared` の型・定数のみ可）
- [x] 生徒サイトの見た目・スタイル・イベントを汚さない
  - [x] ハイライト用の要素は `pointer-events: none` の重ね表示（オーバーレイ）で作り、生徒の要素のスタイルを書き換えない
  - [x] オーバーレイは Shadow DOM の中に置き、生徒の CSS の影響を受けないようにする
  - [x] オーバーレイ要素自体はホバー・クリックの対象外にする
  - [x] グローバル変数を増やさない（即時実行の関数で包む）
- [x] `mouseover` / `mouseout`（または `mousemove`）でホバー中の要素をハイライトし、`review:hover` を送る
- [x] `click` をキャプチャ段階で受け取り、`preventDefault()` と `stopPropagation()` でリンク遷移や生徒の JS の動作を止めたうえで `review:select` を送る
  - [x] クリックした要素に `data-review-id` があればその ID、なければ最も近い祖先の ID を送り、`generated: true` にする
- [x] スクロール・リサイズ・DOM 変化時にハイライト位置を追従させる
- [x] 親からのメッセージを処理する
  - [x] `review:highlight`: 指定 ID の要素をハイライトし、画面外ならスクロールして表示する
  - [x] `review:replace-element`: 指定 ID の要素を差し替える（HTML 編集をすぐ見せるため。ソースへの反映は親側の責務）
  - [x] `review:replace-css`: 指定パスの `<link rel="stylesheet">` を、新しい CSS テキストの `<style>` に差し替える（または `href` にクエリを付けて再読み込みする）
- [x] 読み込み完了時に `review:ready` を送る
- [x] 受信メッセージは型ガードで検証し、送信元が `window.parent` の場合だけ処理する

## テストチェックリスト

- [x] jsdom で、ホバーで `review:hover`、クリックで `review:select` が正しい ID で送られる
- [x] `data-review-id` のない要素（JS 生成要素）をクリックすると、祖先の ID と `generated: true` が送られる
- [x] クリックで `<a>` の遷移が起きない（`defaultPrevented` が `true`）
- [x] オーバーレイ要素がクリック対象にならない
- [x] `review:highlight` / `review:replace-element` / `review:replace-css` の処理
- [x] 不正なメッセージ・`window.parent` 以外からのメッセージを無視する
- [x] 生徒の要素の `style` 属性や `class` が変化しない

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る
- [ ] 開発時は `injectScriptUrl(true)`、ビルド後は `injectScriptUrl(false)` の URL で注入スクリプトが配信される

## メモ

### 完了条件の未チェック項目

- 「`injectScriptUrl(true)` / `(false)` の URL で配信される」は半分だけ確認した。`pnpm build` で `dist/inject.js`（約 8 kB、import なしの 1 ファイル）が出力されることは確認済み。開発サーバ（`/src/inject/inject.ts`）とブラウザでの読み込みは、作業環境にブラウザ・開発サーバがないため未確認。12（統合）か 13（E2E）で確認してほしい

### ファイル構成

- `inject.ts`: 入口。`installReviewScript(window)` を 1 回呼ぶだけ（即時実行の関数で包み、名前を外へ出さない）
- `reviewScript.ts`: `installReviewScript(win, options?)`。イベント・メッセージ・位置の追従をまとめて取り付け、取り外す関数を返す。テストでは `postToParent`（送信先）と `parent`（受け付ける送信元）を差し替える
- `overlay.ts`: ハイライトの重ね表示。`dom.ts`: ID の解決・表示名。`replaceElement.ts`: `review:replace-element`。`stylesheet.ts`: `review:replace-css`

### 動作

- 送るメッセージ（宛先オリジンは自分の `location.origin`。オリジンが `"null"` のときだけ `"*"`）
  - `review:ready`: 取り付けた時点で `document.readyState` が `loading` でなければすぐ、そうでなければ `DOMContentLoaded` で 1 回送る。画像の読み込み完了（`load`）は待たない
  - `review:hover`: `mouseover`（document のキャプチャ段階）で、乗った要素自身か最も近い祖先の `data-review-id` を送る。同じ ID が続く間は送らない。ドキュメントの外へ出たら（`mouseout` の `relatedTarget` が null）`elementId: null` を送る。ホバーは生徒の `:hover` やリスナーを妨げない
  - `review:select`: `click` を window のキャプチャ段階で受け、`preventDefault()` + `stopImmediatePropagation()` してから送る。`auxclick`（中クリックで新しいタブ）と `dblclick` も同様に止めるが、メッセージは送らない
- `generated` の判定（04 からの連絡を反映）
  - クリックした要素自身に `data-review-id` がなければ `generated: true`、`elementId` は最も近い祖先の ID（なければ null）
  - ただし `html` / `head` / `body` / `tbody` は、開始タグがなくても補われる要素で解析層が ID を付けないため、ID がなくても `generated: false` にする。開始タグのない body の余白をクリックすると `{ elementId: null, generated: false }`、暗黙の tbody なら祖先の table の ID と `generated: false`
  - 04 の連絡は html / head / body だけだったが、暗黙の tbody もよくあるので含めた（JS が作った tbody は区別できず `generated: false` になる）
- 同じ `data-review-id` を持つ要素が複数ある場合（`<p><b>x<p>y</b>` で書式要素が属性ごと複製されるなど）は、`review:highlight` も `review:replace-element` も文書順で最初の要素だけを対象にする
- 受け取るメッセージ: `event.source === window.parent` かつ `isParentMessage()` を満たすものだけ処理する
  - `review:highlight`: 指定 ID の要素に選択の枠を描く。画面外ならスクロールする（`scrollIntoView({ block: "center", behavior: "smooth" })`。画面より大きい要素は一部でも見えていればスクロールしない）。`null` や見つからない ID なら枠を消す
  - `review:replace-element`: `<template>` で解析した HTML に差し替える（`<tr>` なども可、空文字なら削除）。html / head / body は属性と中身を入れ替える。差し替えた HTML の `<script>` は実行されない
  - `review:replace-css`: `rel` に `stylesheet` を含み、`href` が指定パス（`normalizePath` で比較、クエリ・ハッシュは無視）を指す `<link>` をすべて `<style>` に差し替える。2 回目以降は同じ `<style>` の中身だけ書き換える。`<style>` に移すと相対 URL の基準が変わるため、`url(...)` と `@import "..."` の相対 URL は元の CSS ファイル基準の絶対 URL に書き換える。`media` と `data-review-id` は引き継ぐ
- オーバーレイ
  - `documentElement` の末尾に独自タグ `<review-tool-overlay>` を置き、その Shadow DOM（open）の中に「ホバー」「選択」の 2 つの枠（`position: fixed`、`getBoundingClientRect()` の位置）とラベル（`div#main.card` など）を描く。生徒の要素の style / class は一切触らない
  - ホスト要素はインラインの `!important`（`all: initial`、`pointer-events: none`、`z-index: 2147483647` など）で固める。ホスト自身や Shadow DOM の中への操作は無視する
  - JS 生成要素へのホバーは枠を破線にし、ラベルに「（JS 生成）」と付ける。クリック時の選択の枠は、親のレイヤーツリーで選ばれる ID を持つ要素（祖先）に付ける
  - スクロール（キャプチャ段階なので要素内のスクロールも拾う）・リサイズ・DOM 変化（`MutationObserver`）・`load`（画像）・`transitionend` / `animationend` で、1 フレームに 1 回描き直す。選択中の要素が差し替えで消えたら同じ ID で探し直す。ホスト要素が外されたら付け直す

### 12（統合）が知っておくこと

- 注入は `<script type="module" src={injectScriptUrl(isDev)}>` を前提にしている。ビルド後の `inject.js` はトップレベルに `var` を持つ ES モジュールなので、**`type="module"` なしで読み込むとグローバル変数になる**。モジュールなので HTML の解析後に実行され、`<body>` の末尾でも `<head>` でもよい
- 今は `inject.js` が 1 ファイルに収まっているが、親アプリ側も `src/shared` の同じ関数（`isParentMessage` など）を使うと、Rollup が共有チャンク（`assets/*.js`）に切り出して `inject.js` から `import` する形になる可能性がある。モジュールとして読み込んでいれば動くが、`/assets/` へのリクエストも Service Worker を素通りさせる必要がある。開発時の `/src/inject/inject.ts` → `/src/shared/*.ts` の読み込みも同様（07 の Service Worker がプレビュー外のパスを横取りしないこと）
- 親は iframe の `src` を設定する前に `message` リスナーを登録しておく（`review:ready` を取りこぼさないため）。iframe を作り直すたびに `review:ready` が届くので、それを合図に `review:highlight`（選択の復元）や、編集済み CSS の `review:replace-css` を送るとよい
- 受信側は `isFrameMessage()` で検証し、`event.source === iframe.contentWindow` も確かめること
- `review:select` / `review:hover` の後に親から `review:highlight` を返さなくても、クリックした場所には選択の枠が出る。親から `review:highlight` を送れば上書きされる
- `review:replace-element` の `html` には、解析層と同じ `data-review-id` を付けたプレビュー用の HTML を渡すこと（付いていない要素は JS 生成扱いになる）。差し替えた範囲の中で生徒の JS が作った要素（スライダーの中身など）は消え、JS も再実行されないので、JS 依存の部分を編集したときは iframe の作り直しの方がよい
- `review:replace-element` で `<head>` を差し替えると、`<style>` に差し替え済みの CSS が元の `<link>` に戻る。その後に編集済み CSS の `review:replace-css` を送り直すこと（次の `review:replace-css` で `<link>` を探し直して差し替える）
- `review:replace-css` は `<link>` で読み込まれた CSS だけが対象。`@import` で読み込まれた CSS や JS が後から追加した `<link>` で、見つからないものは何もしない（応答メッセージがないため親には分からない。必要なら iframe を作り直す）
- 生徒の JS が先に window のキャプチャ段階へ登録した `click` リスナーは、操作スクリプトより先に動く（モジュールは解析後に実行されるため）。また `mousedown` / `pointerdown` は止めていないので、ドラッグで動くスライダーなどは反応する

### 共有契約への依頼

- なし（`src/shared` の型・定数・`isParentMessage`・`normalizePath`・`PREVIEW_PREFIX` で足りた）

## レビュー

- 判定:
- 日付:
- 指摘事項:
