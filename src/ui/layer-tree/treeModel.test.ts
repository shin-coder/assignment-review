import { describe, expect, it } from "vitest";
import type { LayerNode } from "../../shared";
import { createLargeLayerNodes, mockLayerNodes } from "./mockNodes";
import {
  EMPTY_EXPAND_STATE,
  ancestorIds,
  buildTreeIndex,
  flattenVisible,
  keyboardAction,
  resolveFocusId,
  setNodeExpanded,
  splitLabel,
  syncExpandState,
  type VisibleRow,
} from "./treeModel";

const n = (id: string, children: LayerNode[] = []): LayerNode => ({ id, label: id, children });

// a ─┬─ b ── c
//    └─ d
// e
const tree: LayerNode[] = [n("a", [n("b", [n("c")]), n("d")]), n("e")];
const index = buildTreeIndex(tree);

const ids = (rows: VisibleRow[]) => rows.map((row) => row.node.id);
const rowIndex = (rows: VisibleRow[]) => new Map(rows.map((row, i) => [row.node.id, i]));

describe("buildTreeIndex / ancestorIds", () => {
  it("親と深さを記録する", () => {
    expect(index.parentOf.get("a")).toBeNull();
    expect(index.parentOf.get("c")).toBe("b");
    expect(index.depthOf.get("a")).toBe(0);
    expect(index.depthOf.get("c")).toBe(2);
    expect(index.nodeById.size).toBe(5);
  });

  it("祖先を親から順に返し、ツリーにない ID は空配列", () => {
    expect(ancestorIds(index, "c")).toEqual(["b", "a"]);
    expect(ancestorIds(index, "a")).toEqual([]);
    expect(ancestorIds(index, "zzz")).toEqual([]);
  });

  it("深いツリーでもスタックを使い切らない", () => {
    let deep = n("leaf");
    for (let i = 0; i < 20000; i += 1) deep = n(`d${i}`, [deep]);
    const deepIndex = buildTreeIndex([deep]);
    expect(deepIndex.depthOf.get("leaf")).toBe(20000);
    const all = new Set(deepIndex.nodeById.keys());
    expect(flattenVisible([deep], all)).toHaveLength(20001);
  });
});

