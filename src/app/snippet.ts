// 開発モードの「この要素」: 選んだ要素のソースだけを切り出して編集し、ファイル全体へ戻す。
// 切り出しは元のテキストそのまま（字下げも変えない）なので、戻すときに余計な差分が出ない

import type { SourceLocation } from "../shared";

/** ファイル内の切り出し範囲。end は含まない */
export interface SnippetRange {
  start: number;
  end: number;
}

/**
 * 要素の範囲から切り出す範囲を決める。開始タグの前が行頭からの空白だけなら、行頭から切り出す
 * （1 行目も他の行と同じ字下げで見えるようにする）
 */
export function snippetRange(
  text: string,
  location: Pick<SourceLocation, "start" | "end">,
): SnippetRange {
  const start = Math.max(0, Math.min(location.start, text.length));
  const end = Math.max(start, Math.min(location.end, text.length));
  let lineStart = start;
  while (lineStart > 0 && (text[lineStart - 1] === " " || text[lineStart - 1] === "\t")) {
    lineStart--;
  }
  const atLineStart = lineStart === 0 || text[lineStart - 1] === "\n";
  return { start: atLineStart ? lineStart : start, end };
}

/** 切り出した部分を code に置き換えたファイル全体と、置き換え後の範囲を返す */
export function applySnippet(
  text: string,
  range: SnippetRange,
  code: string,
): { text: string; range: SnippetRange } {
  return {
    text: text.slice(0, range.start) + code + text.slice(range.end),
    range: { start: range.start, end: range.start + code.length },
  };
}

/** offset が何行目か（1 始まり） */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
