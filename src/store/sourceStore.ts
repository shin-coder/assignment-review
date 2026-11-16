import {
  isTextFile,
  type ProjectSnapshot,
  type ReviewComment,
  type VirtualFile,
  type VirtualFileSystem,
} from "../shared";

/** 変更の種類。編集なら変わったパスを渡す（JS が変わったら iframe を作り直す判断に使える） */
export type SourceStoreChange = { type: "edit"; paths: string[] } | { type: "comments" };

export type SourceStoreListener = (change: SourceStoreChange) => void;

export interface SourceStoreInit {
  projectId: string;
  /** 表示名（選んだフォルダの名前） */
  name: string;
  /** 読み込んだときのファイル群。SourceStore の中に写し取るので、渡した Map を後で変えても影響しない */
  originalFiles: VirtualFileSystem;
  /** 復元時の編集後のソース。存在しないパス・バイナリ・元と同じ内容のものは捨てる */
  editedTexts?: Record<string, string>;
  /** 復元時のコメント */
  comments?: readonly ReviewComment[];
  /** 復元時の最終更新時刻。省略時は now() */
  updatedAt?: number;
  /** 現在時刻（テスト用に差し替えられる） */
  now?: () => number;
}

/** コメントの更新で変えられる項目。id は変えられない */
export type ReviewCommentPatch = Partial<Omit<ReviewComment, "id">>;

/**
 * 元のファイル群を入れる Map。作ったあとは set / delete / clear で例外を投げ、
 * 読み込み後に元のソースを差し替えられないようにする
 */
class ReadonlyFileMap extends Map<string, VirtualFile> {
  #sealed = false;

  constructor(files: Iterable<VirtualFile>) {
    super();
    for (const file of files) this.set(file.path, file);
    this.#sealed = true;
  }

  override set(key: string, value: VirtualFile): this {
    if (this.#sealed) throw new Error("元のファイル群は変更できません");
    return super.set(key, value);
  }

  override delete(): boolean {
    throw new Error("元のファイル群は変更できません");
  }

  override clear(): void {
    throw new Error("元のファイル群は変更できません");
  }
}

function freezeComment(comment: ReviewComment): ReviewComment {
  return Object.freeze({ ...comment, location: Object.freeze({ ...comment.location }) });
}

/**
 * 1 つのプロジェクトの元のソース・編集後のソース・コメントをメモリ上で持つ。
 * 変更は subscribe() で購読でき、toSnapshot() で保存用の形にできる
 */
export class SourceStore {
  readonly projectId: string;
  readonly name: string;

  readonly #original: ReadonlyFileMap;
  readonly #edited = new Map<string, string>();
  #comments: ReviewComment[] = [];
  #updatedAt: number;
  readonly #now: () => number;
  readonly #listeners = new Set<SourceStoreListener>();
  #snapshot: ProjectSnapshot | null = null;

  constructor(init: SourceStoreInit) {
    this.projectId = init.projectId;
    this.name = init.name;
    this.#now = init.now ?? Date.now;
    // VirtualFile も凍結し、content の差し替えを防ぐ（ArrayBuffer の中身までは凍結できない）
    this.#original = new ReadonlyFileMap(
      [...init.originalFiles.values()].map((file) => Object.freeze({ ...file })),
    );
    for (const [path, text] of Object.entries(init.editedTexts ?? {})) {
      const file = this.#original.get(path);
      if (file && isTextFile(file) && file.content !== text) this.#edited.set(path, text);
    }
    this.#comments = (init.comments ?? []).map(freezeComment);
    this.#updatedAt = init.updatedAt ?? this.#now();
  }

  /** 保存したスナップショットから作り直す */
  static fromSnapshot(snapshot: ProjectSnapshot, options: { now?: () => number } = {}) {
    return new SourceStore({ ...snapshot, ...options });
  }

  /** 最後に編集・コメントが変わった時刻（Date.now() の値） */
  get updatedAt(): number {
    return this.#updatedAt;
  }

  // ---- ソース ----

