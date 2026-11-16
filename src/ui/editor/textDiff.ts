/** 1 つの置き換えで表した 2 つのテキストの差分 */
export interface TextReplacement {
  from: number;
  to: number;
  insert: string;
}

/**
 * before を after にする最小の置き換え（共通の先頭・末尾を除いた部分）を返す。同じなら null。
 * 外から value が変わったとき、全体を置き換えずにこの差分だけを適用すると、
 * 変わっていない部分にあるカーソルやスクロール位置が保たれる
 */
export function diffText(before: string, after: string): TextReplacement | null {
  if (before === after) return null;
  const maxPrefix = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < maxPrefix && before.charCodeAt(prefix) === after.charCodeAt(prefix)) {
    prefix++;
  }
  // 先頭と末尾が重ならないように、末尾の比較は先頭の一致分を除いた範囲に限る
  const maxSuffix = maxPrefix - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}
