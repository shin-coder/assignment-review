import type { ReviewComment } from "./comment";
import type { VirtualFileSystem } from "./vfs";

/** 1 つの生徒フォルダについて保存する内容 */
export interface ProjectSnapshot {
  projectId: string;
  /** 表示名（選んだフォルダの名前） */
  name: string;
  /** 読み込んだときのファイル群。読み込み後は変更しない */
  originalFiles: VirtualFileSystem;
  /** 編集したファイルだけを持つ。パス → 編集後のテキスト */
  editedTexts: Record<string, string>;
  comments: ReviewComment[];
  /** Date.now() の値 */
  updatedAt: number;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  updatedAt: number;
}

/** プロジェクトの保存先。src/store が IndexedDB で実装し、他の層はモックで使う */
export interface ProjectRepository {
  save(snapshot: ProjectSnapshot): Promise<void>;
  load(projectId: string): Promise<ProjectSnapshot | null>;
  list(): Promise<ProjectSummary[]>;
  remove(projectId: string): Promise<void>;
}
