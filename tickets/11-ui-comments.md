# 11: UI コメント一覧

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/ui/comments/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

選択中の要素へのコメント入力と、コメント一覧の表示・削除・該当要素への移動を行う React コンポーネントを作る。データは `ReviewComment[]` を受け取るだけにし、紐付けロジックとはつながない。

## 関連する設計ルール

- UI層（React）: レイヤーツリー、コードエディタ、コメント一覧
- コメントは DOM ノードではなく、ソース上の位置（ファイルパス＋位置情報）に紐付けて保存する
- JS が後から生成した要素はソース上に対応する位置がないため、編集・コメントの保存対象外として扱う

## 実装チェックリスト

- [x] `CommentComposer` コンポーネント
  - [x] props: `targetLabel: string | null`, `disabledReason: string | null`, `onSubmit(body)`
  - [x] 対象の要素がない、または JS 生成要素のときは入力を無効にし、`disabledReason`（例:「JS が生成した要素にはコメントできません」）を表示する
  - [x] 空のコメントは送信できない。Ctrl/Cmd + Enter で送信できる
- [x] `CommentList` コンポーネント
  - [x] props: `comments: ReviewComment[]`, `labels: Record<string, string>`（コメント ID → 要素の表示名）, `activeId`, `onSelect(id)`, `onDelete(id)`, `onUpdate(id, body)`
  - [x] ファイル・ソース位置の順に並べる
  - [x] `orphaned` のコメントは区別して表示する（「対応する要素が編集で削除されました」）
  - [x] クリックで `onSelect`（親が該当要素をハイライトする）
  - [x] 削除前に確認する（ブラウザの `confirm()` ではなくアプリ内の表示で）
  - [x] 各コメントに `data-testid="comment-<id>"` を付ける（E2E で使う）
- [ ] 画面共有で見やすい文字サイズ

## テストチェックリスト

- [x] 入力して送信すると `onSubmit` が本文付きで呼ばれ、入力欄が空になる
- [x] 空・空白だけの本文は送信できない
- [x] `disabledReason` があると入力できず、理由が表示される
- [x] 一覧の並び順
- [x] `orphaned` の表示
- [x] 選択・編集・削除（確認を経て `onDelete` が呼ばれる）

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### ファイル構成

- `src/ui/comments/index.ts`: 公開する入口。`CommentComposer` / `CommentList` / `sortComments` と、表示文言の定数 `NO_TARGET_REASON` / `ORPHANED_MESSAGE` を export する
- `CommentComposer.tsx` / `CommentList.tsx`: コンポーネント本体
- `sortComments.ts`: 並び順（ファイルパス → `location.start` → `createdAt` → `id`）。パスと ID はコードポイント順で比べる（`localeCompare` は実行環境で結果が変わるため使わない）
- `keyboard.ts`: Ctrl/Cmd + Enter の判定。日本語入力の変換確定中（`isComposing`）の Enter は送信扱いにしない
- `comments.css`: スタイル。クラス名は他と衝突しないよう `rc-` で始める。コンポーネントが import する

### チケット 12 向け: コンポーネントの API

```tsx
import { CommentComposer, CommentList } from "../ui/comments";

<CommentComposer
  targetLabel={string | null}     // 対象の要素の表示名（"div#main.card" など）。未選択なら null
  disabledReason={string | null}  // コメントできない理由。コメントできるなら null
  onSubmit={(body: string) => void}
/>

<CommentList
  comments={ReviewComment[]}        // 並べ替えはコンポーネント側で行う。渡す順は問わない
  labels={Record<string, string>}   // コメント ID → 要素の表示名。ない ID はファイルパスを表示する
  activeId={string | null}          // 選択中のコメント。li に aria-current="true" が付く
  onSelect={(id: string) => void}
  onDelete={(id: string) => void}
  onUpdate={(id: string, body: string) => void}
/>
```

- `CommentComposer`
  - `disabledReason` が null でも `targetLabel` が null なら無効になり、`NO_TARGET_REASON`（「コメントする要素を選択してください」）を表示する。JS 生成要素を選んだときは、親が `disabledReason` に「JS が生成した要素にはコメントできません」などを渡す
  - `onSubmit` には前後の空白を取り除いた本文が渡る。空・空白だけでは呼ばれない。呼んだ後は入力欄を空にする（呼び出し側の保存成否は待たない）
  - 入力中の下書きは、対象の要素を切り替えても消さない（同じ文を別の要素に付け直せるように）
- `CommentList`
  - `onSelect` は orphaned のコメントでも呼ぶ。orphaned の場合に何もハイライトしない・位置だけ示すなどは親が決める
  - `onUpdate` は前後の空白を取り除いた本文で呼ぶ。空の本文や変更なしでは呼ばない。編集中は Ctrl/Cmd + Enter で保存、Escape でキャンセル
  - `onDelete` はアプリ内の確認表示（`role="alertdialog"`）で「削除する」を押したときだけ呼ぶ。確認が開くと「キャンセル」にフォーカスが移る
  - 各コメントは `<li data-testid="comment-<id>" data-status="active|orphaned">`。E2E では `data-status` で orphaned を判定できる
  - コメントが 0 件のときは「コメントはまだありません」を表示する

