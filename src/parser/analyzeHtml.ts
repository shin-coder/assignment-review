import { parse, type DefaultTreeAdapterTypes } from "parse5";
import type {
  ElementId,
  ElementInfo,
  ElementSourceMap,
  LayerNode,
  SourceLocation,
} from "../shared";

type Parse5Node = DefaultTreeAdapterTypes.Node;
type Parse5Element = DefaultTreeAdapterTypes.Element;

/** analyzeHtml() の結果 */
export interface HtmlAnalysis {
  /** 要素 ID → 要素情報。文書順（深さ優先の行きがけ順）に並ぶ */
  map: ElementSourceMap;
  /** レイヤーツリーの根。通常は html 要素 1 つだけ */
  tree: LayerNode[];
}

/**
 * HTML を parse5 で解析し、「要素 ↔ ソース位置」の対応表とレイヤーツリーを作る。
 *
 * - ID は文書順の連番（"0", "1", ...）。同じソースなら同じ ID になる
 * - parse5 はブラウザと同じ規則で不正な HTML を補正するため、ツリーは iframe 内の DOM と一致する
 * - 開始タグがソースにない要素（暗黙の html / head / body / tbody など）は location と startTag を null にする
 * - `<script>` `<style>` の中身はテキストとして扱われるため要素にならない
 * - `<template>` の中身は表示される DOM に入らないため対象外にする（template 要素自体は対象）
 */
export function analyzeHtml(filePath: string, source: string): HtmlAnalysis {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const map: ElementSourceMap = new Map();
  // 補正で複製された要素（書式要素の再構築など）は複製元と同じ開始タグの位置を持つ。
  // 1 つの開始タグには 1 つの要素だけを対応させるため、2 つ目以降は暗黙の要素として扱う
  const usedStartTags = new Set<number>();
  let nextId = 0;

  const visit = (element: Parse5Element, parentId: ElementId | null): LayerNode => {
    const id = String(nextId++);
    const positions = readPositions(filePath, element, usedStartTags);
    const info: ElementInfo = {
      id,
      tagName: element.tagName.toLowerCase(),
      filePath,
      location: positions?.location ?? null,
      startTag: positions?.startTag ?? null,
      parentId,
      childIds: [],
    };
    map.set(id, info);

    const children = childElements(element).map((child) => visit(child, id));
    info.childIds = children.map((child) => child.id);
    if (info.location) {
      // 子の終了位置が親を越えることはないはずだが、念のため親の範囲を子を含むまで広げる
      for (const childId of info.childIds) {
        const childLocation = map.get(childId)?.location;
        if (childLocation && childLocation.end > info.location.end) {
          info.location.end = childLocation.end;
        }
      }
    }
    return { id, label: buildLabel(element), children };
  };

  const tree = childElements(document).map((element) => visit(element, null));
  return { map, tree };
}

/**
 * 要素全体と開始タグの位置を読む。開始タグがソースにない要素は null。
 *
 * 閉じタグがない要素の終了位置は parse5 の記録どおり「その要素を暗黙に閉じたトークンの開始位置」
 * （次の兄弟の開始タグ・親の閉じタグ・ファイル末尾）とする。DOM 上でその要素に入る
 * 末尾の空白や改行も範囲に含まれる。
 */
function readPositions(
  filePath: string,
  element: Parse5Element,
  usedStartTags: Set<number>,
): { location: SourceLocation; startTag: SourceLocation } | null {
  const loc = element.sourceCodeLocation;
  const tag = loc?.startTag;
  if (!loc || !tag || usedStartTags.has(tag.startOffset)) return null;
  usedStartTags.add(tag.startOffset);
  return {
    location: {
      filePath,
      start: loc.startOffset,
      end: Math.max(loc.endOffset, tag.endOffset),
    },
    startTag: { filePath, start: tag.startOffset, end: tag.endOffset },
  };
}

function childElements(node: Parse5Node): Parse5Element[] {
  if (!("childNodes" in node)) return [];
  return node.childNodes.filter((child): child is Parse5Element => "tagName" in child);
}

/** "div#main.card.is-active" のような表示名を作る */
export function buildLabel(element: Pick<Parse5Element, "tagName" | "attrs">): string {
  const attr = (name: string) => element.attrs.find((a) => a.name === name && !a.namespace)?.value;
  const id = attr("id")?.trim();
  const classes = (attr("class") ?? "").split(/[\t\n\f\r ]+/).filter((name) => name !== "");
  return (
    element.tagName.toLowerCase() +
    (id ? `#${id}` : "") +
    classes.map((name) => `.${name}`).join("")
  );
}