  /** 元のファイルのパス一覧（読み込み順） */
  paths(): string[] {
    return [...this.#original.keys()];
  }

  hasFile(path: string): boolean {
    return this.#original.has(path);
  }

  /** 読み込んだときの内容。存在しないパスなら undefined */
  getOriginal(path: string): string | ArrayBuffer | undefined {
    return this.#original.get(path)?.content;
  }

  /** 編集後の内容。未編集なら元の内容を返す */
  getEdited(path: string): string | ArrayBuffer | undefined {
    return this.#edited.get(path) ?? this.getOriginal(path);
  }

  /** 編集後の内容を反映したファイル群（読み込み順）。プレビューや解析に渡す */
  currentFiles(): VirtualFile[] {
    return [...this.#original.values()].map((file) => {
      const edited = this.#edited.get(file.path);
      return edited === undefined ? file : { ...file, content: edited };
    });
  }

  /**
   * 編集後のテキストを設定する。元と同じ内容なら未編集に戻す。元のソースは書き換えない。
   * 存在しないパスやバイナリのファイルには例外を投げる
   */
  setEdited(path: string, text: string): void {
    const file = this.#original.get(path);
    if (!file) throw new Error(`存在しないファイルです: ${path}`);
    if (!isTextFile(file)) throw new Error(`テキストではないファイルは編集できません: ${path}`);

    const current = this.#edited.get(path) ?? file.content;
    if (current === text) return;
    if (text === file.content) {
      this.#edited.delete(path);
    } else {
      this.#edited.set(path, text);
    }
    this.#changed({ type: "edit", paths: [path] });
  }

  /** 1 ファイルの編集を取り消す */
  resetFile(path: string): void {
    if (!this.#edited.delete(path)) return;
    this.#changed({ type: "edit", paths: [path] });
  }

  /** すべての編集を取り消す。コメントは残す */
  resetAll(): void {
    if (this.#edited.size === 0) return;
    const paths = [...this.#edited.keys()];
    this.#edited.clear();
    this.#changed({ type: "edit", paths });
  }

  isEdited(path: string): boolean {
    return this.#edited.has(path);
  }

  /** 編集したファイルのパス一覧（編集した順） */
  editedPaths(): string[] {
    return [...this.#edited.keys()];
  }

  // ---- コメント（紐付けの計算は src/comments の担当。ここでは保持だけ） ----

  getComments(): readonly ReviewComment[] {
    return this.#comments;
  }

  getComment(id: string): ReviewComment | undefined {
    return this.#comments.find((comment) => comment.id === id);
  }

  /** コメントを末尾に追加する。同じ id があれば例外を投げる */
  addComment(comment: ReviewComment): void {
    if (this.getComment(comment.id)) throw new Error(`同じ id のコメントがあります: ${comment.id}`);
    this.#comments = [...this.#comments, freezeComment(comment)];
    this.#changed({ type: "comments" });
  }

  /** コメントの一部を書き換える。存在しない id なら例外を投げる */
  updateComment(id: string, patch: ReviewCommentPatch): void {
    const index = this.#comments.findIndex((comment) => comment.id === id);
    const current = this.#comments[index];
    if (!current) throw new Error(`存在しないコメントです: ${id}`);
    const next = [...this.#comments];
    next[index] = freezeComment({ ...current, ...patch, id });
    this.#comments = next;
    this.#changed({ type: "comments" });
  }

  /** コメントを削除する。存在しない id なら何もしない */
  removeComment(id: string): void {
    const next = this.#comments.filter((comment) => comment.id !== id);
    if (next.length === this.#comments.length) return;
    this.#comments = next;
    this.#changed({ type: "comments" });
  }

  /** コメントをまとめて置き換える（編集後に位置を追従し直した結果を入れるときなど） */
  replaceComments(comments: readonly ReviewComment[]): void {
    this.#comments = comments.map(freezeComment);
    this.#changed({ type: "comments" });
  }

  // ---- 購読と保存 ----

  /** 変更を購読する。戻り値の関数で購読をやめる */
  subscribe(listener: SourceStoreListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * 保存用のスナップショット。次の変更まで同じオブジェクトを返す（useSyncExternalStore にそのまま使える）。
   * originalFiles は変更できない Map で、毎回同じ参照になる
   */
  toSnapshot(): ProjectSnapshot {
    this.#snapshot ??= {
      projectId: this.projectId,
      name: this.name,
      originalFiles: this.#original,
      editedTexts: Object.fromEntries(this.#edited),
      comments: [...this.#comments],
      updatedAt: this.#updatedAt,
    };
    return this.#snapshot;
  }

  #changed(change: SourceStoreChange): void {
    this.#updatedAt = this.#now();
    this.#snapshot = null;
    for (const listener of [...this.#listeners]) listener(change);
  }
}
