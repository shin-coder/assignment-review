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

- [x] `LayerTree` コンポーネント
  - [x] props: `nodes: LayerNode[]`, `selectedId: ElementId | null`, `hoveredId: ElementId | null`, `commentedIds: Set<ElementId>`, `onSelect(id)`, `onHover(id | null)`
  - [x] 各ノードの開閉（初期状態は浅い階層だけ開く）
  - [x] `selectedId` が外から変わったら、そのノードまでの祖先を自動で開き、見える位置までスクロールする（iframe でクリックしたときの連動）
  - [x] 選択中・ホバー中・コメントありのノードを見分けられる表示
  - [x] キーボード操作（上下で移動、左右で開閉、Enter で選択）
  - [x] `role="tree"` / `role="treeitem"` / `aria-expanded` / `aria-selected` を付ける
  - [x] 各ノードに `data-testid="layer-node-<id>"` を付ける（E2E で使う）
- [x] 大きなページ（要素数 1000 程度）でも操作が重くならないことを確認する
- [x] 開発用のモックデータを `src/ui/layer-tree/` 内に置く

## テストチェックリスト

- [x] ノードのクリックで `onSelect` が正しい ID で呼ばれる
- [x] `selectedId` を深い階層の ID に変えると、祖先が開いて該当ノードが選択状態になる
- [x] 開閉の動作
- [x] キーボード操作
- [x] `commentedIds` に含まれるノードに目印が付く
- [x] ARIA 属性が正しい

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### ファイル構成

- `LayerTree.tsx`: コンポーネント本体（`index.ts` から `LayerTree` と `LayerTreeProps` を公開）
- `LayerTree.css`: 見た目。コンポーネントが import する。色と文字サイズは `.layer-tree` の CSS 変数（`--layer-tree-font-size` など）で親から上書きできる
- `treeModel.ts`: React に依存しない処理（索引、表示行の平坦化、開閉状態の同期、キー操作の判定）。単体テストは `treeModel.test.ts`
- `mockNodes.ts`: 開発用のモックデータ（`mockLayerNodes`、`createLargeLayerNodes(count)`）。`index.ts` からは公開していない

### コンポーネントの API（チケット 12 向け）

```tsx
import { LayerTree } from "../ui/layer-tree";

<LayerTree
  nodes={layerNodes} // readonly LayerNode[]（必須）
  selectedId={selectedId} // ElementId | null（必須）
  hoveredId={hoveredId} // ElementId | null（必須）
  commentedIds={commentedIds} // ReadonlySet<ElementId>（必須。Set<ElementId> をそのまま渡せる）
  onSelect={(id) => setSelectedId(id)} // (id: ElementId) => void（必須）
  onHover={(id) => setHoveredId(id)} // (id: ElementId | null) => void（必須）
  defaultExpandDepth={2} // 省略可。既定 2
  ariaLabel="レイヤーツリー" // 省略可
/>;
```

- 選択は親が持つ（制御コンポーネント）。クリックや Enter / Space では `onSelect` を呼ぶだけで、表示は `selectedId` が返ってきてから変わる
- `onHover` はツリー上のホバー先が変わったときだけ呼ぶ（`hoveredId` と同じなら呼ばない）。ツリーから出たら `onHover(null)`。iframe 側のホバーを `hoveredId` に入れればツリーにも目印が出るが、閉じた枝の中のノードを開くことはしない
- `selectedId` が変わると祖先を開き、`scrollIntoView({ block: "nearest" })` で見える位置まで動かす。`nodes` が変わったときも同じ処理をする（再解析後も選択中のノードを見失わないため）。ツリーにない ID（JS が生成した要素など）は何もしない
- 開閉状態はコンポーネント内に持つ。`nodes` を新しい配列にしても、同じ ID のノードは講師が開閉した状態を保ち、新しく現れたノードにだけ `defaultExpandDepth` を当てる。別のページ（別の HTML）に切り替えて開閉をリセットしたいときは `key` を変えて作り直す
- `nodes` が空なら「表示できる要素がありません」と表示する
- 高さは親いっぱい（`height: 100%`）で、ツリー自体がスクロールする。親に高さを与えること

### 表示

- 選択中: 濃い青の背景に白文字。ホバー中: 薄い青の背景（`data-hovered="true"`）。コメントあり: 行末にオレンジの丸と、読み上げ用の「（コメントあり）」（`data-commented="true"`）
- キーボードのフォーカス: 黄色の枠（`:focus-visible`）
- 文字は等幅の 16px、行の高さ 2em。タグ名は紫の太字、`#id.class` は灰色で色分けする

### キーボード操作

WAI-ARIA の Tree View パターンに沿い、tabindex は 1 行だけ 0 にする（roving tabindex）。

- 上下: 前後の行へ、Home / End: 先頭 / 末尾へ
- 右: 閉じていれば開く、開いていれば最初の子へ
- 左: 開いていれば閉じる、閉じていれば親へ
- Enter / Space: `onSelect`
- フォーカス中のノードの祖先を閉じたら、フォーカスは閉じたノードに移る

### 要素数 1000 程度での確認

