import type { SourceLocation, TextChange } from "../shared";
import { EditError } from "./errors";

/** 編集関数の戻り値 */
export interface EditResult {
  /** 編集後のソース */
  source: string;
  /**
   * 元のソースからの変化。指定された範囲の中から、共通の先頭・末尾を除いた最小の範囲になる。
   * 何も変わらなかった場合は start === end かつ insertedLength === 0（isNoopChange で判定できる）
   */
  change: TextChange;
}

/** applyEdits に渡す 1 件分の範囲置換。start / end は元のソース上の位置 */
export interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

/** applyEdits の戻り値 */
export interface MultiEditResult extends EditResult {
  /** 実際に適用した順（後ろの範囲から）の TextChange。各要素はその時点のソースに対する位置 */
  changes: TextChange[];
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** 範囲がソースの中に収まっていることを確かめる */
export function assertRange(source: string, start: number, end: number): void {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    end > source.length
  ) {
    throw new EditError(
      "invalid-range",
      `範囲 ${start}〜${end} がソース（${source.length} 文字）の外を指しています`,
    );
  }
}

/**
 * source の start〜end を newText に置き換える。範囲は検証済みとする。
 * TextChange は置き換え前後で共通の先頭・末尾を除いた最小の範囲にする。
 * サロゲートペアの途中では区切らない
 */
export function replaceMinimal(
  source: string,
  filePath: string,
  start: number,
  end: number,
  newText: string,
): EditResult {
  const limit = Math.min(end - start, newText.length);

  let prefix = 0;
  while (prefix < limit && source.charCodeAt(start + prefix) === newText.charCodeAt(prefix)) {
    prefix++;
  }
  if (prefix > 0 && isHighSurrogate(source.charCodeAt(start + prefix - 1))) prefix--;

  let suffix = 0;
  while (
    suffix < limit - prefix &&
    source.charCodeAt(end - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix++;
  }
  if (suffix > 0 && isLowSurrogate(source.charCodeAt(end - suffix))) suffix--;

  return {
    source: source.slice(0, start) + newText + source.slice(end),
    change: {
      filePath,
      start: start + prefix,
      end: end - suffix,
      insertedLength: newText.length - prefix - suffix,
    },
  };
}

/** 何も変えない TextChange か */
export function isNoopChange(change: TextChange): boolean {
  return change.start === change.end && change.insertedLength === 0;
}

/** 指定範囲を newText に置き換える。location.filePath が TextChange の filePath になる */
export function replaceRange(
  source: string,
  location: SourceLocation,
  newText: string,
): EditResult {
  assertRange(source, location.start, location.end);
  return replaceMinimal(source, location.filePath, location.start, location.end, newText);
}

/**
 * エディタでファイル全体を書き換えたときの差分を求める。
 * TextChange は共通の先頭・末尾を除いた最小の範囲になる
 */
export function replaceFile(source: string, newSource: string, filePath: string): EditResult {
  return replaceMinimal(source, filePath, 0, source.length, newSource);
}

/** 順に適用した 2 つの変化（b は a を適用した後のソースに対する位置）を 1 つにまとめる */
function composeTwo(a: TextChange, b: TextChange): TextChange {
  const insertedEnd = a.start + a.insertedLength;
  const deltaA = a.insertedLength - (a.end - a.start);
  const deltaB = b.insertedLength - (b.end - b.start);

  // a を適用した後の位置を、a を適用する前の位置に戻す。a が挿入した文字の中なら a の範囲の端に寄せる
  const toBefore = (offset: number, isEnd: boolean): number => {
    if (offset <= a.start) return offset;
    if (offset >= insertedEnd) return offset - deltaA;
    return isEnd ? a.end : a.start;
  };

  const start = Math.min(a.start, toBefore(b.start, false));
  const end = Math.max(a.end, toBefore(b.end, true));
  return { filePath: a.filePath, start, end, insertedLength: end - start + deltaA + deltaB };
}

/**
 * 順に適用した TextChange の列（各要素は直前までを適用した後のソースに対する位置）を、
 * 元のソースに対する 1 つの TextChange にまとめる。
 * 何も変えない変化は無視し、すべてが何も変えない（または空の列）なら null を返す
 */
export function composeChanges(changes: readonly TextChange[]): TextChange | null {
  let result: TextChange | null = null;
  for (const change of changes) {
    if (result !== null && change.filePath !== result.filePath) {
      throw new EditError(
        "file-mismatch",
        `別のファイルの変化はまとめられません: ${result.filePath} と ${change.filePath}`,
      );
    }
    if (isNoopChange(change)) continue;
    result = result === null ? { ...change } : composeTwo(result, change);
  }
  return result;
}

/**
 * 同じ元のソースに対する複数の範囲置換をまとめて適用する。
 * 位置がずれないよう、範囲を並べ替えて後ろから順に適用する。
 * 同じ位置への挿入どうしは、edits の並び順のとおりに並ぶ。範囲が重なる場合は例外を投げる
 */
export function applyEdits(
  source: string,
  filePath: string,
  edits: readonly RangeEdit[],
): MultiEditResult {
  for (const edit of edits) assertRange(source, edit.start, edit.end);

  // 並べ替えは安定なので、同じ範囲の挿入は edits の順を保つ
  const sorted = [...edits].sort((x, y) => x.start - y.start || x.end - y.end);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (previous.end > current.start) {
      throw new EditError(
        "overlapping-edits",
        `範囲 ${previous.start}〜${previous.end} と ${current.start}〜${current.end} が重なっています`,
      );
    }
  }

  let current = source;
  const changes: TextChange[] = [];
  for (const edit of sorted.reverse()) {
    // 後ろから適用するので、edit より前の位置は元のソースのまま
    const result = replaceMinimal(current, filePath, edit.start, edit.end, edit.text);
    current = result.source;
    changes.push(result.change);
  }

  return {
    source: current,
    change: composeChanges(changes) ?? { filePath, start: 0, end: 0, insertedLength: 0 },
    changes,
  };
}
