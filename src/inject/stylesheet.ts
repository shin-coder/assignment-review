import { normalizePath, PREVIEW_PREFIX, REVIEW_ID_ATTR } from "../shared";

// review:replace-css の処理。
// 指定パスの <link rel="stylesheet"> を、新しい CSS テキストを入れた <style> に差し替える。
// 2 回目以降は差し替えた <style> の中身だけを書き換える。

/**
 * URL を仮想ファイルのパス（normalizePath 済み）に直す。
 * ドキュメントが /__preview__/<セッション>/ の下にあればその直下をルートとし、
 * そうでなければオリジンの "/" をルートとする。ルートの外や別オリジンなら null
 */
export function vfsPathFromUrl(url: string, documentUrl: string): string | null {
  let target: URL;
  let base: URL;
  try {
    base = new URL(documentUrl);
    target = new URL(url, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;

  let root = "/";
  if (base.pathname.startsWith(PREVIEW_PREFIX)) {
    const session = base.pathname.slice(PREVIEW_PREFIX.length).split("/")[0] ?? "";
    root = `${PREVIEW_PREFIX}${session}/`;
  }
  if (!target.pathname.startsWith(root)) return null;

  try {
    const decoded = target.pathname
      .slice(root.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    const path = normalizePath(decoded);
    return path === "" ? null : path;
  } catch {
    return null;
  }
}

const URL_FUNCTION = /url\(\s*(["']?)([^"')]*?)\1\s*\)/gi;
const IMPORT_STRING = /@import\s+(["'])([^"']*)\1/gi;

function resolveCssUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  // 空・同じ文書内の参照（SVG の url(#id) など）・data: URL はそのまま残す
  if (trimmed === "" || trimmed.startsWith("#") || /^data:/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * CSS の中の相対 URL（url(...) と @import "..."）を baseUrl 基準の絶対 URL に書き換える。
 * <link> の CSS を <style> に移すと相対 URL の基準が CSS ファイルから HTML に変わるため、
 * 画像などが読めなくならないようにする
 */
export function rewriteCssUrls(text: string, baseUrl: string): string {
  return text
    .replace(URL_FUNCTION, (match, _quote: string, value: string) => {
      const resolved = resolveCssUrl(value, baseUrl);
      return resolved === null ? match : `url("${resolved}")`;
    })
    .replace(IMPORT_STRING, (match, _quote: string, value: string) => {
      const resolved = resolveCssUrl(value, baseUrl);
      return resolved === null ? match : `@import "${resolved}"`;
    });
}

function isStylesheetLink(link: Element): boolean {
  const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
  return rel.includes("stylesheet");
}

interface ReplacedStyle {
  style: HTMLStyleElement;
  /** 元の CSS ファイルの URL。相対 URL を解決する基準 */
  baseUrl: string;
}

export interface StylesheetReplacer {
  /** path の CSS を text に差し替え、差し替えた <style> の数を返す（見つからなければ 0） */
  replace(path: string, text: string): number;
  /** 差し替えた <style> の元の CSS ファイルのパス。差し替えたものでなければ null */
  pathOf(style: Element): string | null;
}

export function createStylesheetReplacer(doc: Document): StylesheetReplacer {
  /** 正規化済みパス → 差し替えた <style> */
  const replaced = new Map<string, ReplacedStyle[]>();

  function replaceLinks(path: string): ReplacedStyle[] {
    const documentUrl = doc.URL;
    const result: ReplacedStyle[] = [];
    for (const link of doc.querySelectorAll("link[href]")) {
      if (!isStylesheetLink(link)) continue;
      const href = link.getAttribute("href") ?? "";
      let absolute: string;
      try {
        absolute = new URL(href, doc.baseURI).href;
      } catch {
        continue;
      }
      if (vfsPathFromUrl(absolute, documentUrl) !== path) continue;

      const style = doc.createElement("style");
      // media は見た目に関わるので引き継ぐ。data-review-id も引き継ぎ、JS 生成要素と区別できるようにする
      for (const name of ["media", REVIEW_ID_ATTR]) {
        const value = link.getAttribute(name);
        if (value !== null) style.setAttribute(name, value);
      }
      link.replaceWith(style);
      result.push({ style, baseUrl: absolute });
    }
    return result;
  }

  return {
    replace(path, text) {
      let key: string;
      try {
        key = normalizePath(path);
      } catch {
        return 0;
      }
      // 要素の差し替え（<head> など）で消えた <style> は捨て、復活した <link> をもう一度探す
      const targets = (replaced.get(key) ?? []).filter((entry) => entry.style.isConnected);
      targets.push(...replaceLinks(key));
      for (const { style, baseUrl } of targets) {
        style.textContent = rewriteCssUrls(text, baseUrl);
      }
      replaced.set(key, targets);
      return targets.length;
    },
    pathOf(style) {
      for (const [path, entries] of replaced) {
        if (entries.some((entry) => entry.style === style)) return path;
      }
      return null;
    },
  };
}
