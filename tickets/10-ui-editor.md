# 10: UI コードエディタ

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/ui/editor/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

HTML / CSS / JS をその場で編集できるコードエディタを CodeMirror 6 で作る。編集内容を親アプリに渡すだけにし、ソース管理層とはつながない。

## 関連する設計ルール

- UI層（React）: レイヤーツリー、コードエディタ、コメント一覧
- HTML/CSS の編集は iframe の DOM を直接書き換えて終わりにせず、編集後のソース（テキスト）に反映する（このコンポーネントは編集後のテキストを親に渡す役）

## 実装チェックリスト

- [x] `FileTabs` コンポーネント: 開いているファイルの切り替え。編集済みのファイルに目印を付ける
- [x] `CodeEditor` コンポーネント
  - [x] props: `path`, `value`, `onChange(text)`, `highlight: SourceLocation | null`, `onCursorChange(offset)`, `readOnly?`
  - [x] 拡張子で言語（HTML / CSS / JS）を切り替える
  - [x] `value` が外から変わったとき、カーソル位置とスクロールをできるだけ保つ（自分の `onChange` による更新で無限ループしない）
  - [x] `highlight` が渡されたらその範囲を強調表示し、見える位置までスクロールする（レイヤーツリーや iframe で要素を選んだときの連動）
  - [ ] `onChange` は入力のたびではなく短い間隔でまとめて呼ぶ（間隔は定数）。JS ファイルは「適用」ボタンまたはショートカットで確定してから呼ぶ（iframe の作り直しが頻発しないように）
  - [x] 画像などバイナリファイルはエディタで開かず、プレビュー表示か「編集できません」表示にする
  - [x] 「元に戻す（このファイルを元のソースに戻す）」ボタン（実際の処理は親に `onReset` で依頼する）
  - [x] エディタのルート要素に `data-testid="code-editor"` を付ける（E2E で使う）
- [x] 画面共有で見やすいフォントサイズ・行番号表示

## テストチェックリスト

- [x] 入力すると間隔を置いて `onChange` が最新のテキストで 1 回呼ばれる（偽タイマー）
- [x] JS ファイルでは確定操作まで `onChange` が呼ばれない
- [x] `value` を外から変えるとエディタの内容が変わり、`onChange` は呼ばれない
- [x] `highlight` を渡すと該当範囲に強調用のクラスが付く
- [x] 拡張子ごとに言語が切り替わる
- [x] バイナリファイルでエディタが開かない

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### ファイル構成

- `CodeEditor.tsx`: React のコンポーネント（ツールバー・バイナリ表示・EditorView を置く場所）
- `editorController.ts`: CodeMirror 6 の `EditorView` を自前で包むクラス。待ち時間・JS の未適用の変更・外からの value の反映をここにまとめた（`@uiw/react-codemirror` などの追加パッケージは使っていない）
- `FileTabs.tsx`: ファイルの切り替えタブ
- `highlight.ts`: 強調表示（`StateField` + `Decoration.mark`）。編集されると範囲が追従する
- `language.ts`: 拡張子 → 言語（html / htm → HTML, css → CSS, js / mjs → JS, それ以外のテキストは言語なし）
- `textDiff.ts`: 外からの value を最小の差分で適用するための差分計算
- `constants.ts`: `CHANGE_DEBOUNCE_MS = 300`（ミリ秒）, `HIGHLIGHT_CLASS = "cm-review-highlight"`
- 公開しているもの（`index.ts`）: `CodeEditor`, `FileTabs`, `CHANGE_DEBOUNCE_MS`, `HIGHLIGHT_CLASS`, `getEditorLanguage`, `requiresApply` と props の型

### `CodeEditor` の props（チケット 12 向け）

