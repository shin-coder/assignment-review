# チケット一覧と進め方

`CLAUDE.md` のアーキテクチャ（読み込み／ソース管理／解析／プレビュー／操作スクリプト／UI）を、並列で開発できる単位に分けたチケット。

## 一覧

| #   | タイトル                                        | Wave | 依存   | 担当ディレクトリ                    |
| --- | ----------------------------------------------- | ---- | ------ | ----------------------------------- |
| 00  | [基盤セットアップと共有契約](00-foundation.md)  | 0    | -      | ルートの設定ファイル, `src/shared/` |
| 01  | [テスト用サンプルサイト](01-fixtures.md)        | 1    | 00     | `tests/fixtures/`                   |
| 02  | [読み込み層](02-loader.md)                      | 1    | 00     | `src/loader/`                       |
| 03  | [ソース管理層と IndexedDB 保存](03-store.md)    | 1    | 00     | `src/store/`                        |
| 04  | [解析層（要素 ↔ ソース位置）](04-parser.md)     | 1    | 00     | `src/parser/`                       |
| 05  | [編集の適用](05-edit.md)                        | 1    | 00     | `src/edit/`                         |
| 06  | [コメントの紐付け](06-comments.md)              | 1    | 00     | `src/comments/`                     |
| 07  | [プレビュー層（Service Worker）](07-preview.md) | 1    | 00     | `src/preview/`, `src/sw/`           |
| 08  | [操作スクリプト（iframe 内）](08-inject.md)     | 1    | 00     | `src/inject/`                       |
| 09  | [UI: レイヤーツリー](09-ui-layer-tree.md)       | 1    | 00     | `src/ui/layer-tree/`                |
| 10  | [UI: コードエディタ](10-ui-editor.md)           | 1    | 00     | `src/ui/editor/`                    |
| 11  | [UI: コメント一覧](11-ui-comments.md)           | 1    | 00     | `src/ui/comments/`                  |
| 12  | [統合（App の配線）](12-integration.md)         | 2    | 01〜11 | `src/app/`, `src/main.tsx`          |
| 13  | [E2E テスト](13-e2e.md)                         | 3    | 12     | `e2e/`                              |

## 依存グラフ

```
            ┌─ 01 fixtures ──────────────────────────┐
            ├─ 02 loader ─────┐                      │
            ├─ 03 store ──────┤                      │
            ├─ 04 parser ─────┤                      │
00 基盤 ────┼─ 05 edit ───────┤                      │
            ├─ 06 comments ───┼── 12 統合 ── 13 E2E ─┘
            ├─ 07 preview ────┤
            ├─ 08 inject ─────┤
            ├─ 09 ui-layer ───┤
            ├─ 10 ui-editor ──┤
            └─ 11 ui-comments ┘
```

- **Wave 0**: 00 を最初に 1 人で終わらせる。ここで型・メッセージ・依存パッケージ・ディレクトリを決める
- **Wave 1**: 01〜11 は互いに依存しないので同時に着手できる
- **Wave 2**: 12 は Wave 1 がすべて承認されてから着手する
- **Wave 3**: 13 は 12 の承認後に着手する

## 並列開発のルール

1. **担当ディレクトリの外は変更しない**。とくに次の 3 つは 00 以外で変更しない
   - `src/shared/`（共有の型・定数）
   - `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc`（依存パッケージとその取得方法）
   - ルートの設定ファイル（`tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`）
2. 共有の型や依存パッケージの追加が必要になったら、作業を止めてチケットの「メモ」欄に書き、まとめて 00 の担当（または統合担当）が `src/shared/` に反映する
3. 他の層の実装を `import` しない。他層とのやり取りは `src/shared/` の型だけを使い、テストではモックを使う。実物どうしの配線は 12 で行う
4. 単体テストは対象ファイルの隣に `*.test.ts(x)` として置く
5. チケットごとに `ticket/NN-<名前>` のブランチを作って作業・コミットする（例: `ticket/04-parser`）。Wave 1 のブランチは、承認済みの 00 のブランチから作る。並列作業は git worktree を使う前提
6. 依存パッケージは `pnpm install --frozen-lockfile` で入れる（`pnpm-lock.yaml` を書き換えない）。Claude のサンドボックス内では実行せず、ユーザーが実行する（サンドボックス内ではプロジェクト内に別のストアができて食い違うため）
7. Service Worker（`src/sw/`）や `src/shared/` を変更したら、`pnpm exec tsc --noEmit -p tsconfig.sw.json` でも型チェックする

## 作業の流れ

1. 新しい worktree では `pnpm install --frozen-lockfile` を実行する
2. チケットを読み、「関連する設計ルール」と `src/shared/` の契約を確認する
3. 実装しながら「実装チェックリスト」「テストチェックリスト」に `[x]` を付ける
4. 「完了条件」のコマンドがすべて通ることを自分で確認する
5. `reviewer` エージェントにレビューを依頼する（例: 「reviewer で tickets/04 をレビューして」）
6. レビュー欄が「要修正」なら指摘に対応し、もう一度レビューを依頼する。「承認」で完了

## チケットの書式

各チケットは次の節を持つ。

- 冒頭: Wave / 依存 / 担当ディレクトリ / 変更禁止の領域
- 目的
- 関連する設計ルール（`CLAUDE.md` / `.claude/rules/testing.md` から）
- 実装チェックリスト
- テストチェックリスト
- 完了条件
- メモ（作業中の気づき・共有契約の変更依頼）
- レビュー（`reviewer` エージェントが記入）
