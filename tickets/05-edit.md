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

- [x] すべての関数は副作用なし（入力のソース文字列を受け取り、新しいソースと `TextChange` を返す）
- [x] `replaceRange(source, location, newText)`: 指定範囲を置き換え、`{ source, change: TextChange }` を返す
- [x] `replaceElement(source, info: ElementInfo, newOuterHtml)`: 要素全体（`outerHTML` 相当）の置き換え
- [x] `replaceElementInner(source, info, newInnerHtml)`: 要素の中身だけの置き換え
- [x] `setAttribute(source, info, name, value)` / `removeAttribute(source, info, name)`: 開始タグ内の属性だけを書き換える（他の属性や改行・インデントを保つ）
- [x] `replaceFile(source, newSource)`: エディタでファイル全体を書き換えた場合の差分を最小の `TextChange`（共通の先頭・末尾を除いた範囲）として求める
- [x] `classifyEdit(path)`: 編集されたファイルが HTML / CSS / JS / その他のどれかを返し、「iframe の作り直しが必要か（JS なら必要）」を判定する
- [x] 複数の `TextChange` を順に適用したときに位置がずれないよう、変更の合成または適用順のルールを決めて関数化する

## テストチェックリスト

- [x] `replaceRange` の境界（先頭・末尾・空範囲への挿入・全体の削除）
- [x] `replaceElement` / `replaceElementInner` で前後のテキストが変わらない
- [x] `setAttribute`: 既存属性の上書き、新規追加、クォートなし属性、値にクォートを含む場合のエスケープ、改行を含む開始タグ
- [x] `removeAttribute` で他の属性と空白が崩れない
- [x] `replaceFile` の差分が最小になる（1 文字の変更で `TextChange` が 1 文字分になる）
- [x] 各関数が返す `TextChange` を元のソースに当てはめると、返された新しいソースと一致する
- [x] `classifyEdit` の判定（`.js` `.mjs` は作り直しが必要、`.css` `.html` は不要）
- [x] 01 の `broken-html` に対する属性編集で、補正前のソースが壊れない

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### 公開 API（`src/edit/index.ts`）

すべて純粋関数。編集関数は `EditResult = { source, change: TextChange }` を返す。

- `replaceRange(source, location, newText)` / `replaceElement(source, info, newOuterHtml)` / `replaceElementInner(source, info, newInnerHtml)`
- `setAttribute(source, info, name, value)` / `removeAttribute(source, info, name)`
- `replaceFile(source, newSource, filePath)`: チケットの案から `filePath` 引数を足した（TextChange に必要なため）
- `classifyEdit(path)`: `{ kind: "html" | "css" | "js" | "other", needsReload }`。js と other は `needsReload: true`、html / css は false（other は DOM をその場で直せないので作り直す側に倒した）
- `composeChanges(changes)`: 順に適用した TextChange の列を元ソースに対する 1 つにまとめる。空・何も変えない列は `null`
- `applyEdits(source, filePath, edits: RangeEdit[])`: 同じ元ソースに対する複数の範囲置換を適用。`{ source, change, changes }`
- `isNoopChange(change)`、`EditError`（`code`: implicit-element / invalid-range / source-mismatch / no-inner-content / invalid-attribute-name / file-mismatch / overlapping-edits）

### 決めたこと（06 コメント・12 統合向け）

- 失敗は例外（`EditError`）。結果の値では返さない。`location` / `startTag` が null の要素は `implicit-element`。12 は編集 UI でこの要素を選べないようにするか、例外を捕まえて表示する
- どの `TextChange` も「指定範囲のうち、置き換え前後の共通の先頭・末尾を除いた最小の範囲」。サロゲートペアの途中では区切らない。何も変わらないときは `start === end` かつ `insertedLength === 0`（`isNoopChange`）。06 は no-op の変化を渡されても位置を動かさないこと
- 複数の変化の規約: `TextChange` の列は「前から順に適用し、各要素は直前までを適用した後のソースに対する位置」。1 つにまとめるときは `composeChanges`。06 はこの規約で 1 件ずつ追従させるか、まとめた 1 件で追従させる（どちらも同じ結果）
- 同じ元ソースに対する複数の編集は `applyEdits`（範囲を並べ替えて後ろから適用。重なりは例外。同じ位置への挿入は渡した順）
- 1 回の編集で位置がずれた後の `ElementInfo` は古い。編集後は解析層で解析し直してから次の要素編集を行う（`resolveElement` が開始タグの位置とタグ名を検証し、食い違えば `source-mismatch`）
- `setAttribute` の `value` は DOM の `getAttribute()` と同じデコード済みの値。`&` とクォートをエスケープして書く。元のクォートの種類を保つ。クォートなしの元の値は、書ける値ならクォートなしのまま、書けなければ `"` で囲む。新しい属性は最後の属性の後ろに、最後の属性の直前の空白をまねて足す。同名属性が複数ある場合 set は最初の 1 つ、remove はすべて
- `replaceElementInner` は、`ElementInfo` に終了タグの位置がないため、ソースを `parse5` で解析し直して終了タグを探す（閉じタグ漏れの要素は `location.end` までを中身とする）。空要素と SVG の自己終了タグは `no-inner-content`

### 共有契約への依頼

- `ElementInfo` に `endTag: SourceLocation | null`（終了タグの範囲。閉じタグ漏れ・空要素は null）を足してほしい。あれば `replaceElementInner` の解析し直しが不要になり、解析の食い違いも防げる。それまでは `src/edit` 内で parse5 を使って対応している（`src/edit/element.ts`）

### 確認結果

`tsc --noEmit` / `vitest run`（全体 191 件通過、うち src/edit 99 件）/ `eslint .` / `prettier --check .` すべて通過。

## レビュー

- 判定:
- 日付:
- 指摘事項:
