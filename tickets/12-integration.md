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

- [x] 起動時に `registerPreviewWorker()` を開始し、並行して IndexedDB から最後のプロジェクトを `loadLatest()` で復元する
- [x] 「フォルダを選ぶ」ボタン → `pickDirectory()` → `loadDirectory()` → `SourceStore` を作り、保存する
- [x] 別のフォルダを選んだら新しいプロジェクトとして扱う

### プレビューの生成

- [x] 編集後のソースから HTML ごとに `analyzeHtml()` で対応表とツリーを作る
- [x] `injectReviewIds()` と `injectScriptTag()` で変換したプレビュー用ファイル群を作り、`putFiles()` で Service Worker に渡してから `PreviewFrame` を表示する
- [x] 現在表示中の HTML ファイルを状態として持つ（生徒サイト内のリンクで別ページに移動した場合の扱いを決める）

### 選択の連動

- [x] iframe の `review:select` → `selectedId` を更新 → レイヤーツリーが選択・展開 → エディタが該当ファイルの該当位置を強調
- [x] レイヤーツリーの選択 → `review:highlight` を iframe に送る → エディタが該当位置を強調
- [x] エディタのカーソル移動 → `findElementAt()` → ツリーと iframe のハイライト
- [x] `generated: true` の選択では、祖先の要素を選択しつつ「JS が生成した要素は編集・コメントの対象外」と表示する

### 編集の反映

- [x] HTML の編集: `SourceStore.setEdited()` → 再解析 → `review:replace-element` で iframe に即時反映（構造が大きく変わる場合は iframe を作り直す）
- [x] CSS の編集: `SourceStore.setEdited()` → `putFiles()` → `review:replace-css` で iframe に即時反映
- [x] JS の編集: `SourceStore.setEdited()` → `putFiles()` → `rebuildKey` を変えて iframe を作り直す。HTML/CSS の編集はソースに入っているので作り直しても残る
- [x] 編集で生じた `TextChange` を `applyChangesToComments()` に渡してコメントの位置を追従させる
- [x] 作り直し後も選択中の要素を（同じ ID が残っていれば）維持する

### コメント

- [x] 選択中の要素の `ElementInfo` から `createComment()` → `SourceStore` に追加 → 保存
- [x] コメント一覧で選ぶと、`resolveCommentElement()` で要素を探してツリー・iframe・エディタを連動させる
- [x] コメントのある要素をレイヤーツリーで目印表示する

### 画面

- [ ] レイアウト: 左にレイヤーツリー、中央にプレビュー、右にエディタとコメント（幅は調整可能）
- [x] 「すべての編集を元に戻す」「このプロジェクトを削除」操作
- [x] 保存状態（保存中／保存済み／保存失敗）の表示
- [x] `showDirectoryPicker` がない環境（Chrome 以外）では、対応ブラウザを案内する

## テストチェックリスト

- [x] 各層をモックにした結合テスト（Vitest + Testing Library）で、`review:select` を受け取るとツリーの選択とエディタの強調が更新される
- [x] CSS の編集で `putFiles` と `review:replace-css` が呼ばれ、iframe は作り直されない
- [x] JS の編集で iframe が作り直され、HTML/CSS の編集後ソースが `putFiles` に含まれる
- [x] 要素の前にテキストを追加する編集をしても、既存コメントが同じ要素を指す
- [x] 起動時に保存済みプロジェクトが復元される
- [x] 読み込み処理で書き込み系 API が呼ばれない
- [ ] （手動）01 の 3 つのサンプルそれぞれで一連の操作ができることを確認した

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る
- [ ] `pnpm build` が成功し、ビルド結果を `pnpm preview`（localhost）で開いても動く

## メモ

### 構成（`src/app/`）

- `App.tsx`: 起動（`registerWorker` と `loadLatest` の復元）・フォルダ選択・自動保存・保存状態・プロジェクトの切り替え／削除。`deps`（`AppDeps`）を props で受ける
- `deps.ts` / `defaultDeps.ts`: ブラウザ API・IndexedDB・Service Worker への依存。本番は `createDefaultDeps()`（`main.tsx` が渡す）、テストは偽物に差し替える（`PreviewFrame` 自体も差し替え可）
- `ReviewScreen.tsx`: 左レイヤーツリー / 中央プレビュー / 右エディタ＋コメントのレイアウト。`useSyncExternalStore` で `ReviewController` を読むだけ
- `reviewController.ts`: React に依存しない中核（解析結果・選択・編集の反映・コメント・リセット）。iframe への送信は `attachFrame(sender)` で注入
- `previewFiles.ts`: プレビュー用ファイルの組み立て（`injectScriptTag(injectReviewIds(...))`）、`replace-element` に渡す要素 1 つ分の HTML の切り出し（`previewOuterHtml`）、即時反映か作り直しかの判定（`planElementReplace`）
- `alignChange.ts`: 編集差分をタグの境界に寄せる（下記）
- テスト: `reviewController.test.ts`（中核）、`previewFiles.test.ts`、`alignChange.test.ts`、`App.test.tsx`（結合。fake-indexeddb の実リポジトリ、`createFakeDirectory`、`PreviewFrame` と `CodeEditor` を偽物にして iframe・CodeMirror なしで動かす）

### 動作の決めごと