- 開いている枝の行だけを描画する。既定（深さ 2 まで開く）では、1000 要素のツリーでも描画するのは body 直下までの約 100 行だけ
- 行コンポーネントは `memo` にし、props をすべてプリミティブにしている。ホバーや選択が変わっても、描画し直すのは状態が変わった行だけ
- イベントは行ごとにハンドラを作らず、`<ul>` で受けて `data-layer-id` から行を特定する
- テスト（`LayerTree.test.tsx` の「大きなページ」）: 約 1000 行をすべて開いて描画し、jsdom で初回 3 秒未満、ホバー・選択の更新 1 回あたり 200ms 未満を確かめる。遅い CI でも落ちないよう緩めの目安にしている。実際の Chrome での体感は確認していないので、E2E（チケット 13）か統合時に大きなページで操作して確認してほしい

### 補足

- vitest の `globals` が無効なので、Testing Library の自動クリーンアップが働かない。コンポーネントのテストでは `afterEach(cleanup)` を明示的に呼んでいる（他の UI チケットも同様に必要）
- 開閉状態は effect ではなく描画中に props から同期している（React の「前回の props を state に持つ」パターン）。effect で同期すると、祖先が閉じたままの描画が一度挟まってスクロールが遅れるため

## レビュー

- 判定: 承認
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功
  - vitest: 成功（136 件。うち本チケット分 44 件: `treeModel.test.ts` 25 件、`LayerTree.test.tsx` 19 件）
  - eslint: 成功
  - prettier --check: 成功
  - playwright: 対象外
- 未達の項目: なし
  - props: `src/ui/layer-tree/LayerTree.tsx:24-45`（`commentedIds` は `ReadonlySet` で受け、`Set` をそのまま渡せる）
  - 開閉と初期状態: `treeModel.ts:117-147`（深さ `defaultExpandDepth` 未満を開く）、`LayerTree.tsx:91-107`。テスト `LayerTree.test.tsx:51-95`
  - `selectedId` が外から変わったら祖先を開いてスクロール: 描画中の同期 `LayerTree.tsx:61-71` と `treeModel.ts:137-139`、スクロール `LayerTree.tsx:81-84`（`scrollIntoView({ block: "nearest" })`）。テスト `LayerTree.test.tsx:108-127` で祖先の `aria-expanded`、`aria-selected`、`scrollIntoView` が e12 の要素に対して呼ばれたことまで検証している。ツリーにない ID のテストも `:129-135` にある
  - 選択・ホバー・コメントの見分け: `LayerTree.tsx:203-233` と `LayerTree.css:36-43, 82-90`。テスト `LayerTree.test.tsx:138-174`
  - キーボード操作: `treeModel.ts:199-236`（上下・Home/End・左右・Enter/Space）、`LayerTree.tsx:118-136`（`preventDefault`、roving tabindex）。テストはロジック `treeModel.test.ts:149-183` と、実際にキー入力してフォーカス移動を確かめる `LayerTree.test.tsx:176-227` の両方がある
  - ARIA: `role="tree"`（`LayerTree.tsx:145`）、`role="treeitem"` / `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded`（子があるときだけ）/ `aria-selected`（`:204-214`）。フラットな treeitem の並びに `aria-level` などを付ける形は WAI-ARIA の Tree View パターンで認められている。テスト `LayerTree.test.tsx:229-248`
  - `data-testid="layer-node-<id>"`: `LayerTree.tsx:206`
  - 1000 要素程度での確認: 開いている枝だけ描画（`treeModel.ts:78-108`）、行は `memo` でプリミティブ props（`LayerTree.tsx:188`）、イベントは `<ul>` でまとめて受ける（`:96-116`）。テスト `LayerTree.test.tsx:250-274` で 1000 要素を全部開いて描画し、更新時間を測っている。しきい値（初回 3 秒、更新 200ms）はゆるいが、実測ではこのテスト全体（初回描画と更新 20 回）が 358ms だったので、初回・更新とも余裕はかなりある。実際の Chrome での体感は未確認であることがメモに正直に書かれており、jsdom の値で確認したとして達成と判断した
  - モックデータ: `src/ui/layer-tree/mockNodes.ts`（`index.ts` からは公開していない）
- ルール違反: なし
  - 変更は `src/ui/layer-tree/` と本チケットだけ（`git status`）。`src/shared/`・`package.json`・ルートの設定ファイル・`tests/fixtures/` には変更なし。`package-lock.json` / `yarn.lock` もない
  - import は `../../shared` の型だけで、他の層の実装は import していない。React は親アプリの UI にだけ使っている
  - テストに `skip` / `only` の残りや、期待値のない `expect` はない
- その他の指摘（任意・判定には影響しない改善案）:
  - 同じ `selectedId` のままだと祖先を開き直さない。講師がツリーで祖先を閉じたあと iframe で同じ要素をもう一度クリックしても、`selectedId` が変わらないのでツリーは開かずスクロールもしない（`treeModel.ts:124-126`、`LayerTree.tsx:81-84`）。統合（12）で「同じ要素の再クリック」をどう扱うか（ツリー側に再表示の指示を渡すなど）を決めておくとよい
  - ツリーにフォーカスがある状態で `selectedId` が外から変わると、tabindex=0 は新しい選択に移るが DOM のフォーカスは元の行に残る（`treeModel.ts:145`）。次の矢印キーは新しい選択を起点に動くので、フォーカス表示と動きがずれる。普通は iframe をクリックした時点でフォーカスがツリーから外れるので実害は小さい
  - 選択中かつホバー中の行は、選択の背景だけになりホバーが見えない（`LayerTree.css:36-43`）。困らなければそのままでよい
  - 性能テストのしきい値（更新 200ms）はかなりゆるく、大きく遅くなったときしか検出できない。実際の Chrome での確認は、メモのとおりチケット 12 / 13 で大きなページを開いて行うこと
