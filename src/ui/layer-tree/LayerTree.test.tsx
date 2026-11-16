import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementId } from "../../shared";
import { LayerTree, type LayerTreeProps } from "./LayerTree";
import { createLargeLayerNodes, mockLayerNodes } from "./mockNodes";

// mockLayerNodes の主な ID
// e1 html > e2 head, e6 body
// e6 body > e7 header > e9 nav > e10 ul > e11 li > e12 a
//         > e17 main, e33 footer, e35 script

const row = (id: ElementId) => screen.getByTestId(`layer-node-${id}`);
const queryRow = (id: ElementId) => screen.queryByTestId(`layer-node-${id}`);
const visibleIds = () =>
  screen.getAllByRole("treeitem").map((item) => item.getAttribute("data-layer-id"));

let scrollIntoView: ReturnType<typeof vi.fn<Element["scrollIntoView"]>>;

beforeEach(() => {
  // jsdom にはレイアウトがなく scrollIntoView もない
  scrollIntoView = vi.fn<Element["scrollIntoView"]>();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  // vitest の globals を使っていないため、Testing Library の自動クリーンアップが働かない
  cleanup();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function setup(overrides: Partial<LayerTreeProps> = {}) {
  const props: LayerTreeProps = {
    nodes: mockLayerNodes,
    selectedId: null,
    hoveredId: null,
    commentedIds: new Set(),
    onSelect: vi.fn(),
    onHover: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  const result = render(<LayerTree {...props} />);
  const rerender = (next: Partial<LayerTreeProps>) => {
    Object.assign(props, next);
    result.rerender(<LayerTree {...props} />);
  };
  return { props, user, rerender };
}

describe("初期表示と開閉", () => {
  it("浅い階層（html と head / body）だけを開く", () => {
    setup();
    expect(visibleIds()).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e17", "e33", "e35"]);
    expect(row("e1")).toHaveAttribute("aria-expanded", "true");
    expect(row("e7")).toHaveAttribute("aria-expanded", "false");
    expect(queryRow("e8")).toBeNull();
  });

  it("defaultExpandDepth で初期の開く深さを変えられる", () => {
    setup({ defaultExpandDepth: 1 });
    expect(visibleIds()).toEqual(["e1", "e2", "e6"]);
  });

  it("開閉ボタンのクリックで子を出し入れし、選択はしない", async () => {
    const { user, props } = setup();
    const toggle = row("e7").querySelector("[data-layer-toggle]")!;

    await user.click(toggle);
    expect(row("e7")).toHaveAttribute("aria-expanded", "true");
    expect(row("e8")).toBeInTheDocument();
    expect(row("e9")).toBeInTheDocument();

    await user.click(toggle);
    expect(row("e7")).toHaveAttribute("aria-expanded", "false");
    expect(queryRow("e8")).toBeNull();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("nodes を作り直しても、同じ ID のノードの開閉は保つ", async () => {
    const { user, rerender } = setup();
    await user.click(row("e7").querySelector("[data-layer-toggle]")!);
    await user.click(row("e2").querySelector("[data-layer-toggle]")!);

    rerender({ nodes: structuredClone(mockLayerNodes) });
    expect(row("e7")).toHaveAttribute("aria-expanded", "true");
    expect(row("e2")).toHaveAttribute("aria-expanded", "false");
  });

  it("nodes が空ならメッセージを出す", () => {
    setup({ nodes: [] });
    expect(screen.queryByRole("tree")).toBeNull();
    expect(screen.getByText("表示できる要素がありません")).toBeInTheDocument();
  });
});

describe("選択", () => {
  it("ノードのクリックで onSelect がその ID で呼ばれる", async () => {
    const { user, props } = setup();
    await user.click(within(row("e17")).getByText("main"));
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onSelect).toHaveBeenCalledWith("e17");

    await user.click(row("e35"));
    expect(props.onSelect).toHaveBeenLastCalledWith("e35");
  });

  it("selectedId を深い階層に変えると、祖先が開いて選択状態になり、スクロールする", () => {
    const { rerender } = setup();
    expect(queryRow("e12")).toBeNull();

    rerender({ selectedId: "e12" });
    for (const id of ["e7", "e9", "e10", "e11"]) {
      expect(row(id)).toHaveAttribute("aria-expanded", "true");
    }
    expect(row("e12")).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row("e12"));
    // キーボードの起点も選択したノードに移る
    expect(row("e12")).toHaveAttribute("tabindex", "0");
  });

  it("初回から selectedId があれば祖先を開く", () => {
    setup({ selectedId: "e26" });
    expect(row("e26")).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row("e26"));
  });

  it("ツリーにない selectedId でも壊れない", () => {
    const { rerender } = setup();
    rerender({ selectedId: "unknown" });
    expect(screen.getAllByRole("treeitem").every((item) => item.ariaSelected === "false")).toBe(
      true,
    );
  });
});

describe("ホバー", () => {
  it("ノードに乗ると onHover(id)、ツリーから出ると onHover(null)", async () => {
    const onHover = vi.fn();
    const { user, rerender } = setup({ onHover });
    await user.hover(row("e17"));
    expect(onHover).toHaveBeenLastCalledWith("e17");

    rerender({ hoveredId: "e17" });
    await user.unhover(screen.getByRole("tree"));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("同じノードの中で動いても onHover を繰り返さない", async () => {
    const onHover = vi.fn();
    const { user } = setup({ onHover, hoveredId: "e17" });
    await user.hover(within(row("e17")).getByText("main"));
    expect(onHover).not.toHaveBeenCalled();
  });

  it("hoveredId のノードにホバーの目印が付く", () => {
    setup({ hoveredId: "e6" });
    expect(row("e6")).toHaveAttribute("data-hovered", "true");
    expect(row("e1")).not.toHaveAttribute("data-hovered");
  });
});

describe("コメントの目印", () => {
  it("commentedIds に含まれるノードにだけ目印が付く", () => {
    setup({ commentedIds: new Set(["e17", "e33"]) });
    expect(row("e17")).toHaveAttribute("data-commented", "true");
    expect(within(row("e17")).getByTitle("コメントあり")).toBeInTheDocument();
    expect(row("e17")).toHaveAccessibleName("main#main（コメントあり）");
    expect(row("e33")).toHaveAttribute("data-commented", "true");
    expect(row("e7")).not.toHaveAttribute("data-commented");
    expect(within(row("e7")).queryByTitle("コメントあり")).toBeNull();
  });
});

describe("キーボード操作", () => {
  it("上下で移動、右で開いて子へ、左で閉じて親へ、Enter で選択", async () => {
    const { user, props } = setup();
    await user.click(row("e6")); // body にフォーカス
    expect(row("e6")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(row("e7")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(row("e6")).toHaveFocus();
    await user.keyboard("{ArrowDown}");

    // header で右: 開く → もう一度右: 最初の子 h1 へ
    await user.keyboard("{ArrowRight}");
    expect(row("e7")).toHaveAttribute("aria-expanded", "true");
    expect(row("e7")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(row("e8")).toHaveFocus();

    // h1 で左: 親の header へ → もう一度左: 閉じる
    await user.keyboard("{ArrowLeft}");
    expect(row("e7")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(row("e7")).toHaveAttribute("aria-expanded", "false");
    expect(queryRow("e8")).toBeNull();

    await user.keyboard("{Enter}");
    expect(props.onSelect).toHaveBeenLastCalledWith("e7");
    await user.keyboard("{End}");
    expect(row("e35")).toHaveFocus();
    await user.keyboard(" ");
    expect(props.onSelect).toHaveBeenLastCalledWith("e35");
    await user.keyboard("{Home}");
    expect(row("e1")).toHaveFocus();
  });

  it("Tab でツリーに入ると先頭の行にフォーカスが当たる（tabindex=0 は 1 行だけ）", async () => {
    const { user } = setup();
    const focusable = screen.getAllByRole("treeitem").filter((item) => item.tabIndex === 0);
    expect(focusable).toEqual([row("e1")]);
    await user.tab();
    expect(row("e1")).toHaveFocus();
  });

  it("フォーカス中のノードの祖先を閉じたら、フォーカスは閉じたノードに移る", async () => {
    const { user } = setup({ selectedId: "e12" });
    await user.click(row("e12"));
    await user.click(row("e7").querySelector("[data-layer-toggle]")!);
    expect(row("e7")).toHaveAttribute("tabindex", "0");
    expect(row("e7")).toHaveFocus();
  });
});

describe("ARIA 属性", () => {
  it("tree / treeitem と aria-level・aria-expanded・aria-selected を付ける", () => {
    setup({ selectedId: "e17", ariaLabel: "要素の階層" });
    expect(screen.getByRole("tree", { name: "要素の階層" })).toBeInTheDocument();

    expect(row("e1")).toHaveAttribute("aria-level", "1");
    expect(row("e6")).toHaveAttribute("aria-level", "2");
    expect(row("e17")).toHaveAttribute("aria-level", "3");
    expect(row("e6")).toHaveAttribute("aria-posinset", "2");
    expect(row("e6")).toHaveAttribute("aria-setsize", "2");

    // 子のない要素には aria-expanded を付けない
    expect(row("e17")).toHaveAttribute("aria-expanded", "false");
    expect(row("e35")).not.toHaveAttribute("aria-expanded");

    const selected = screen.getAllByRole("treeitem", { selected: true });
    expect(selected).toEqual([row("e17")]);
    expect(row("e1")).toHaveAttribute("aria-selected", "false");
  });
});

describe("大きなページ", () => {
  const largeNodes = createLargeLayerNodes(1000);

  it("既定では開いている枝の行だけを描画する", () => {
    setup({ nodes: largeNodes });
    // html, head, title, body と body 直下の section だけ
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(120);
  });

  it("約 1000 行をすべて開いても描画と選択・ホバーの更新が重くならない", () => {
    // jsdom での目安。実際のブラウザではもっと速い。遅い CI でも落ちないよう緩めにしている
    let start = performance.now();
    const { rerender } = setup({ nodes: largeNodes, defaultExpandDepth: Infinity });
    const initialMs = performance.now() - start;
    expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(990);

    start = performance.now();
    for (let i = 0; i < 20; i += 1) {
      rerender({ hoveredId: `n${100 + i}`, selectedId: `n${200 + i}` });
    }
    const updateMs = (performance.now() - start) / 20;

    expect(initialMs).toBeLessThan(3000);
    expect(updateMs).toBeLessThan(200);
  });
});
