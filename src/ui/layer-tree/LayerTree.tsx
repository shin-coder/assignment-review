import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ElementId, LayerNode } from "../../shared";
import "./LayerTree.css";
import {
  EMPTY_EXPAND_STATE,
  buildTreeIndex,
  flattenVisible,
  keyboardAction,
  resolveFocusId,
  setNodeExpanded,
  splitLabel,
  syncExpandState,
  type ExpandState,
} from "./treeModel";

export interface LayerTreeProps {
  /** 表示するツリー。解析し直したら新しい配列を渡す（同じ ID のノードは開閉状態を保つ） */
  nodes: readonly LayerNode[];
  /** 選択中のノード。外から変わったら祖先を開き、見える位置までスクロールする */
  selectedId: ElementId | null;
  /** ホバー中のノード（iframe 側のホバーも含む）。閉じた枝の中にあるときは開かない */
  hoveredId: ElementId | null;
  /** コメントが付いているノード。目印を表示する */
  commentedIds: ReadonlySet<ElementId>;
  /** ノードのクリック、または Enter / Space で呼ばれる。選択状態は親が selectedId で返す */
  onSelect: (id: ElementId) => void;
  /** ツリー上でホバーしたノードが変わったときに呼ばれる。ツリーから出たら null */
  onHover: (id: ElementId | null) => void;
  /**
   * 初期状態で開いておく深さ。ルートを 0 として、深さがこれ未満のノードを開く。
   * 既定の 2 では html と head / body が開き、body の子までが見える。
   * 新しく現れたノードにだけ当てるので、途中で変えても既存ノードの開閉は変わらない
   */
  defaultExpandDepth?: number;
  /** ツリーの読み上げ名 */
  ariaLabel?: string;
}

/** 生徒サイトの DOM 階層を表示するツリー。開いている枝の行だけを描画する */
export function LayerTree({
  nodes,
  selectedId,
  hoveredId,
  commentedIds,
  onSelect,
  onHover,
  defaultExpandDepth = 2,
  ariaLabel = "レイヤーツリー",
}: LayerTreeProps) {
  const containerRef = useRef<HTMLUListElement>(null);
  const index = useMemo(() => buildTreeIndex(nodes), [nodes]);

  // 開閉状態は props（nodes / selectedId）の変化に合わせて描画中に同期する。
  // effect で同期すると、祖先が閉じたままの描画が一度挟まりスクロールが遅れるため
  const [storedState, setState] = useState<ExpandState>(() =>
    syncExpandState(EMPTY_EXPAND_STATE, nodes, index, selectedId, defaultExpandDepth),
  );
  let state = storedState;
  const synced = syncExpandState(storedState, nodes, index, selectedId, defaultExpandDepth);
  if (synced !== storedState) {
    setState(synced);
    state = synced;
  }

  const rows = useMemo(() => flattenVisible(nodes, state.expanded), [nodes, state.expanded]);
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, position) => [row.node.id, position])),
    [rows],
  );
  const focusId = resolveFocusId(rows, rowIndexById, index, state.focusedId);

  // iframe でクリックしたときなど、選択が変わったら該当ノードが見える位置までスクロールする
  useEffect(() => {
    if (selectedId === null || !containerRef.current) return;
    findRowElement(containerRef.current, selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, nodes]);

  const moveFocus = (id: ElementId) => {
    setState((current) => (current.focusedId === id ? current : { ...current, focusedId: id }));
    if (containerRef.current) findRowElement(containerRef.current, id)?.focus();
  };

  const setExpanded = (id: ElementId, expand: boolean) => {
    setState((current) => setNodeExpanded(current, index, id, expand));
  };

  // 行ごとにハンドラを作らず、ツリー全体で受けて data-layer-id から行を特定する
  const handleClick = (event: MouseEvent<HTMLUListElement>) => {
    const row = closestRow(event.target);
    const id = row?.dataset.layerId;
    if (id === undefined) return;
    if (closestToggle(event.target)) {
      setExpanded(id, !state.expanded.has(id));
      moveFocus(id);
      return;
    }
    moveFocus(id);
    onSelect(id);
  };

  const handleMouseOver = (event: MouseEvent<HTMLUListElement>) => {
    const id = closestRow(event.target)?.dataset.layerId ?? null;
    if (id !== hoveredId) onHover(id);
  };

  const handleMouseLeave = () => {
    if (hoveredId !== null) onHover(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const action = keyboardAction(rows, rowIndexById, index, focusId, event.key);
    if (!action) return;
    event.preventDefault();
    switch (action.type) {
      case "focus":
        moveFocus(action.id);
        break;
      case "expand":
        setExpanded(action.id, true);
        break;
      case "collapse":
        setExpanded(action.id, false);
        break;
      case "select":
        onSelect(action.id);
        break;
    }
  };

  if (nodes.length === 0) {
    return <p className="layer-tree-empty">表示できる要素がありません</p>;
  }

  return (
    <ul
      ref={containerRef}
      role="tree"
      aria-label={ariaLabel}
      className="layer-tree"
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => (
        <LayerTreeRow
          key={row.node.id}
          id={row.node.id}
          label={row.node.label}
          level={row.level}
          posInSet={row.posInSet}
          setSize={row.setSize}
          hasChildren={row.hasChildren}
          expanded={row.expanded}
          selected={row.node.id === selectedId}
          hovered={row.node.id === hoveredId}
          commented={commentedIds.has(row.node.id)}
          focusable={row.node.id === focusId}
        />
      ))}
    </ul>
  );
}

interface LayerTreeRowProps {
  id: ElementId;
  label: string;
  level: number;
  posInSet: number;
  setSize: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  commented: boolean;
  focusable: boolean;
}

/** 1 行。props がすべてプリミティブなので、ホバーや選択が変わっても変化した行だけ描画し直す */
const LayerTreeRow = memo(function LayerTreeRow({
  id,
  label,
  level,
  posInSet,
  setSize,
  hasChildren,
  expanded,
  selected,
  hovered,
  commented,
  focusable,
}: LayerTreeRowProps) {
  const { tag, rest } = splitLabel(label);
  return (
    <li
      role="treeitem"
      className="layer-tree__row"
      data-testid={`layer-node-${id}`}
      data-layer-id={id}
      data-hovered={hovered ? "true" : undefined}
      data-commented={commented ? "true" : undefined}
      aria-level={level}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      style={{ paddingInlineStart: `${(level - 1) * 1.25 + 0.5}em` }}
    >
      <span
        className="layer-tree__toggle"
        data-layer-toggle={hasChildren ? "true" : undefined}
        aria-hidden="true"
      >
        {hasChildren ? (expanded ? "▾" : "▸") : ""}
      </span>
      <span className="layer-tree__label">
        <span className="layer-tree__tag">{tag}</span>
        {rest && <span className="layer-tree__attrs">{rest}</span>}
      </span>
      {commented && (
        <span className="layer-tree__comment-badge" title="コメントあり">
          <span className="layer-tree__visually-hidden">（コメントあり）</span>
        </span>
      )}
    </li>
  );
});

function closestRow(target: EventTarget): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-layer-id]") : null;
}

function closestToggle(target: EventTarget): boolean {
  return target instanceof Element && target.closest("[data-layer-toggle]") !== null;
}

/** ID は任意の文字列なのでセレクタに埋め込まず、data 属性を比べて探す */
function findRowElement(container: HTMLElement, id: ElementId): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>("[data-layer-id]")) {
    if (element.dataset.layerId === id) return element;
  }
  return null;
}
