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

- [ ] `src/inject/inject.ts` をエントリとし、React や他層の実装を `import` しない（`src/shared` の型・定数のみ可）
- [ ] 生徒サイトの見た目・スタイル・イベントを汚さない
  - [ ] ハイライト用の要素は `pointer-events: none` の重ね表示（オーバーレイ）で作り、生徒の要素のスタイルを書き換えない
  - [ ] オーバーレイは Shadow DOM の中に置き、生徒の CSS の影響を受けないようにする
  - [ ] オーバーレイ要素自体はホバー・クリックの対象外にする
  - [ ] グローバル変数を増やさない（即時実行の関数で包む）
- [ ] `mouseover` / `mouseout`（または `mousemove`）でホバー中の要素をハイライトし、`review:hover` を送る
- [ ] `click` をキャプチャ段階で受け取り、`preventDefault()` と `stopPropagation()` でリンク遷移や生徒の JS の動作を止めたうえで `review:select` を送る
  - [ ] クリックした要素に `data-review-id` があればその ID、なければ最も近い祖先の ID を送り、`generated: true` にする
- [ ] スクロール・リサイズ・DOM 変化時にハイライト位置を追従させる
- [ ] 親からのメッセージを処理する
  - [ ] `review:highlight`: 指定 ID の要素をハイライトし、画面外ならスクロールして表示する
  - [ ] `review:replace-element`: 指定 ID の要素を差し替える（HTML 編集をすぐ見せるため。ソースへの反映は親側の責務）
  - [ ] `review:replace-css`: 指定パスの `<link rel="stylesheet">` を、新しい CSS テキストの `<style>` に差し替える（または `href` にクエリを付けて再読み込みする）
- [ ] 読み込み完了時に `review:ready` を送る
- [ ] 受信メッセージは型ガードで検証し、送信元が `window.parent` の場合だけ処理する

## テストチェックリスト

- [ ] jsdom で、ホバーで `review:hover`、クリックで `review:select` が正しい ID で送られる
- [ ] `data-review-id` のない要素（JS 生成要素）をクリックすると、祖先の ID と `generated: true` が送られる
- [ ] クリックで `<a>` の遷移が起きない（`defaultPrevented` が `true`）
- [ ] オーバーレイ要素がクリック対象にならない
- [ ] `review:highlight` / `review:replace-element` / `review:replace-css` の処理
- [ ] 不正なメッセージ・`window.parent` 以外からのメッセージを無視する
- [ ] 生徒の要素の `style` 属性や `class` が変化しない

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る
- [ ] ビルドで注入スクリプトが単独の JS ファイルとして出力され、`INJECT_SCRIPT_PATH` で配信される

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
