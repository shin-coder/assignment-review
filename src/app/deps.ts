// App が外の世界（ブラウザ API・IndexedDB・Service Worker）に触れる部分をまとめた依存。
// 本番は defaultDeps.ts、結合テストでは偽物に差し替える
import type { ComponentType } from "react";
import type { DirectoryHandleLike } from "../loader";
import type { PreviewFrameProps } from "../preview";
import type { ParentToFrameMessage, ProjectRepository, ProjectSnapshot } from "../shared";

/**
 * 保存先。共有の ProjectRepository には loadLatest がない（03 のメモの提案）ため、
 * 統合では loadLatest を足した型を使う（IndexedDbProjectRepository がそのまま満たす）
 */
export interface AppRepository extends ProjectRepository {
  loadLatest(): Promise<ProjectSnapshot | null>;
}

export interface AppDeps {
  repository: AppRepository;
  /** Service Worker の登録。起動時に 1 回だけ呼ぶ */
  registerWorker: () => Promise<unknown>;
  /** プロジェクトの切り替え・削除で古いセッションのファイルを消す */
  clearFiles: (sessionId: string) => Promise<void>;
  /** PreviewFrame のファイル送信（省略時は PreviewFrame の既定の putFiles） */
  sendFiles?: PreviewFrameProps["sendFiles"];
  postToFrame: (iframe: HTMLIFrameElement, message: ParentToFrameMessage) => boolean;
  /** フォルダ選択。キャンセルなら null。実装は呼び出し時に window.showDirectoryPicker を読む */
  pickDirectory: () => Promise<DirectoryHandleLike | null>;
  isPickerSupported: () => boolean;
  /** PreviewFrame の差し替え（テスト用） */
  PreviewFrame?: ComponentType<PreviewFrameProps>;
  /** import.meta.env.DEV */
  isDev: boolean;
  /** 自動保存の待ち時間（テストで短くする） */
  autoSaveDelayMs?: number;
  createProjectId?: () => string;
}
