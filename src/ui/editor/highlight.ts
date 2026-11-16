import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { SourceLocation } from "../../shared";
import { HIGHLIGHT_CLASS } from "./constants";

/** エディタ内の範囲（ドキュメント先頭からのオフセット） */
export interface HighlightRange {
  from: number;
  to: number;
}

/** 強調表示する範囲を設定する。null で消す */
export const setHighlightEffect = StateEffect.define<HighlightRange | null>({
  map: (range, mapping) =>
    range && { from: mapping.mapPos(range.from, 1), to: mapping.mapPos(range.to, -1) },
});

const highlightMark = Decoration.mark({ class: HIGHLIGHT_CLASS });

/** 強調表示の範囲を持つ。編集されたら範囲を編集に追従させる */
export const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlightEffect)) continue;
      const range = effect.value;
      next =
        range && range.from < range.to
          ? Decoration.set([highlightMark.range(range.from, range.to)])
          : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * 強調表示する範囲を求める。別のファイルの位置なら null。
 * ソースとエディタの内容がずれていても例外にならないよう、ドキュメントの長さに収める。空の範囲は null
 */
export function toHighlightRange(
  location: SourceLocation | null,
  path: string,
  docLength: number,
): HighlightRange | null {
  if (!location || location.filePath !== path) return null;
  const from = Math.max(0, Math.min(location.start, docLength));
  const to = Math.max(from, Math.min(location.end, docLength));
  return from < to ? { from, to } : null;
}
