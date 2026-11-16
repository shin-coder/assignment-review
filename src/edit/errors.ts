export type EditErrorCode =
  /** location / startTag が null の要素（ブラウザが暗黙に作った要素）を編集しようとした */
  | "implicit-element"
  /** 範囲がソースの外を指している、または start > end */
  | "invalid-range"
  /** ElementInfo が渡されたソースと食い違っている（別の版のソースから作られた など） */
  | "source-mismatch"
  /** 空要素（img など）や自己終了タグの要素の中身を置き換えようとした */
  | "no-inner-content"
  /** 属性名として使えない文字列 */
  | "invalid-attribute-name"
  /** 別のファイルの TextChange を合成しようとした */
  | "file-mismatch"
  /** applyEdits に重なり合う範囲が渡された */
  | "overlapping-edits";

/** 編集の適用に失敗したときのエラー。code で種類を判別し、message はそのまま画面に出せる文にする */
export class EditError extends Error {
  readonly code: EditErrorCode;

  constructor(code: EditErrorCode, message: string) {
    super(message);
    this.name = "EditError";
    this.code = code;
  }
}