describe("flattenVisible", () => {
  it("開いている枝だけを文書順に並べる", () => {
    expect(ids(flattenVisible(tree, new Set()))).toEqual(["a", "e"]);
    expect(ids(flattenVisible(tree, new Set(["a"])))).toEqual(["a", "b", "d", "e"]);
    expect(ids(flattenVisible(tree, new Set(["a", "b"])))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("閉じた親の中で開いている子は表示しない", () => {
    expect(ids(flattenVisible(tree, new Set(["b"])))).toEqual(["a", "e"]);
  });

  it("level / posInSet / setSize / hasChildren / expanded を付ける", () => {
    const rows = flattenVisible(tree, new Set(["a"]));
    expect(rows.map(({ node, ...rest }) => ({ id: node.id, ...rest }))).toEqual([
      { id: "a", level: 1, posInSet: 1, setSize: 2, hasChildren: true, expanded: true },
      { id: "b", level: 2, posInSet: 1, setSize: 2, hasChildren: true, expanded: false },
      { id: "d", level: 2, posInSet: 2, setSize: 2, hasChildren: false, expanded: false },
      { id: "e", level: 1, posInSet: 2, setSize: 2, hasChildren: false, expanded: false },
    ]);
  });

  it("子のないノードは expanded に入っていても expanded=false", () => {
    expect(flattenVisible([n("x")], new Set(["x"]))[0]?.expanded).toBe(false);
  });
});

describe("syncExpandState", () => {
  it("初回は深さが defaultExpandDepth 未満で子のあるノードを開く", () => {
    const state = syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 1);
    expect([...state.expanded]).toEqual(["a"]);
    expect(syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 0).expanded.size).toBe(0);
    expect([...syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 9).expanded].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("props が変わらなければ同じオブジェクトを返す", () => {
    const state = syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 1);
    expect(syncExpandState(state, tree, index, null, 1)).toBe(state);
  });

  it("selectedId の祖先を開き、フォーカスを移す", () => {
    const initial = syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 0);
    const state = syncExpandState(initial, tree, index, "c", 0);
    expect([...state.expanded].sort()).toEqual(["a", "b"]);
    expect(state.focusedId).toBe("c");
  });

  it("nodes が変わっても、以前からあるノードの開閉は保ち、新しいノードだけ初期状態にする", () => {
    let state = syncExpandState(EMPTY_EXPAND_STATE, tree, index, null, 1);
    // 講師が a を閉じる
    state = setNodeExpanded(state, index, "a", false);
    // 再解析で同じ ID のツリーと、新しい要素 f が来る
    const next = [...tree.map((node) => ({ ...node })), n("f", [n("g")])];
    state = syncExpandState(state, next, buildTreeIndex(next), null, 1);
    expect(state.expanded.has("a")).toBe(false);
    expect(state.expanded.has("f")).toBe(true);
  });

  it("selectedId が nodes より先に来ても、nodes が来たときに祖先を開く", () => {
    let state = syncExpandState(EMPTY_EXPAND_STATE, [], buildTreeIndex([]), "c", 0);
    expect(state.expanded.size).toBe(0);
    state = syncExpandState(state, tree, index, "c", 0);
    expect([...state.expanded].sort()).toEqual(["a", "b"]);
  });
});

describe("setNodeExpanded", () => {
  it("閉じたノードの子孫にフォーカスがあれば、閉じたノードへ移す", () => {
    const state = syncExpandState(EMPTY_EXPAND_STATE, tree, index, "c", 0);
    const collapsed = setNodeExpanded(state, index, "a", false);
    expect(collapsed.expanded.has("a")).toBe(false);
    expect(collapsed.focusedId).toBe("a");
    expect(setNodeExpanded(collapsed, index, "a", false)).toBe(collapsed);
  });

  it("関係ないノードを閉じてもフォーカスは動かない", () => {
    const state = syncExpandState(EMPTY_EXPAND_STATE, tree, index, "d", 9);
    expect(setNodeExpanded(state, index, "b", false).focusedId).toBe("d");
  });
});

describe("resolveFocusId", () => {
  const rows = flattenVisible(tree, new Set(["a"]));
  const map = rowIndex(rows);

  it("見えていればそのまま、閉じた枝の中なら見えている祖先、なければ先頭", () => {
    expect(resolveFocusId(rows, map, index, "d")).toBe("d");
    expect(resolveFocusId(rows, map, index, "c")).toBe("b");
    expect(resolveFocusId(rows, map, index, null)).toBe("a");
    expect(resolveFocusId(rows, map, index, "zzz")).toBe("a");
    expect(resolveFocusId([], new Map(), index, "a")).toBeNull();
  });
});

describe("keyboardAction", () => {
  const rows = flattenVisible(tree, new Set(["a"])); // a, b, d, e
  const map = rowIndex(rows);
  const act = (focusedId: string | null, key: string) =>
    keyboardAction(rows, map, index, focusedId, key);

  it("上下・Home・End で移動し、端では何もしない", () => {
    expect(act("b", "ArrowDown")).toEqual({ type: "focus", id: "d" });
    expect(act("b", "ArrowUp")).toEqual({ type: "focus", id: "a" });
    expect(act("e", "ArrowDown")).toBeNull();
    expect(act("a", "ArrowUp")).toBeNull();
    expect(act("d", "Home")).toEqual({ type: "focus", id: "a" });
    expect(act("a", "End")).toEqual({ type: "focus", id: "e" });
    expect(act(null, "ArrowDown")).toEqual({ type: "focus", id: "a" });
  });

  it("右: 閉じていれば開き、開いていれば最初の子へ。子がなければ何もしない", () => {
    expect(act("b", "ArrowRight")).toEqual({ type: "expand", id: "b" });
    expect(act("a", "ArrowRight")).toEqual({ type: "focus", id: "b" });
    expect(act("d", "ArrowRight")).toBeNull();
  });

  it("左: 開いていれば閉じ、閉じていれば親へ。ルートでは何もしない", () => {
    expect(act("a", "ArrowLeft")).toEqual({ type: "collapse", id: "a" });
    expect(act("d", "ArrowLeft")).toEqual({ type: "focus", id: "a" });
    expect(act("e", "ArrowLeft")).toBeNull();
  });

  it("Enter / Space で選択し、関係ないキーは null", () => {
    expect(act("d", "Enter")).toEqual({ type: "select", id: "d" });
    expect(act("d", " ")).toEqual({ type: "select", id: "d" });
    expect(act("d", "a")).toBeNull();
    expect(keyboardAction([], new Map(), index, null, "ArrowDown")).toBeNull();
  });
});

describe("splitLabel", () => {
  it.each([
    ["div#main.card", "div", "#main.card"],
    ["section.hero", "section", ".hero"],
    ["p", "p", ""],
    ["", "", ""],
  ])("%s", (label, tag, rest) => {
    expect(splitLabel(label)).toEqual({ tag, rest });
  });
});

describe("モックデータ", () => {
  it("ID が重複しない", () => {
    for (const nodes of [mockLayerNodes, createLargeLayerNodes(1000)]) {
      const all: string[] = [];
      const walk = (list: LayerNode[]) =>
        list.forEach((node) => {
          all.push(node.id);
          walk(node.children);
        });
      walk(nodes);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("createLargeLayerNodes はおおよそ指定した数の要素を作る", () => {
    const size = buildTreeIndex(createLargeLayerNodes(1000)).nodeById.size;
    expect(size).toBeGreaterThan(990);
    expect(size).toBeLessThanOrEqual(1000);
  });
});
