export type EditKind = "html" | "css" | "js" | "other";

export interface EditClassification {
  kind: EditKind;
  /**
   * 編集後のソースから iframe を作り直す必要があるか。
   * HTML / CSS は iframe の DOM をその場で書き換えて反映できるので不要。
   * JS は実行し直さないと反映されないので必要。
   * その他（SVG・JSON など）はその場で反映する手段がないため、作り直す側に倒す
   */
  needsReload: boolean;
}

const KIND_BY_EXTENSION: Record<string, EditKind> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "js",
  mjs: "js",
  cjs: "js",
};

/** 編集されたファイルの種類と、iframe の作り直しが必要かを拡張子から判定する（大文字小文字は区別しない） */
export function classifyEdit(path: string): EditClassification {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // ".htaccess" のような先頭のドットは拡張子とみなさない
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const kind = KIND_BY_EXTENSION[extension] ?? "other";
  return { kind, needsReload: kind === "js" || kind === "other" };
}