- **プレビューのセッション ID** はプロジェクト ID。復元しても同じ ID になり、IndexedDB に溜まらない。フォルダを選び直す・削除するときに `clearFiles(旧ID)` を呼ぶ（`StrictMode` での二重 unmount で消さないよう、アンマウントではなく操作時に呼ぶ）
- **表示中の HTML** は `currentPage`。iframe 内のリンク移動は `onLoad` の `contentWindow.location.pathname` から追従し（`notifyFramePath`）、選択を解除するだけで iframe は作り直さない。ページ切り替えのセレクト（`page-select`、HTML が 2 つ以上のとき）は iframe を開き直す。ページごとの解析結果は全 HTML 分を保持する
- **HTML 編集**: 編集後に全体を再解析し、(a) 要素の数・タグ・親子が同じ、(b) 変更を内側に含む要素がある、(c) その要素のなかに script がない、なら `review:replace-element`（`data-review-id` 付き）、それ以外は iframe を作り直す。置き換えた HTML に `<link` があれば編集済み CSS の `review:replace-css` を送り直す（08 のメモの対応）。選択は編集前の開始位置を `shiftLocation` で追従して探し直す
- **CSS 編集**: `previewFiles` を新しい配列にして `PreviewFrame` が `putFiles` を送り直し、`review:replace-css` を送る。**JS・その他**: `rebuildKey` を +1、`entryPath` は表示中の HTML
- **コメント追従**: 編集 1 回ごとに `replaceFile` の `TextChange` を 1 件ずつ `applyChangesToComments` に渡し、`replaceComments`。`replaceFile` の最小差分が要素の境界から外れる問題（06 のメモ）は `alignChangeToTagBoundary`（挿入・削除だけの差分を、同じ意味で `<` から始まり直後も `<` の位置にずらす）で回避した。置換型の差分は寄せない。「すべて元に戻す」もファイルごとの差分でコメントを追従させてから `resetAll`
- **CodeEditor の `onChange` の振り分け**: 第 2 引数の `path` で `editFile(path, text)` に渡す（現在のタブ `activePath` は使わない）。10 のレビューで分かった「JS の未適用の変更がタブ切り替え時に確定される」場合も、前のファイルの path で届くので別ファイルを上書きしない。`key={path}` は使っていない（`CodeEditor` が path 変更で内部状態を作り直すため）
- **エディタのカーソル移動で要素を選んだ**ときは、エディタのスクロール（強調）を出さない（クリックのたびに中央へ飛ぶのを避けるため）。ツリー・iframe には反映する
- **JS 生成要素**（`generated: true`）: 祖先を選び、`data-testid="generated-notice"` に「JS が生成した要素は編集・コメントの対象外です」を出し、コメント入力を `disabledReason` で無効にする。暗黙の要素（`location` が null）もコメント不可
- コメントを選ぶ: `resolveCommentElement` で見つかれば（必要なら HTML ページを切り替えて）ツリー・iframe・エディタを連動、orphaned は元の位置だけエディタで強調する
- 共有契約の不足（`ProjectRepository.loadLatest`）は `AppRepository`（`src/app/deps.ts`）で型を足して回避。`ElementInfo.endTag` は使っていない

### 手動確認が必要なこと（ブラウザ未実施）

- 実ブラウザでの表示・操作（3 つのサンプルでの一連の操作、レイアウト、幅の調整）。幅の調整は CSS の `resize: horizontal` のつまみ（各ペインの右下）で、見た目と使いやすさは未確認のため「レイアウト」の項目は `[ ]` のまま
- `pnpm build` は成功（`dist/index.html`・`sw.js`・`inject.js`・`assets/*`）。`pnpm preview`（localhost）で開いて動くかは未確認。メインのチャンクは約 900kB（CodeMirror を含む）で Vite の警告が出る（分割は必要になったら別途）
- 08 のメモの「`injectScriptUrl(true)`（開発サーバの `/src/inject/inject.ts`）での読み込み」と、`/assets/` の共有チャンクを SW が素通りさせること。`dist` では `inject.js` は 1 ファイルで、共有チャンク（`assets/vfs-*.js` など）を `import` しているため、`pnpm preview` で iframe 内から読めるかを 13 で確認してほしい

### 13（E2E）向け

- `data-testid`: `open-folder`（フォルダを選ぶ）、`save-status`（`data-status="saving|saved|failed"`、保存済みのテキストは「保存済み」）、`reset-all` → 確認の `reset-all-confirm`、`delete-project` → `delete-project-confirm`、`page-select`、`open-file-select`、`generated-notice`、`app-error`、`unsupported-browser`、`review-screen`。各層の既存のもの（`layer-node-<id>` の `aria-selected` / `data-commented`、`code-editor`、`comment-<id>`）はそのまま
- `preview-frame` は `PreviewFrame` が付けた**ラッパーの div**（iframe ではない）。iframe は `[data-testid="preview-frame"] iframe`、`frameLocator` で中を取る
- フォルダ選択は `pickDirectory(window)` を呼ぶたびに `window.showDirectoryPicker` を読む。Playwright は `addInitScript` で差し替えること（`mode: "read"` の引数が渡る）。差し替えるハンドルは `values()` で `kind` / `name` / `getFile()`（`size` / `text()` / `arrayBuffer()`）を持つこと
- 保存は最後の変更の 500ms 後。再読み込みの前に `save-status` が「保存済み」になるのを待つ（`pagehide` でも `flush` を試みるが、非同期なので保証しない）
- 削除・元に戻すは画面内の 2 段階確認（`window.confirm` ではないので dialog ハンドラは不要）
- ID は文書順の連番で、`html` / `head` / `body` が暗黙のとき ID を消費する（`layer-node-0` は html）

## レビュー

- 判定:
- 日付:
- 指摘事項:
