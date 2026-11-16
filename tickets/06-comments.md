# 06: コメントの紐付け

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/comments/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

コメントを DOM ノードではなくソース上の位置（ファイルパス＋位置情報）に紐付け、ソースが編集されても正しい箇所を指し続けるようにする。

## 関連する設計ルール

- コメントは DOM ノードではなく、ソース上の位置（ファイルパス＋位置情報）に紐付けて保存する
- JS が後から生成した要素はソース上に対応する位置がないため、編集・コメントの保存対象外として扱う
- 中核ロジック（コメントの紐付け）には必ず Vitest の単体テストを書く

## 実装チェックリスト

- [x] `createComment(info: ElementInfo | null, body)`: 要素の位置から `ReviewComment` を作る。`info` が `null`（JS 生成要素）または `info.location` が `null`（補正で暗黙に作られた要素）の場合は作らずに理由を返す
- [x] `shiftLocation(location, change: TextChange)`: 編集による位置のずれを計算する
  - [x] 変更がコメント範囲より後ろ → そのまま
  - [x] 変更がコメント範囲より前 → 差分だけずらす
  - [x] 変更がコメント範囲の内側 → 範囲を伸縮する
  - [x] 変更がコメント範囲を完全に含む（要素が消えた） → 失効（`orphaned`）
  - [x] 範囲の一部と重なる場合のルールを決めて実装する
  - [x] 別ファイルの変更は影響しない
- [x] `applyChangesToComments(comments, changes)`: 複数のコメントに複数の変更を順に適用する
- [x] `resolveCommentElement(comment, map: ElementSourceMap)`: コメント位置に対応する現在の要素 ID を返す（レイヤーツリーやプレビューで強調表示するため）。見つからなければ `null`

## テストチェックリスト

- [x] `shiftLocation` の各ケース（前・後ろ・内側・完全に含む・一部重なる・別ファイル）
- [x] 同じ位置への挿入（コメント範囲の開始位置ちょうど／終了位置ちょうど）の扱い
- [x] 複数の変更を順に適用した結果が、まとめて適用した結果と一致する
- [x] ソース位置がない要素ではコメントが作られない
- [x] 要素を編集した後も `resolveCommentElement` が同じ要素を返す（04 の解析結果相当のデータを手で作ってテストする）
- [x] 要素を削除すると `orphaned` になり、`resolveCommentElement` が `null` を返す

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### 公開 API（`src/comments/index.ts`）

- `createComment(info: ElementInfo | null, body: string, options?: CreateCommentOptions): CreateCommentResult`
  - 成功: `{ ok: true; comment: ReviewComment }`。位置は `info.location`（要素全体の範囲）の複製。`status` は `"active"`、本文は受け取ったまま保存する
  - 失敗: `{ ok: false; reason: CreateCommentFailureReason; message: string }`。`message` はそのまま画面に出せる文
    - `"generated-element"`: `info` が `null`（JS が生成した要素。`review:select` の `generated: true` など）
    - `"implicit-element"`: `info.location` が `null`（補正で暗黙に作られた要素）
    - `"empty-body"`: 本文が空、または空白だけ
  - `CreateCommentOptions = { idFactory?: () => string; now?: () => number }`。省略時は `crypto.randomUUID()` と `Date.now()`。テストでは固定値を渡す
- `shiftLocation(location: SourceLocation, change: TextChange): SourceLocation | null`
  - 変更 1 回分で位置を追従させる。`null` は失効（要素が消えた）。変化がなければ受け取った `location` を同じオブジェクトで返す
- `applyChangesToComments(comments: readonly ReviewComment[], changes: readonly TextChange[]): ReviewComment[]`
  - `changes` は編集が行われた順。各変更の位置は「1 つ前の変更まで適用した後のソース」上の値（src/edit が返す `TextChange` をそのまま順に並べたもの）
  - 入力は変更しない。位置も状態も変わらなかったコメントは同じオブジェクトを返す（React の再描画を抑えられる）
  - 失効したコメントは `status: "orphaned"` にし、位置を「元の要素があった場所」＝置き換え後の文字列の範囲 `[change.start, change.start + insertedLength)`（削除なら空の範囲）にする。以後の変更でも位置だけ同じ規則で追従させ、`active` には戻さない（一覧で「このあたりにあった」と示せるように）
- `resolveCommentElement(comment: ReviewComment, map: ElementSourceMap): ElementId | null`
  - 同じファイルで、要素全体の `location.start` がコメントの開始位置と一致する要素の ID を返す。開始タグの `<` は 1 つの要素にしか属さないので開始位置だけで決まる。終了位置は見ない（閉じタグのない要素は、後ろへの挿入で再解析後の終了位置が変わるため）
  - `orphaned` のコメント、見つからない場合、`location` が `null` の要素は `null` / 対象外
- 型: `CreateCommentResult`, `CreateCommentFailureReason`, `CreateCommentOptions`

### 位置の追従ルール（`shiftLocation`）

コメント範囲を `[start, end)`、変更範囲を `[cs, ce)`（`insertedLength` = L）、差分を `delta = L - (ce - cs)` とする。開始位置（要素の開始タグの `<`）を「錨」とし、上から順に判定する。

| #   | 条件                                                      | 結果                                                                                   |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | 別ファイル                                                | そのまま                                                                               |
| 2   | 後ろ: `cs >= end`（**終了位置ちょうどへの挿入**を含む）   | そのまま（挿入した文字列は範囲に含めない）                                             |
| 3   | 前: `ce <= start`（**開始位置ちょうどへの挿入**を含む）   | 開始・終了とも `delta` だけずらす（挿入した文字列は範囲に含めない）                    |
| 4   | `cs < start < ce`（開始側の一部重なり／範囲を完全に含む） | 失効。錨が置き換えられ、要素の起点が分からなくなるため（親要素ごとの置き換えも失効）   |
| 5   | `start <= cs` かつ `ce <= end`（内側）                    | 開始位置を保ち、終了位置を `end + delta`                                               |
| 6   | `start <= cs < end < ce`（終了側の一部重なり）            | 開始位置を保ち、終了位置を `cs + L`（挿入した文字列の終わり）にする                    |
| 7   | 5・6 の結果、範囲が空になった                             | 失効（範囲の文字がすべて消えた。例: 範囲全体の削除、開始位置から終了位置を越える削除） |

- 範囲全体（`start`〜`end` ちょうど）を空でない文字列に置き換えた場合は 5 により「要素の置き換え」とみなし、置き換え後の文字列 `[start, start + L)` を指す（`replaceElement` で要素を書き換えてもコメントが残る）。開始位置ちょうどから終了位置を越えて空でない文字列に置き換えた場合も 6 により `[start, start + L)` を指す
- 開始位置ちょうどから始まる内側の変更（タグ名の変更など）でも開始位置は保つ
- 範囲が空（失効したコメントの位置）のとき、その位置ちょうどへの挿入は 2 により動かない
- 2〜7 は「開始位置は右寄せ（その位置への挿入で後ろへずれる）、終了位置は左寄せ（その位置への挿入で動かない）の目印」として決まり、範囲が一度空になったら戻らないため、互いに重ならない変更はどの順に当てても同じ結果になる

### 「順に適用」と「まとめて適用」の定義とテスト

- 順に適用: `applyChangesToComments` に、各変更の座標を直前の変更の後のソースで表した列を渡すこと
- まとめて適用: 同じ元のソース上の座標で書かれた、互いに重ならない変更の集合を一度に当てること。これを順の列で表す方法は 2 通りある（昇順: 前から当て、後の変更を前の変更の差分だけずらす／降順: 後ろから当て、座標は元のまま）
- テスト（`applyChangesToComments.test.ts`）: 両方の表現で、コメントの位置と状態（失効時の位置を含む）が一致することを、具体例と疑似乱数（固定シード、3000 回）で確かめた。疑似乱数のテストで、旧ルール（開始位置ちょうどから終了位置を越える置き換えは常に失効）が順序で結果が変わることを見つけ、上の 6・7 に直した
- 合成した変更: 変更がすべてコメント範囲の内側、またはすべて前にある場合は、それらを 1 つの最小差分（共通の先頭・末尾を除いた範囲）にまとめた変更を当てた結果とも一致することをテストした。範囲の境界をまたいで合成した場合（例: 範囲の前と内側の 2 か所の編集を 1 つの差分にまとめると 4 に当たり失効する）は一致しないので、05 / 12 は編集ごとの `TextChange` をそのまま順に渡すこと

### 12（統合）・05（編集）への申し送り

- 12: 編集で得た `TextChange` を、発生順のまま `applyChangesToComments` に渡す。`replaceFile` のような全体差分を使う場合も、編集 1 回ごとに求めて渡す（まとめて 1 つにすると上記のとおり境界をまたいで失効しやすい）
- 05: `replaceFile` の最小差分は、共通の先頭・末尾の取り方によって要素の境界から外れることがある。例: `<p>b</p>` の前に `<p>a</p>` を挿入すると、差分は `<p>` の直後への `a</p><p>` の挿入（内側）になり、コメントは前に挿入された新しい `<p>` を指してしまう。差分の位置をタグの境界（`<` の直前）に寄せるなどの対策を検討してほしい（06 側ではソース位置しか持たないため補正できない）
- 12: 親要素を `replaceElement` で丸ごと置き換えると、`TextChange` が親の範囲全体になり、子要素のコメントは 4 により失効する。子のコメントを残したい場合は、置き換え前後の要素テキストの最小差分を `TextChange` として渡す
- 共有型の追加依頼はなし（`src/shared/` の `ReviewComment` / `SourceLocation` / `TextChange` / `ElementInfo` だけで実装した）
- テスト用の補助関数は `src/comments/testUtils.ts`（テストからだけ使う。`index.ts` からは公開していない）

## レビュー

- 判定:
- 日付:
- 指摘事項:
