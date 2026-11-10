/** ソーステキスト上の範囲。UTF-16 のオフセットで、end は含まない */
export interface SourceLocation {
  filePath: string;
  start: number;
  end: number;
}

/**
 * 編集 1 回分の変化。「filePath の start〜end が insertedLength 文字に置き換わった」ことを表す。
 * 編集の適用（src/edit）が出力し、コメントの紐付け（src/comments）が位置の追従に使う。
 */
export interface TextChange {
  filePath: string;
  start: number;
  end: number;
  insertedLength: number;
}
