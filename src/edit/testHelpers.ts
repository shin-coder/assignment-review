// テスト専用の補助関数（本体からは import しない）
import type { ElementInfo, TextChange } from "../shared";

/**
 * 「元のソースの start〜end を、新しいソースの start から insertedLength 文字で置き換えた」テキストを作る。
 * TextChange が正しければ、新しいソースと一致する
 */
export function applyChangeTo(before: string, after: string, change: TextChange): string {
  return (
    before.slice(0, change.start) +
    after.slice(change.start, change.start + change.insertedLength) +
    before.slice(change.end)
  );
}

/**
 * ソース上の開始タグの文字列と要素全体の文字列から ElementInfo を作る。
 * outer を省略すると開始タグだけの要素（空要素など）になる
 */
export function elementAt(
  source: string,
  tagName: string,
  startTagText: string,
  outerText: string = startTagText,
  fromIndex = 0,
): ElementInfo {
  const start = source.indexOf(startTagText, fromIndex);
  if (start === -1) throw new Error(`見つかりません: ${startTagText}`);
  if (source.slice(start, start + outerText.length) !== outerText) {
    throw new Error(`要素全体が一致しません: ${outerText}`);
  }
  return {
    id: String(start),
    tagName,
    filePath: "index.html",
    location: { filePath: "index.html", start, end: start + outerText.length },
    startTag: { filePath: "index.html", start, end: start + startTagText.length },
    parentId: null,
    childIds: [],
  };
}
