import { REVIEW_ID_ATTR, type ElementId } from "../shared";

// iframe 内の DOM を辿る小さな関数群。素の DOM API だけで書く

const ELEMENT_NODE = 1;

/** マウスが乗った・クリックされた要素と、親アプリへ伝える ID */
export interface ReviewTarget {
  /** 実際にマウスが乗った・クリックされた要素 */
  element: Element;
  /** element 自身か、最も近い祖先の data-review-id を持つ要素。どこにもなければ null */
  idElement: Element | null;
  /** idElement の data-review-id。どこにもなければ null */
  elementId: ElementId | null;
  /** element 自身に data-review-id がない（JS が後から生成した要素）とき true */
  generated: boolean;
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    (value as Node).nodeType === ELEMENT_NODE
  );
}

/**
 * イベントの target を要素に揃える。テキストノードなら親要素を返す。
 * 要素にたどり着けなければ null
 */
export function toElement(target: EventTarget | null): Element | null {
  if (isElement(target)) return target;
  if (typeof target === "object" && target !== null && "parentElement" in target) {
    const parent = (target as Node).parentElement;
    return parent ?? null;
  }
  return null;
}

/**
 * 開始タグがソースになくてもブラウザ（と parse5）が補って作る要素。
 * 解析層はこれらに data-review-id を付けないため、ID がなくても JS 生成要素とはみなさない
 */
const IMPLICIT_TAGS = new Set(["html", "head", "body", "tbody"]);

/** 要素から、親アプリへ伝える ID を求める */
export function findReviewTarget(element: Element): ReviewTarget {
  const idElement = element.closest(`[${REVIEW_ID_ATTR}]`);
  const hasId = element.hasAttribute(REVIEW_ID_ATTR);
  return {
    element,
    idElement,
    elementId: idElement?.getAttribute(REVIEW_ID_ATTR) ?? null,
    generated: !hasId && !IMPLICIT_TAGS.has(element.tagName.toLowerCase()),
  };
}

/**
 * data-review-id が id の最初の要素を探す。
 * `<p><b>x<p>y</b>` のように書式要素がブラウザに複製されると、属性ごと写されて同じ ID が
 * 複数の要素に付くことがある。その場合は文書順で最初の要素（ソースの開始タグに当たるもの）を返す。
 * ID に CSS で特別な意味を持つ文字が入っても困らないよう、セレクタに埋め込まずに比較する
 */
export function findElementById(doc: Document, id: ElementId): Element | null {
  for (const element of doc.querySelectorAll(`[${REVIEW_ID_ATTR}]`)) {
    if (element.getAttribute(REVIEW_ID_ATTR) === id) return element;
  }
  return null;
}

const MAX_LABEL_CLASSES = 2;

/** ハイライトのラベルに出す "div#main.card" のような表示名 */
export function describeElement(element: Element): string {
  let label = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id) label += `#${id}`;
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  for (const name of classes.slice(0, MAX_LABEL_CLASSES)) label += `.${name}`;
  if (classes.length > MAX_LABEL_CLASSES) label += "…";
  return label;
}