### その他

- 「画面共有で見やすい文字サイズ」は CSS で実装済み（基本 18px、本文と入力欄は 20px、ボタンは高さ 40px 以上）。ただし jsdom では見た目を確かめられず単体テストがないため `[ ]` のままにしている。12 の統合後に画面で確認してほしい
- `vitest.config.ts` で `globals` を有効にしていないため、Testing Library の自動後片付け（`cleanup`）が働かない。テストファイルごとに `afterEach(cleanup)` を書いている。React コンポーネントのテストが増えるので、`tests/setup.ts` に `afterEach(cleanup)` を入れることを 00 の担当に提案する
- 色は固定値で、ダークモードには対応していない。親アプリ全体の配色が決まったら CSS 変数に置き換える

## レビュー

- 判定: 承認
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功
  - vitest: 成功（122 件。うち本チケット分 30 件: `sortComments.test.ts` 3 件、`CommentComposer.test.tsx` 12 件、`CommentList.test.tsx` 15 件）
  - eslint: 成功
  - prettier --check: 成功
  - playwright: 対象外
- 未達の項目:
  - なし
  - 「画面共有で見やすい文字サイズ」は実装者が `[ ]` のまま残しているが、CSS で実装されていることを確認したので承認の妨げにはしない。根拠: 基本 18px（`src/ui/comments/comments.css:3-8`。ボタン・選択ボタンは `font: inherit` で引き継ぐ `comments.css:69,135`）、入力欄 20px（`comments.css:46`）、本文 20px（`comments.css:141`）、ボタンの高さ 40px 以上（`comments.css:63`）。`comments.css` は両コンポーネントから import されている（`CommentComposer.tsx:3`、`CommentList.tsx:5`）。実際の画面共有での見え方はチケット 12 の統合後に目視で確認し、そのときに `[x]` にすること
- チェックリストの根拠（確認済み）:
  - CommentComposer の props: `src/ui/comments/CommentComposer.tsx:5-12`
  - 対象なし／JS 生成要素で無効化と理由表示: `CommentComposer.tsx:21-22,48-59`（テスト `CommentComposer.test.tsx:73-90`）
  - 空送信の禁止・Ctrl/Cmd + Enter: `CommentComposer.tsx:23-41`、`keyboard.ts:7-11`（テスト `CommentComposer.test.tsx:46-71`）
  - 送信で `onSubmit` が本文付きで呼ばれ入力欄が空になる: テスト `CommentComposer.test.tsx:31-37`
  - CommentList の props: `CommentList.tsx:7-19`
  - ファイル・ソース位置の順: `sortComments.ts:8-26`、`CommentList.tsx:33`（テスト `sortComments.test.ts:16-33`、`CommentList.test.tsx:53-61` で DOM の並びも確認）
  - orphaned の区別表示: `CommentList.tsx:78,108-110,116,139`（テスト `CommentList.test.tsx:72-78`）
  - クリックで `onSelect`: `CommentList.tsx:133-137`（テスト `CommentList.test.tsx:86-92`）
  - アプリ内の削除確認: `CommentList.tsx:175-187`（テスト `CommentList.test.tsx:151-179`。`window.confirm` が呼ばれないことも確認している）
  - `data-testid="comment-<id>"`: `CommentList.tsx:115`
  - 編集: `CommentList.tsx:81-101,159-173`（テスト `CommentList.test.tsx:94-148`）
  - テストに期待値のない `expect`・`skip` / `only` の残り・モックだけを検証するテストはない
- ルール違反:
  - なし。変更は `src/ui/comments/` と本チケットだけ（`src/shared/`・`package.json`・ルートの設定ファイル・`tests/fixtures/` は未変更、`package-lock.json` / `yarn.lock` なし、依存パッケージの追加なし）。他層の実装は import せず `src/shared` の型だけを使っている。コメントは `ReviewComment`（ソース位置）を受け取るだけで DOM ノードを扱わない。JS 生成要素は `disabledReason` で入力を無効にできる
- その他の指摘（任意・判定には影響しない改善案）:
  - 削除の確認表示で Escape を押しても閉じない（編集中は Escape でキャンセルできる）。操作をそろえるなら `rc-confirm` でも Escape でキャンセルできるとよい（`CommentList.tsx:175-187`）
  - メモにある「orphaned のコメントでも `onSelect` を呼ぶ」という API の約束を確かめるテストがない。12 が頼る挙動なので 1 件あるとよい
  - 色が固定値でダークモード未対応（メモに記載済み）。親アプリの配色が決まったら CSS 変数に置き換える
  - `afterEach(cleanup)` を `tests/setup.ts` にまとめる提案（メモに記載済み）は 00 の担当に回すこと
