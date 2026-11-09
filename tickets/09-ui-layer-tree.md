# 09: UI レイヤーツリー

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/ui/layer-tree/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

生徒サイトの DOM 階層をツリーで表示し、選択・展開・ホバーを親アプリに伝える React コンポーネントを作る。データは `LayerNode[]` を受け取るだけにし、解析層とはつながない（モックデータで開発する）。

## 関連する設計ルール

- UI層（React）: レイヤーツリー、コードエディタ、コメント一覧
- React は親アプリの UI にだけ使う

## 実装チェックリスト

- [ ] `LayerTree` コンポーネント
  - [ ] props: `nodes: LayerNode[]`, `selectedId: ElementId | null`, `hoveredId: ElementId | null`, `commentedIds: Set<ElementId>`, `onSelect(id)`, `onHover(id | null)`
  - [ ] 各ノードの開閉（初期状態は浅い階層だけ開く）
  - [ ] `selectedId` が外から変わったら、そのノードまでの祖先を自動で開き、見える位置までスクロールする（iframe でクリックしたときの連動）
  - [ ] 選択中・ホバー中・コメントありのノードを見分けられる表示
  - [ ] キーボード操作（上下で移動、左右で開閉、Enter で選択）
  - [ ] `role="tree"` / `role="treeitem"` / `aria-expanded` / `aria-selected` を付ける
  - [ ] 各ノードに `data-testid="layer-node-<id>"` を付ける（E2E で使う）
- [ ] 大きなページ（要素数 1000 程度）でも操作が重くならないことを確認する
- [ ] 開発用のモックデータを `src/ui/layer-tree/` 内に置く

## テストチェックリスト

- [ ] ノードのクリックで `onSelect` が正しい ID で呼ばれる
- [ ] `selectedId` を深い階層の ID に変えると、祖先が開いて該当ノードが選択状態になる
- [ ] 開閉の動作
- [ ] キーボード操作
- [ ] `commentedIds` に含まれるノードに目印が付く
- [ ] ARIA 属性が正しい

## 完了条件

- [ ] `pnpm exec tsc --noEmit` が通る
- [ ] `pnpm exec vitest run` が通る
- [ ] `pnpm exec eslint .` が通る

## メモ

## レビュー

- 判定:
- 日付:
- 指摘事項:
