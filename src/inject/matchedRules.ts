import type { MatchedCssRule } from "../shared";

// 選んだ要素に当たっている CSS ルールを集める（素の CSSOM だけを使う）。
// 開発モードで「この要素」の CSS を出すために、ルールのファイル・セレクタ・何番目かを親へ渡す

/** 擬似要素（::before など）。要素そのものに当たるかを調べるときは取り除く */
const PSEUDO_ELEMENT =
  /::?(?:before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button)\b(?:\([^)]*\))?/gi;

/** セレクタリストを、括弧・角括弧・引用符の外のカンマで分ける */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of selector) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

/** セレクタリストのどれかが element に当たるか（擬似要素のルールは、その元の要素に当たるとみなす） */
export function selectorMatches(element: Element, selector: string): boolean {
  for (const part of splitSelectorList(selector)) {
    let base = part.replace(PSEUDO_ELEMENT, "").trim();
    if (base === "" || /[>+~]$/.test(base)) base = `${base}*`;
    try {
      if (element.matches(base)) return true;
    } catch {
      // ブラウザが解釈できないセレクタは当たらないものとする
    }
  }
  return false;
}

interface RuleLike {
  type?: number;
  selectorText?: string;
  cssText?: string;
  cssRules?: ArrayLike<RuleLike>;
  conditionText?: string;
  media?: { mediaText?: string };
}

const STYLE_RULE = 1;
const MEDIA_RULE = 4;
const SUPPORTS_RULE = 12;

/**
 * element に当たるルールを、スタイルシートの順（ソースの順）に集める。
 * pathOf がファイルのパスを返さないスタイルシート（HTML の中の <style> など）は対象外
 */
export function collectMatchedRules(
  doc: Document,
  element: Element,
  pathOf: (sheet: CSSStyleSheet) => string | null,
): MatchedCssRule[] {
  const result: MatchedCssRule[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    const path = pathOf(sheet);
    if (path === null) continue;
    let rules: ArrayLike<RuleLike>;
    try {
      rules = sheet.cssRules as unknown as ArrayLike<RuleLike>;
    } catch {
      continue;
    }
    /** セレクタ → これまでに出てきた数（ソースの中で何番目のルールかを親が探すのに使う） */
    const seen = new Map<string, number>();
    const walk = (list: ArrayLike<RuleLike>, media: string | null) => {
      for (const rule of Array.from(list)) {
        if (rule.type === STYLE_RULE && typeof rule.selectorText === "string") {
          const selector = rule.selectorText;
          const occurrence = seen.get(selector) ?? 0;
          seen.set(selector, occurrence + 1);
          if (selectorMatches(element, selector)) {
            result.push({ path, selector, media, occurrence, cssText: rule.cssText ?? "" });
          }
        } else if ((rule.type === MEDIA_RULE || rule.type === SUPPORTS_RULE) && rule.cssRules) {
          const condition =
            rule.type === MEDIA_RULE
              ? `@media ${rule.media?.mediaText ?? rule.conditionText ?? ""}`
              : `@supports ${rule.conditionText ?? ""}`;
          walk(rule.cssRules, media ? `${media} ${condition}` : condition);
        }
      }
    };
    walk(rules, null);
  }
  return result;
}
