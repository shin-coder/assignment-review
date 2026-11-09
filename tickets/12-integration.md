# 12: 統合（App の配線）

- Wave: 2
- 依存: 01〜11（すべてレビュー承認済みであること）
- 担当ディレクトリ: `src/app/`, `src/main.tsx`
- 変更禁止の領域: Wave 1 の各担当ディレクトリ（不具合を見つけたら該当チケットのメモ欄に書き、そのチケットで直す）、`tests/fixtures/`

## 目的

Wave 1 で作った各層をつなぎ、講師が「フォルダを選ぶ → 画面の要素をクリック → ツリー・エディタで確認 → 編集・コメント → 再読み込みしても残る」を一通り行えるアプリにする。

## 関連する設計ルール

- HTML/CSS の編集は iframe の DOM を直接書き換えて終わりにせず、編集後のソース（テキスト）に反映する
- JS が編集されたら、編集後の HTML/CSS/JS から iframe を作り直す
- コメントは DOM ノードではなく、ソース上の位置（ファイルパス＋位置情報）に紐付けて保存する
- Service Worker の登録完了を待ってから iframe を表示する
- 読み込んだ生徒のフォルダには書き込まない
- JS が後から生成した要素はソース上に対応する位置がないため、編集・コメントの保存対象外として扱う

## 実装チェックリスト

### 起動と読み込み

- [ ] 起動時に `registerPreviewWorker()` を開始し、並行して IndexedDB から最後のプロジェクトを `loadLatest()` で復元する
- [ ] 「フォルダを選ぶ」ボタン → `pickDirectory()` → `loadDirectory()` → `SourceStore` を作り、保存する
- [ ] 別のフォルダを選んだら新しいプロジェクトとして扱う

### プレビューの生成

- [ ] 編集後のソースから HTML ごとに `analyzeHtml()` で対応表とツリーを作る
- [ ] `injectReviewIds()` と `injectScriptTag()` で変換したプレビュー用ファイル群を作り、`putFiles()` で Service Worker に渡してから `PreviewFrame` を表示する
- [ ] 現在表示中の HTML ファイルを状態として持つ（生徒サイト内のリンクで別ページに移動した場合の扱いを決める）

### 選択の連動

- [ ] iframe の `review:select` → `selectedId` を更新 → レイヤーツリーが選択・展開 → エディタが該当ファイルの該当位置を強調
- [ ] レイヤーツリーの選択 → `review:highlight` を iframe に送る → エディタが該当位置を強調
- [ ] エディタのカーソル移動 → `findElementAt()` → ツリーと iframe のハイライト
- [ ] `generated: true` の選択では、祖先の要素を選択しつつ「JS が生成した要素は編集・コメントの対象外」と表示する

### 編集の反映

- [ ] HTML の編集: `SourceStore.setEdited()` → 再解析 → `review:replace-element` で iframe に即時反映（構造が大きく変わる場合は iframe を作り直す）
- [ ] CSS の編集: `SourceStore.setEdited()` → `putFiles()` → `review:replace-css` で iframe に即時反映
- [ ] JS の編集: `SourceStore.setEdited()` → `putFiles()` → `rebuildKey` を変えて iframe を作り直す。HTML/CSS の編集はソースに入っているので作り直しても残る
- [ ] 編集で生じた `TextChange` を `applyChangesToComments()` に渡してコメントの位置を追従させる
- [ ] 作り直し後も選択中の要素を（同じ ID が残っていれば）維持する

### コメント

- [ ] 選択中の要素の `ElementInfo` から `createComment()` → `SourceStore` に追加 → 保存
- [ ] コメント一覧で選ぶと、`resolveCommentElement()` で要素を探してツリー・iframe・エディタを連動させる
- [ ] コメントのある要素をレイヤーツリーで目印表示する

### 画面

- [ ] レイアウト: 左にレイヤーツリー、中央にプレビュー、右にエディタとコメント（幅は調整可能）
- [ ] 「すべての編集を元に戻す」「このプロジェクトを削除」操作
- [ ] 保存状態（保存中／保存済み／保存失敗）の表示
- [ ] `showDirectoryPicker` がない環境（Chrome 以外）では、対応ブラウザを案内する

## テストチェックリスト

- [ ] 各層をモックにした結合テスト（Vitest + Testing Library）で、`review:select` を受け取るとツリーの選択とエディタの強調が更新される
- [ ] CSS の編集で `putFiles` と `review:replace-css` が呼ばれ、iframe は作り直されない
- [ ] JS の編集で iframe が作り直され、HTML/CSS の編集後ソースが `putFiles` に含まれる
- [ ] 要素の前にテキストを追加する編集をしても、既存コメントが同じ要素を指す
- [ ] 起動時に保存済みプロジェクトが復元される
- [ ] 読み込み処理で書き込み系 API が呼ばれない
- [ ] （手動）01 の 3 つのサンプルそれぞれで一連の操作ができることを確認した

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る
- [ ] `pnpm build` が成功し、ビルド結果を `pnpm preview`（localhost）で開いても動く

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
