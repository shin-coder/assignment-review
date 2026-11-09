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

- [ ] `CommentComposer` コンポーネント
  - [ ] props: `targetLabel: string | null`, `disabledReason: string | null`, `onSubmit(body)`
  - [ ] 対象の要素がない、または JS 生成要素のときは入力を無効にし、`disabledReason`（例:「JS が生成した要素にはコメントできません」）を表示する
  - [ ] 空のコメントは送信できない。Ctrl/Cmd + Enter で送信できる
- [ ] `CommentList` コンポーネント
  - [ ] props: `comments: ReviewComment[]`, `labels: Record<string, string>`（コメント ID → 要素の表示名）, `activeId`, `onSelect(id)`, `onDelete(id)`, `onUpdate(id, body)`
  - [ ] ファイル・ソース位置の順に並べる
  - [ ] `orphaned` のコメントは区別して表示する（「対応する要素が編集で削除されました」）
  - [ ] クリックで `onSelect`（親が該当要素をハイライトする）
  - [ ] 削除前に確認する（ブラウザの `confirm()` ではなくアプリ内の表示で）
  - [ ] 各コメントに `data-testid="comment-<id>"` を付ける（E2E で使う）
- [ ] 画面共有で見やすい文字サイズ

## テストチェックリスト

- [ ] 入力して送信すると `onSubmit` が本文付きで呼ばれ、入力欄が空になる
- [ ] 空・空白だけの本文は送信できない
- [ ] `disabledReason` があると入力できず、理由が表示される
- [ ] 一覧の並び順
- [ ] `orphaned` の表示
- [ ] 選択・編集・削除（確認を経て `onDelete` が呼ばれる）

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
