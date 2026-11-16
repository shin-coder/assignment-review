import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";

/** エディタで扱う言語。対応する言語がないテキスト（JSON・SVG・TXT など）は "plain" */
export type EditorLanguage = "html" | "css" | "javascript" | "plain";

const LANGUAGE_BY_EXTENSION: Record<string, EditorLanguage> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
};

/** 小文字の拡張子（ドットなし）。拡張子がなければ空文字 */
function getExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** パスの拡張子から言語を決める */
export function getEditorLanguage(path: string): EditorLanguage {
  return LANGUAGE_BY_EXTENSION[getExtension(path)] ?? "plain";
}

/**
 * 「適用」操作で確定するまで onChange を呼ばないファイルか。
 * JS の編集は iframe の作り直しになるため、入力のたびには反映しない
 */
export function requiresApply(path: string): boolean {
  return getEditorLanguage(path) === "javascript";
}

/** 言語に対応する CodeMirror の拡張 */
export function languageExtension(language: EditorLanguage): Extension {
  switch (language) {
    case "html":
      return html();
    case "css":
      return css();
    case "javascript":
      return javascript();
    case "plain":
      return [];
  }
}
