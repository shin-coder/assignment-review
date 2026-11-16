import type { ElementId } from "../shared";
import { findElementById } from "./dom";

// review:replace-element の処理。HTML の編集をすぐ見せるために iframe の DOM を差し替える。
// 編集後のソースへの反映は親アプリの責務で、ここでは見た目を変えるだけ。
// innerHTML / <template> で作った <script> は実行されない（JS の変更は iframe の作り直しで反映する）

/** html / head / body は <template> では作れないため、属性と中身を入れ替える */
function replaceRootLike(doc: Document, target: Element, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const source =
    target === doc.documentElement
      ? parsed.documentElement
      : target === doc.head
        ? parsed.head
        : parsed.body;

  for (const attr of Array.from(target.attributes)) target.removeAttribute(attr.name);
  for (const attr of Array.from(source.attributes)) target.setAttribute(attr.name, attr.value);
  target.innerHTML = source.innerHTML;
}

/**
 * data-review-id が elementId の要素を html に差し替える。
 * html は 0 個以上の要素・テキストでよい（空なら要素を消す）。要素が見つからなければ false
 */
export function replaceElement(doc: Document, elementId: ElementId, html: string): boolean {
  const target = findElementById(doc, elementId);
  if (!target) return false;

  if (target === doc.documentElement || target === doc.head || target === doc.body) {
    replaceRootLike(doc, target, html);
    return true;
  }

  // <template> の中なら <tr> や <li> なども文脈なしで正しく解析される
  const template = doc.createElement("template");
  template.innerHTML = html;
  target.replaceWith(template.content);
  return true;
}