| prop              | 型                                     | 説明                                                                                                                        |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `path`            | `string`                               | 開いているファイルのパス                                                                                                    |
| `value`           | `string \| ArrayBuffer`                | ファイルの内容。`ArrayBuffer` ならエディタを開かずバイナリ表示にする（`VirtualFile.content` をそのまま渡せる）              |
| `mimeType?`       | `string`                               | バイナリ表示で使う。`image/*` なら画像をプレビューし、それ以外は「編集できません」だけを出す                                |
| `onChange`        | `(text: string, path: string) => void` | 編集後のテキスト。第 2 引数は編集したファイルのパス（下記）                                                                 |
| `highlight`       | `SourceLocation \| null`               | 強調する範囲。`filePath` が `path` と違えば何もしない。範囲はドキュメント長に収める                                         |
| `onCursorChange?` | `(offset: number) => void`             | ユーザーの操作でカーソルが動いたときの UTF-16 オフセット（外からの value の変更では呼ばない）                               |
| `readOnly?`       | `boolean`                              | 読み取り専用                                                                                                                |
| `modified?`       | `boolean`                              | 元のソースから編集されているか。「元に戻す」ボタンの有効・無効に使う                                                        |
| `onReset?`        | `() => void`                           | 渡したときだけ「元に戻す」ボタンを出す。押すと保留中の変更を捨ててから呼ぶ。元のソースを `value` として渡し直すのは親の役目 |

- ルート要素は `data-testid="code-editor"`。ほかに `data-path` と `data-language`（`html` / `css` / `javascript` / `plain` / `binary`）を付けた。バイナリ表示は中に `data-testid="binary-file"` がある
- `onChange` の呼ばれ方
  - HTML / CSS など（JS 以外）: 最後の入力から `CHANGE_DEBOUNCE_MS` 経ったら最新のテキストで 1 回。`Ctrl / ⌘ + S` で待たずにすぐ渡す
  - JS（`.js` / `.mjs`）: ツールバーの「適用」ボタン、`Ctrl / ⌘ + Enter`、`Ctrl / ⌘ + S` で確定したときだけ。未適用の間はツールバーに「未適用の変更があります」と出る。iframe の作り直しはこの `onChange` を受けて親が行う
  - 保留中の変更は、ファイルの切り替え（`path` の変更）とアンマウントのときにも渡す（JS の未適用の変更も渡す。タブを切り替えて編集が消えないように）。そのため切り替え直後に **前のファイルの** テキストで呼ばれることがある。親は第 2 引数の `path` で振り分けるか、`<CodeEditor key={path} … />` として使うこと
- 外から `value` が変わったとき
  - 最小の差分だけを適用するので、変わっていない部分のカーソル位置とスクロール位置は保たれる。この変更では `onChange` / `onCursorChange` を呼ばない（annotation で区別している）
  - 自分が `onChange` で渡したテキストがそのまま `value` に返ってきた場合（こだま）は反映しない。その間に入力が続いていても巻き戻らない
  - 外からの変更があると、保留中の変更（待ち時間中・JS の未適用）は捨てる
  - `path` が変わったときはエディタの状態ごと作り直す（元に戻す履歴がファイルをまたがない）
- `highlight` は値（filePath / start / end）で比べるので、親が毎回新しいオブジェクトを渡しても再スクロールしない。強調は範囲の先頭を縦方向の中央にスクロールする
- 画面共有向けに本文 18px・行間 1.6・行番号あり

### `FileTabs` の props

| prop         | 型                                       | 説明                                       |
| ------------ | ---------------------------------------- | ------------------------------------------ |
| `files`      | `{ path: string; modified?: boolean }[]` | 開いているファイル。`modified` で ● の目印 |
| `activePath` | `string \| null`                         | 選択中のファイル                           |
| `onSelect`   | `(path: string) => void`                 | タブが押された                             |
| `onClose?`   | `(path: string) => void`                 | 渡したときだけ各タブに「×」を出す          |

- `role="tablist"` / `role="tab"`（`aria-selected`）で描く。同じファイル名が複数あるときはパス全体を表示する

### テストについて

- jsdom にはレイアウトの API がないため、`CodeEditor.test.tsx` で `Range.prototype.getClientRects` / `getBoundingClientRect` と `URL.createObjectURL` / `revokeObjectURL` を差し替えている（テスト後に戻す）
- 入力は `EditorView.findFromDOM()` で取った view に `userEvent: "input.type"` のトランザクションを流して再現している。実際のキー入力・スクロール位置の保持は jsdom では確かめられないので、E2E（チケット 13）で確認してほしい
- 偽タイマーは `setTimeout` / `clearTimeout` だけにしている（CodeMirror の requestAnimationFrame などに影響させないため）

## レビュー

- 判定: 要修正
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功
  - vitest: 成功（13 ファイル・147 件）
  - eslint: 成功
  - prettier --check: 成功
  - playwright: 対象外
