import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  ProjectRepository,
  ProjectSnapshot,
  ProjectSummary,
  ReviewComment,
  VirtualFile,
} from "../shared";
import { toStoreError } from "./errors";

export const DB_NAME = "student-site-review";
export const DB_VERSION = 1;

/** オブジェクトストア名 */
export const STORE_NAMES = {
  /** プロジェクトの概要・編集後のソース・コメント（キー: projectId） */
  projects: "projects",
  /** 読み込んだときのファイル群（キー: projectId）。大きいので一覧の取得では読まない */
  originalFiles: "originalFiles",
  /** 最後に開いたプロジェクト ID などの小さな値（キー: META_KEYS の値） */
  meta: "meta",
} as const;

export const META_KEYS = {
  latestProjectId: "latestProjectId",
} as const;

interface StoredProject extends ProjectSummary {
  editedTexts: Record<string, string>;
  comments: ReviewComment[];
}

interface StoredOriginalFiles {
  projectId: string;
  /** Map はそのまま保存せず、読み込み順を保った配列にする */
  files: VirtualFile[];
}

interface ReviewDbSchema extends DBSchema {
  projects: { key: string; value: StoredProject };
  originalFiles: { key: string; value: StoredOriginalFiles };
  meta: { key: string; value: string };
}

export interface IndexedDbProjectRepositoryOptions {
  /** DB 名。テストで DB を分けるときに指定する */
  dbName?: string;
}

/**
 * ProjectRepository の IndexedDB 実装。
 * 失敗はすべて StoreError（容量超過は code: "quota-exceeded"）で reject する
 */
export class IndexedDbProjectRepository implements ProjectRepository {
  readonly #dbName: string;
  #dbPromise: Promise<IDBPDatabase<ReviewDbSchema>> | null = null;
  /**
   * このインスタンスが保存・読み込みした元のファイル群。元のファイル群は読み込み後に変わらないので、
   * 同じ Map なら 2 回目以降の保存で書き直さない（自動保存のたびに画像を書かないため）
   */
  readonly #knownOriginals = new Map<string, WeakRef<ProjectSnapshot["originalFiles"]>>();

  constructor(options: IndexedDbProjectRepositoryOptions = {}) {
    this.#dbName = options.dbName ?? DB_NAME;
  }

  /** 保存し、最後に開いたプロジェクトとして記録する */
  async save(snapshot: ProjectSnapshot): Promise<void> {
    try {
      const db = await this.#db();
      const tx = db.transaction(
        [STORE_NAMES.projects, STORE_NAMES.originalFiles, STORE_NAMES.meta],
        "readwrite",
      );
      const { projectId } = snapshot;
      const originalsStore = tx.objectStore(STORE_NAMES.originalFiles);
      const known = this.#knownOriginals.get(projectId)?.deref() === snapshot.originalFiles;
      // 別のタブで削除された場合に備えて、覚えていても DB に残っているかは確かめる
      const needsOriginals = !known || (await originalsStore.getKey(projectId)) === undefined;

      const writes: Promise<unknown>[] = [
        tx.objectStore(STORE_NAMES.projects).put({
          projectId,
          name: snapshot.name,
          updatedAt: snapshot.updatedAt,
          editedTexts: snapshot.editedTexts,
          comments: snapshot.comments,
        }),
        tx.objectStore(STORE_NAMES.meta).put(projectId, META_KEYS.latestProjectId),
      ];
      if (needsOriginals) {
        writes.push(originalsStore.put({ projectId, files: [...snapshot.originalFiles.values()] }));
      }
      await Promise.all([...writes, tx.done]);
      this.#knownOriginals.set(projectId, new WeakRef(snapshot.originalFiles));
    } catch (error) {
      throw toStoreError(error, "save-failed");
    }
  }

