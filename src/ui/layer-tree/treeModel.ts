import type { ElementId, LayerNode } from "../../shared";

/** ツリー全体を引くための索引。nodes が変わったときだけ作り直す */
export interface TreeIndex {
  nodeById: Map<ElementId, LayerNode>;
  /** 親の ID。ルートは null */
  parentOf: Map<ElementId, ElementId | null>;
  /** ルートを 0 とした深さ */
  depthOf: Map<ElementId, number>;
}

/** 画面に出す 1 行分。開いている枝の中だけを並べる */
export interface VisibleRow {
  node: LayerNode;
  /** aria-level に使う。ルートが 1 */
  level: number;
  /** 兄弟の中での位置（aria-posinset、1 始まり） */
  posInSet: number;
  /** 兄弟の数（aria-setsize） */
  setSize: number;
  hasChildren: boolean;
  expanded: boolean;
}

/** 開閉とキーボードのフォーカスの状態。props の nodes / selectedId から導く */
export interface ExpandState {
  /** 前回同期した nodes。初回は null */
  nodes: readonly LayerNode[] | null;
  /** 前回同期した selectedId */
  selectedId: ElementId | null;
  /** これまでに見た ID。新しく現れたノードにだけ初期の開閉を当てるために使う */
  knownIds: ReadonlySet<ElementId>;
  expanded: ReadonlySet<ElementId>;
  /** キーボード操作の起点になるノード（tabIndex=0 を持つ行） */
  focusedId: ElementId | null;
}

export const EMPTY_EXPAND_STATE: ExpandState = {
  nodes: null,
  selectedId: null,
  knownIds: new Set(),
  expanded: new Set(),
  focusedId: null,
};

/** 深い DOM でも呼び出しスタックを使い切らないよう、再帰を使わずに走査する */
export function buildTreeIndex(nodes: readonly LayerNode[]): TreeIndex {
  const nodeById = new Map<ElementId, LayerNode>();
  const parentOf = new Map<ElementId, ElementId | null>();
  const depthOf = new Map<ElementId, number>();
  const stack: { node: LayerNode; parentId: ElementId | null; depth: number }[] = nodes.map(
    (node) => ({ node, parentId: null, depth: 0 }),
  );
  while (stack.length > 0) {
    const { node, parentId, depth } = stack.pop()!;
    nodeById.set(node.id, node);
    parentOf.set(node.id, parentId);
    depthOf.set(node.id, depth);
    for (const child of node.children) {
      stack.push({ node: child, parentId: node.id, depth: depth + 1 });
    }
  }
  return { nodeById, parentOf, depthOf };
}

/** 親から順に上へたどった祖先の ID。ツリーにない ID は空配列 */
export function ancestorIds(index: TreeIndex, id: ElementId): ElementId[] {
  const result: ElementId[] = [];
  let current = index.parentOf.get(id) ?? null;
  while (current !== null) {
    result.push(current);
    current = index.parentOf.get(current) ?? null;
  }
  return result;
}

/** 開いている枝だけを文書順に並べる。閉じた枝の子孫は行を作らない */
export function flattenVisible(
  nodes: readonly LayerNode[],
  expanded: ReadonlySet<ElementId>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  // 兄弟の並びごとに「次に見る位置」を持つ。深さ優先で文書順に並べる
  const stack: { siblings: readonly LayerNode[]; index: number; level: number }[] = [
    { siblings: nodes, index: 0, level: 1 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.siblings.length) {
      stack.pop();
      continue;
    }
    const node = frame.siblings[frame.index]!;
    frame.index += 1;
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && expanded.has(node.id);
    rows.push({
      node,
      level: frame.level,
      posInSet: frame.index,
      setSize: frame.siblings.length,
      hasChildren,
      expanded: isExpanded,
    });
    if (isExpanded) stack.push({ siblings: node.children, index: 0, level: frame.level + 1 });
  }
  return rows;
}

/**
 * props の変化を開閉状態に反映する。変化がなければ prev をそのまま返す。
 * - nodes が変わったら、新しく現れたノードのうち浅い階層（深さ < defaultExpandDepth）を開く。
 *   以前からあるノードは講師が開閉した状態を保つ（HTML 編集後の再解析で閉じ直さないため）
 * - selectedId があれば祖先をすべて開く（iframe でクリックしたときの連動）
 * - selectedId が外から変わったら、キーボードの起点もそのノードに移す
 */