- 未達の項目:
  - 「JS ファイルは「適用」ボタンまたはショートカットで確定してから呼ぶ」: JS の未適用の変更（draft）が、確定操作なしで `onChange` に渡される経路が 2 つある
    - ファイルの切り替え: `switchFile()` が `this.commit()` を呼び、draft があれば前のファイルのテキストで `onChange` を呼ぶ（`src/ui/editor/editorController.ts:213-215`）
    - アンマウント: `destroy()` が draft を `emit()` する（`src/ui/editor/editorController.ts:134-139`。`CodeEditor.tsx:111-114` のクリーンアップから呼ばれる）。メモで推奨している `<CodeEditor key={path} />` で使うと、タブを切り替えるたびにこの経路を通る。バイナリファイルを開いたときも `TextEditor` がアンマウントされるので同じ
    - その結果、講師がタブを切り替えただけで iframe が作り直される。「適用」を押していない JS の変更がプレビューに反映されてしまい、項目の「確定してから呼ぶ」と合わない。編集を失わないための判断はメモに書かれているが、確定していない draft は `onChange` 以外の経路で守るべき。例: パスごとの draft をコントローラー内に残してタブを戻したときに復元する、別のコールバック（例: `onDraftChange(path, text | null)`）で親に預ける、切り替え前に確認する、など
    - テスト: JS ファイルで draft がある状態の「ファイル切り替え」「アンマウント」で `onChange` が呼ばれないことを確かめるテストがない（`CodeEditor.test.tsx:135-151` は CSS の場合だけ）。修正後に追加すること
- ルール違反:
  - なし（変更は `src/ui/editor/` と本チケットだけ。`src/shared/`・`package.json`・ルートの設定ファイルは変更なし。`node_modules` は git の対象外のシンボリックリンク。CLAUDE.md の設計ルールにも反していない）
- 確認できた項目（根拠）:
  - FileTabs と編集済みの目印: `FileTabs.tsx:70-74`、テスト `FileTabs.test.tsx:23-30`
  - 言語の切り替え: `language.ts:9-35`, `editorController.ts:165`。テストは本物の CodeMirror の `language` facet を確認している（`CodeEditor.test.tsx:259-280`）
  - 外からの value の変更と無限ループ防止: annotation で外からの変更を除外（`editorController.ts:175,208`）、差分だけを適用（`textDiff.ts`）、こだまの抑止（`editorController.ts:197-201`）。テスト `CodeEditor.test.tsx:164-214` は onChange を value に返す親を再現しており、モックの確認だけではない
  - debounce: `editorController.ts:184-194`、定数 `constants.ts:5`。偽タイマーで「間隔の 1ms 前は 0 回 → 経過後に最新のテキストで 1 回」を確認している（`CodeEditor.test.tsx:80-93`）
  - highlight: `highlight.ts`, `editorController.ts:108-115`。テストは実際の DOM 上のクラスと `scrollIntoView` の引数を確認している（`CodeEditor.test.tsx:228-255`）
  - バイナリ: `CodeEditor.tsx:58-70,192-213`。`.cm-editor` が作られないことを確認している（`CodeEditor.test.tsx:282-299`）
  - 「元に戻す」・`data-testid`・フォントサイズと行番号: `CodeEditor.tsx:61,141-144,169-178`, `editorController.ts:28-34,148`
  - `skip` / `only` の残りや、期待値のない `expect` はない
- その他の指摘（任意・判定には影響しない改善案）:
  - こだまの判定は直前に渡したテキスト 1 件だけで行っている（`editorController.ts:80,197-201`）。親が非同期に処理し（保存や再解析の後に value を返すなど）、こだまが届く前に次の `onChange`（Ctrl+S や次の待ち時間の満了）が走ると、古いこだまを外からの変更と見なす。その場合、保留中の入力を捨てて内容を巻き戻してしまう。渡したテキストを小さなキューで持つと安全
  - `setValue()` は dispatch の直後に `scrollTop` を手で戻している（`editorController.ts:207-210`）。CodeMirror が持つスクロールの固定（変更が表示範囲より上にあるとき）と食い違う可能性がある。jsdom では確かめられないため、チケット 13 の E2E か手動で確認してほしい
  - `highlight` の effect は値で比べているため、外からの value の変更で位置が変わっても数値が同じなら設定し直さない。範囲は `decorations.map` で追従するので通常は問題ないが、親の位置情報と食い違うことがあり得る（`CodeEditor.tsx:126-135`）