  async load(projectId: string): Promise<ProjectSnapshot | null> {
    try {
      const db = await this.#db();
      const tx = db.transaction([STORE_NAMES.projects, STORE_NAMES.originalFiles], "readonly");
      const [project, originals] = await Promise.all([
        tx.objectStore(STORE_NAMES.projects).get(projectId),
        tx.objectStore(STORE_NAMES.originalFiles).get(projectId),
        tx.done,
      ]);
      if (!project || !originals) return null;

      const originalFiles = new Map(originals.files.map((file) => [file.path, file]));
      this.#knownOriginals.set(projectId, new WeakRef(originalFiles));
      return {
        projectId: project.projectId,
        name: project.name,
        originalFiles,
        editedTexts: project.editedTexts,
        comments: project.comments,
        updatedAt: project.updatedAt,
      };
    } catch (error) {
      throw toStoreError(error, "load-failed");
    }
  }

  /** 保存済みプロジェクトの一覧。新しく更新した順 */
  async list(): Promise<ProjectSummary[]> {
    try {
      const db = await this.#db();
      const projects = await db.getAll(STORE_NAMES.projects);
      return projects
        .map(({ projectId, name, updatedAt }) => ({ projectId, name, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      throw toStoreError(error, "load-failed");
    }
  }

  /** 削除する。最後に開いたプロジェクトだった場合はその記録も消す */
  async remove(projectId: string): Promise<void> {
    try {
      const db = await this.#db();
      const tx = db.transaction(
        [STORE_NAMES.projects, STORE_NAMES.originalFiles, STORE_NAMES.meta],
        "readwrite",
      );
      const meta = tx.objectStore(STORE_NAMES.meta);
      const isLatest = (await meta.get(META_KEYS.latestProjectId)) === projectId;
      const writes: Promise<unknown>[] = [
        tx.objectStore(STORE_NAMES.projects).delete(projectId),
        tx.objectStore(STORE_NAMES.originalFiles).delete(projectId),
      ];
      if (isLatest) writes.push(meta.delete(META_KEYS.latestProjectId));
      await Promise.all([...writes, tx.done]);
      this.#knownOriginals.delete(projectId);
    } catch (error) {
      throw toStoreError(error, "remove-failed");
    }
  }

  /** 保存済みのプロジェクトを開いたとき、最後に開いたプロジェクトとして記録する（save() でも記録される） */
  async setLatest(projectId: string): Promise<void> {
    try {
      const db = await this.#db();
      await db.put(STORE_NAMES.meta, projectId, META_KEYS.latestProjectId);
    } catch (error) {
      throw toStoreError(error, "save-failed");
    }
  }

  /** 最後に開いたプロジェクトを読み込む。記録がない・削除済みなら null */
  async loadLatest(): Promise<ProjectSnapshot | null> {
    let projectId: string | undefined;
    try {
      const db = await this.#db();
      projectId = await db.get(STORE_NAMES.meta, META_KEYS.latestProjectId);
    } catch (error) {
      throw toStoreError(error, "load-failed");
    }
    return projectId === undefined ? null : this.load(projectId);
  }

  /** 接続を閉じる。次の操作で開き直す */
  async close(): Promise<void> {
    const dbPromise = this.#dbPromise;
    this.#dbPromise = null;
    if (dbPromise) (await dbPromise).close();
  }

  #db(): Promise<IDBPDatabase<ReviewDbSchema>> {
    if (!this.#dbPromise) {
      const dbPromise: Promise<IDBPDatabase<ReviewDbSchema>> = openDB<ReviewDbSchema>(
        this.#dbName,
        DB_VERSION,
        {
          upgrade(db, oldVersion) {
            if (oldVersion < 1) {
              db.createObjectStore(STORE_NAMES.projects, { keyPath: "projectId" });
              db.createObjectStore(STORE_NAMES.originalFiles, { keyPath: "projectId" });
              db.createObjectStore(STORE_NAMES.meta);
            }
          },
          // 別のタブが新しいバージョンで開こうとしたら閉じて譲る。次の操作で開き直す
          blocking: () => {
            void dbPromise.then((db) => db.close());
            reset();
          },
          terminated: () => reset(),
        },
      );
      const reset = () => {
        if (this.#dbPromise === dbPromise) this.#dbPromise = null;
      };
      // 開けなかったときは次の操作で開き直せるようにする
      dbPromise.catch(reset);
      this.#dbPromise = dbPromise;
    }
    return this.#dbPromise;
  }
}
