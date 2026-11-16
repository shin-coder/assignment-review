// プレビュー用ファイルの組み立て（純粋関数）。
// HTML は「解析 → data-review-id を挿入 → 操作スクリプトのタグを挿入」、それ以外はそのまま使う
import { analyzeHtml, injectReviewIds, injectScriptTag, type HtmlAnalysis } from "../parser";
import {
  REVIEW_ID_ATTR,
  injectScriptUrl,
  type ElementId,
  type ElementSourceMap,
  type LayerNode,
  type TextChange,
  type VirtualFile,
} from "../shared";

/** 1 つの HTML ファイルの解析結果とプレビュー用 HTML */
export interface PageInfo {
  path: string;
  /** 解析に使ったソース（編集後のテキスト） */
  source: string;
  analysis: HtmlAnalysis;
  /** data-review-id と操作スクリプトを挿入した HTML */
  previewHtml: string;
  /** 要素 ID → 表示名 */
  labels: Map<ElementId, string>;
}

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

function collectLabels(nodes: readonly LayerNode[], into: Map<ElementId, string>): void {
  for (const node of nodes) {
    into.set(node.id, node.label);
    collectLabels(node.children, into);
  }
}

/** HTML ファイルを解析し、プレビュー用 HTML を作る */
export function analyzePage(path: string, source: string, isDev: boolean): PageInfo {
  const analysis = analyzeHtml(path, source);
  const previewHtml = injectScriptTag(
    injectReviewIds(source, analysis.map),
    injectScriptUrl(isDev),
  );
  const labels = new Map<ElementId, string>();
  collectLabels(analysis.tree, labels);
  return { path, source, analysis, previewHtml, labels };
}

/** プレビュー用の VirtualFile。HTML は変換後、それ以外は元のまま */
export function toPreviewFile(
  file: VirtualFile,
  pages: ReadonlyMap<string, PageInfo>,
): VirtualFile {
  const page = pages.get(file.path);
  return page ? { ...file, content: page.previewHtml } : file;
}

/** 編集後のファイル群と解析結果から、Service Worker に渡すファイル群を作る */
export function buildPreviewFiles(
  files: readonly VirtualFile[],
  pages: ReadonlyMap<string, PageInfo>,
): VirtualFile[] {
  return files.map((file) => toPreviewFile(file, pages));
}

/** 開始タグのタグ名の直後（injectReviewIds の挿入位置と同じ規則） */
function tagNameEnd(source: string, tagStart: number): number {
  let offset = tagStart + 2;
  while (offset < source.length && !/[\t\n\f\r />]/.test(source[offset]!)) offset++;
  return offset;
}

/**
 * 要素 1 つ分の「プレビュー用の外側の HTML」（data-review-id 付き）を取り出す。
 * injectReviewIds が挿入した文字数だけ位置をずらして、挿入後の HTML から切り出すのと同じ結果にする。
 * 開始タグのない（暗黙の）要素は null
 */
export function previewOuterHtml(
  source: string,
  map: ElementSourceMap,
  id: ElementId,
): string | null {
  const target = map.get(id);
  if (!target?.location || !target.startTag) return null;
  const insertions: { offset: number; text: string }[] = [];
  for (const info of map.values()) {
    if (!info.startTag) continue;
    insertions.push({
      offset: tagNameEnd(source, info.startTag.start),
      text: ` ${REVIEW_ID_ATTR}="${info.id.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`,
    });
  }
  const { start, end } = target.location;
  let result = "";
  let cursor = start;
  for (const { offset, text } of insertions
    .filter((i) => i.offset > start && i.offset < end)
    .sort((a, b) => a.offset - b.offset)) {
    result += source.slice(cursor, offset) + text;
    cursor = offset;
  }
  return result + source.slice(cursor, end);
}

/** 2 つの解析結果で、要素の数・タグ名・親子関係が同じか（同じなら ID が同じ要素を指す） */
export function hasSameStructure(a: ElementSourceMap, b: ElementSourceMap): boolean {
  if (a.size !== b.size) return false;
  for (const [id, infoA] of a) {
    const infoB = b.get(id);
    if (!infoB || infoA.tagName !== infoB.tagName || infoA.parentId !== infoB.parentId) {
      return false;
    }
  }
  return true;
}

export interface ElementReplacePlan {
  elementId: ElementId;
  html: string;
}

/**
 * HTML の編集を iframe に即時反映（review:replace-element）できるか判断する。
 * できるときは、置き換える要素の ID とプレビュー用 HTML を返す。
 * null のときは iframe を作り直す。作り直す場合:
 * - 構造（要素の数・タグ・親子）が変わった（ID がずれる）
 * - 変更を含む要素がない（要素の外のテキストなど）、暗黙の要素
 * - script 要素の中身を編集した、または置き換える範囲に script を含む（差し替えでは実行されない）
 *
 * change は編集前のソース上の位置。
 */
export function planElementReplace(
  before: PageInfo,
  after: PageInfo,
  change: TextChange,
): ElementReplacePlan | null {
  if (!hasSameStructure(before.analysis.map, after.analysis.map)) return null;
  let innermost: { id: ElementId; start: number; end: number } | null = null;
  for (const info of before.analysis.map.values()) {
    const loc = info.location;
    if (!loc) continue;
    const inside =
      loc.start < change.start &&
      (change.end < loc.end || (change.end === loc.end && change.start < change.end));
    if (!inside) continue;
    // 文書順に並ぶので、あとに出てくる（より内側の）ものを優先する
    if (!innermost || loc.start >= innermost.start) {
      innermost = { id: info.id, start: loc.start, end: loc.end };
    }
  }
  if (!innermost) return null;
  const tag = after.analysis.map.get(innermost.id)?.tagName;
  if (tag === "script") return null;
  const html = previewOuterHtml(after.source, after.analysis.map, innermost.id);
  if (html === null || /<script[\s>/]/i.test(html)) return null;
  return { elementId: innermost.id, html };
}
