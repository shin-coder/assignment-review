# 05: 編集の適用

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/edit/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

講師が行った HTML / CSS / JS の編集を、**編集後のソース（テキスト）**に反映する純粋関数群を作る。iframe の DOM を書き換えるだけで終わらせないための中核ロジック。

## 関連する設計ルール

- HTML/CSS の編集は iframe の DOM を直接書き換えて終わりにせず、編集後のソース（テキスト）に反映する
- JS が編集されたら、編集後の HTML/CSS/JS から iframe を作り直す
- 中核ロジック（編集の適用）には必ず Vitest の単体テストを書く

## 実装チェックリスト

- [ ] すべての関数は副作用なし（入力のソース文字列を受け取り、新しいソースと `TextChange` を返す）
- [ ] `replaceRange(source, location, newText)`: 指定範囲を置き換え、`{ source, change: TextChange }` を返す
- [ ] `replaceElement(source, info: ElementInfo, newOuterHtml)`: 要素全体（`outerHTML` 相当）の置き換え
- [ ] `replaceElementInner(source, info, newInnerHtml)`: 要素の中身だけの置き換え
- [ ] `setAttribute(source, info, name, value)` / `removeAttribute(source, info, name)`: 開始タグ内の属性だけを書き換える（他の属性や改行・インデントを保つ）
- [ ] `replaceFile(source, newSource)`: エディタでファイル全体を書き換えた場合の差分を最小の `TextChange`（共通の先頭・末尾を除いた範囲）として求める
- [ ] `classifyEdit(path)`: 編集されたファイルが HTML / CSS / JS / その他のどれかを返し、「iframe の作り直しが必要か（JS なら必要）」を判定する
- [ ] 複数の `TextChange` を順に適用したときに位置がずれないよう、変更の合成または適用順のルールを決めて関数化する

## テストチェックリスト

- [ ] `replaceRange` の境界（先頭・末尾・空範囲への挿入・全体の削除）
- [ ] `replaceElement` / `replaceElementInner` で前後のテキストが変わらない
- [ ] `setAttribute`: 既存属性の上書き、新規追加、クォートなし属性、値にクォートを含む場合のエスケープ、改行を含む開始タグ
- [ ] `removeAttribute` で他の属性と空白が崩れない
- [ ] `replaceFile` の差分が最小になる（1 文字の変更で `TextChange` が 1 文字分になる）
- [ ] 各関数が返す `TextChange` を元のソースに当てはめると、返された新しいソースと一致する
- [ ] `classifyEdit` の判定（`.js` `.mjs` は作り直しが必要、`.css` `.html` は不要）
- [ ] 01 の `broken-html` に対する属性編集で、補正前のソースが壊れない

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