export function syncExpandState(
  prev: ExpandState,
  nodes: readonly LayerNode[],
  index: TreeIndex,
  selectedId: ElementId | null,
  defaultExpandDepth: number,
): ExpandState {
  const nodesChanged = prev.nodes !== nodes;
  const selectionChanged = prev.selectedId !== selectedId;
  if (!nodesChanged && !selectionChanged) return prev;

  const expanded = new Set(prev.expanded);
  let knownIds = prev.knownIds;
  if (nodesChanged) {
    for (const [id, node] of index.nodeById) {
      if (prev.knownIds.has(id) || node.children.length === 0) continue;
      if ((index.depthOf.get(id) ?? 0) < defaultExpandDepth) expanded.add(id);
    }
    knownIds = new Set(index.nodeById.keys());
  }
  if (selectedId !== null) {
    for (const id of ancestorIds(index, selectedId)) expanded.add(id);
  }
  return {
    nodes,
    selectedId,
    knownIds,
    expanded,
    focusedId: selectionChanged && selectedId !== null ? selectedId : prev.focusedId,
  };
}

/** 開閉を切り替える。閉じたノードの子孫にフォーカスがあれば、閉じたノードへ移す */
export function setNodeExpanded(
  state: ExpandState,
  index: TreeIndex,
  id: ElementId,
  expand: boolean,
): ExpandState {
  if (state.expanded.has(id) === expand) return state;
  const expanded = new Set(state.expanded);
  if (expand) {
    expanded.add(id);
    return { ...state, expanded };
  }
  expanded.delete(id);
  const focusHidden = state.focusedId !== null && ancestorIds(index, state.focusedId).includes(id);
  return { ...state, expanded, focusedId: focusHidden ? id : state.focusedId };
}

/**
 * tabIndex=0 を持たせる行の ID。focusedId が閉じた枝の中にあれば一番近い見えている祖先、
 * それもなければ先頭の行。行がなければ null
 */
export function resolveFocusId(
  rows: readonly VisibleRow[],
  rowIndexById: ReadonlyMap<ElementId, number>,
  index: TreeIndex,
  focusedId: ElementId | null,
): ElementId | null {
  if (focusedId !== null) {
    if (rowIndexById.has(focusedId)) return focusedId;
    const visibleAncestor = ancestorIds(index, focusedId).find((id) => rowIndexById.has(id));
    if (visibleAncestor !== undefined) return visibleAncestor;
  }
  return rows[0]?.node.id ?? null;
}

export type TreeKeyAction =
  | { type: "focus"; id: ElementId }
  | { type: "expand"; id: ElementId }
  | { type: "collapse"; id: ElementId }
  | { type: "select"; id: ElementId };

/**
 * キー入力に対する操作を決める（WAI-ARIA の Tree View パターンに沿う）。
 * - 上下: 前後の行へ移動。Home / End: 先頭 / 末尾へ移動
 * - 右: 閉じていれば開く。開いていれば最初の子へ移動
 * - 左: 開いていれば閉じる。閉じていれば親へ移動
 * - Enter / Space: 選択
 * 何もしないキーは null
 */
export function keyboardAction(
  rows: readonly VisibleRow[],
  rowIndexById: ReadonlyMap<ElementId, number>,
  index: TreeIndex,
  focusedId: ElementId | null,
  key: string,
): TreeKeyAction | null {
  if (rows.length === 0) return null;
  const position = focusedId === null ? -1 : (rowIndexById.get(focusedId) ?? -1);
  const row = rows[position];
  const focus = (target: VisibleRow | undefined): TreeKeyAction | null =>
    target ? { type: "focus", id: target.node.id } : null;

  switch (key) {
    case "ArrowDown":
      return focus(position < 0 ? rows[0] : rows[position + 1]);
    case "ArrowUp":
      return focus(position < 0 ? rows[0] : rows[position - 1]);
    case "Home":
      return focus(rows[0]);
    case "End":
      return focus(rows[rows.length - 1]);
    case "ArrowRight":
      if (!row?.hasChildren) return null;
      return row.expanded ? focus(rows[position + 1]) : { type: "expand", id: row.node.id };
    case "ArrowLeft": {
      if (!row) return null;
      if (row.expanded) return { type: "collapse", id: row.node.id };
      const parentId = index.parentOf.get(row.node.id) ?? null;
      return parentId === null ? null : { type: "focus", id: parentId };
    }
    case "Enter":
    case " ":
      return row ? { type: "select", id: row.node.id } : null;
    default:
      return null;
  }
}

/** "div#main.card" をタグ名 "div" と残り "#main.card" に分ける（色分けして読みやすくする） */
export function splitLabel(label: string): { tag: string; rest: string } {
  const match = /^([^#.\s]*)(.*)$/s.exec(label);
  return { tag: match?.[1] ?? label, rest: match?.[2] ?? "" };
}
