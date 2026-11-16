/**
 * HTML / CSS などを編集したとき、最後の入力からこの時間（ミリ秒）だけ待ってから onChange を呼ぶ。
 * 入力のたびにソースの再解析やプレビューの書き換えが走らないようにまとめる
 */
export const CHANGE_DEBOUNCE_MS = 300;

/** 強調表示（レイヤーツリーや iframe で選んだ要素の範囲）に付けるクラス名 */
export const HIGHLIGHT_CLASS = "cm-review-highlight";
