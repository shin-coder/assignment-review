import type { LayerNode } from "../../shared";

// 開発・テスト用のモックデータ。解析層（src/parser）とはつながず、この形の LayerNode[] を渡す

const node = (id: string, label: string, children: LayerNode[] = []): LayerNode => ({
  id,
  label,
  children,
});

/** 生徒サイトによくある 1 ページ分のツリー */
export const mockLayerNodes: LayerNode[] = [
  node("e1", "html", [
    node("e2", "head", [node("e3", "meta"), node("e4", "title"), node("e5", "link")]),
    node("e6", "body", [
      node("e7", "header.site-header", [
        node("e8", "h1.logo"),
        node("e9", "nav.global-nav", [
          node("e10", "ul", [
            node("e11", "li", [node("e12", "a")]),
            node("e13", "li", [node("e14", "a")]),
            node("e15", "li", [node("e16", "a")]),
          ]),
        ]),
      ]),
      node("e17", "main#main", [
        node("e18", "section.hero", [
          node("e19", "h2.hero__title"),
          node("e20", "p.hero__text"),
          node("e21", "a.button.button--primary"),
        ]),
        node("e22", "section.works", [
          node("e23", "h2"),
          node("e24", "ul.card-list", [
            node("e25", "li.card", [node("e26", "img"), node("e27", "h3"), node("e28", "p")]),
            node("e29", "li.card", [node("e30", "img"), node("e31", "h3"), node("e32", "p")]),
          ]),
        ]),
      ]),
      node("e33", "footer", [node("e34", "p.copyright")]),
      node("e35", "script"),
    ]),
  ]),
];

/**
 * 大きなページを模したツリー。html > body > section × n > (h2, p, ul > li × k) の形で、
 * 要素数がおおよそ count になるように作る
 */
export function createLargeLayerNodes(count: number): LayerNode[] {
  let nextId = 0;
  const id = () => `n${(nextId += 1)}`;
  const html = node(id(), "html");
  const body = node(id(), "body");
  html.children.push(node(id(), "head", [node(id(), "title")]), body);
  // 1 セクションあたり section, h2, p, ul と li × 6 の 10 要素
  const itemsPerList = 6;
  while (nextId + 4 + itemsPerList <= count) {
    const items = Array.from({ length: itemsPerList }, () => node(id(), "li.item"));
    body.children.push(
      node(id(), "section.block", [node(id(), "h2"), node(id(), "p"), node(id(), "ul", items)]),
    );
  }
  return [html];
}
