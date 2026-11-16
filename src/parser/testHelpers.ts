// テスト用の補助関数（本体からは使わない）
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { REVIEW_ID_ATTR, type LayerNode } from "../shared";

type Parse5Element = DefaultTreeAdapterTypes.Element;

/** HTML を parse5 で解析し、要素を文書順（analyzeHtml と同じ順序）に並べる */
export function elementsInOrder(html: string): Parse5Element[] {
  const result: Parse5Element[] = [];
  const walk = (node: DefaultTreeAdapterTypes.Node) => {
    if (!("childNodes" in node)) return;
    for (const child of node.childNodes) {
      if (!("tagName" in child)) continue;
      result.push(child);
      walk(child);
    }
  };
  walk(parse(html));
  return result;
}

export function reviewIdOf(element: Parse5Element): string | undefined {
  return element.attrs.find((attr) => attr.name === REVIEW_ID_ATTR)?.value;
}

/**
 * ツリーを「ラベルをインデントで並べた行」にする。
 * isImplicit を渡すと、それが true の要素に「（暗黙）」を付ける（tests/fixtures/README.md の書式）
 */
export function outline(
  nodes: LayerNode[],
  isImplicit: (id: string) => boolean = () => false,
  depth = 0,
): string[] {
  return nodes.flatMap((node) => [
    "  ".repeat(depth) + node.label + (isImplicit(node.id) ? "（暗黙）" : ""),
    ...outline(node.children, isImplicit, depth + 1),
  ]);
}
