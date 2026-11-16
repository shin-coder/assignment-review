// Service Worker が持つ「セッション → ファイル群」。
// Service Worker はブラウザに止められても次のリクエストで起動し直すため、
// メモリだけでなく IndexedDB にも保存し、起動し直した後もファイルを返せるようにする。
// src/sw/sw.ts（WebWorker の型）と単体テスト（DOM の型）の両方から使うため、両方の型にある API だけを使う
import { normalizePath, type VirtualFile } from "../../shared";
import type { PreviewFileReader } from "./serve";

/** Service Worker が使うファイルの保存先 */
export interface PreviewFileStore extends PreviewFileReader {
  /** セッションのファイル群をまるごと置き換える（渡されなかったファイルは消える） */
  putFiles(sessionId: string, files: readonly VirtualFile[]): Promise<void>;
  /** セッションのファイルをすべて破棄する */
  clear(sessionId: string): Promise<void>;
}

/** 永続化先。差分だけを書き込めるよう、置き換えではなく追加・削除で表す */
export interface PersistentFileBackend {
  loadSession(sessionId: string): Promise<VirtualFile[]>;
  applyChanges(
    sessionId: string,
    upserts: readonly VirtualFile[],
    deletedPaths: readonly string[],
  ): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

// ---- IndexedDB ----

export const PREVIEW_DB_NAME = "student-site-review-preview";
const DB_VERSION = 1;
const FILE_STORE = "files";
const SESSION_INDEX = "sessionId";

interface FileRecord {
  sessionId: string;
  path: string;
  mimeType: string;
  content: string | ArrayBuffer;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB の操作に失敗しました"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    const fail = () =>
      reject(transaction.error ?? new Error("IndexedDB のトランザクションが中断されました"));
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, DB_VERSION);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(FILE_STORE, {
      keyPath: ["sessionId", "path"],
    });
    store.createIndex(SESSION_INDEX, "sessionId");
  };
  return requestToPromise(request);
}

/**
 * IndexedDB に 1 ファイル 1 レコードで保存する。キーは [sessionId, path]。
 * factory は既定で Service Worker の indexedDB。テストでは fake-indexeddb の IDBFactory を渡す
 */
export function createIndexedDbBackend(
  factory: IDBFactory = indexedDB,
  name: string = PREVIEW_DB_NAME,
): PersistentFileBackend {
  let database: Promise<IDBDatabase> | null = null;
  const getDatabase = (): Promise<IDBDatabase> => {
    database ??= openDatabase(factory, name).catch((error: unknown) => {
      // 開けなかったときは次の呼び出しでやり直す
      database = null;
      throw error;
    });
    return database;
  };

  return {
    async loadSession(sessionId) {
      const db = await getDatabase();
      const transaction = db.transaction(FILE_STORE, "readonly");
      const records = await requestToPromise<FileRecord[]>(
        transaction.objectStore(FILE_STORE).index(SESSION_INDEX).getAll(sessionId),
      );
      return records.map(({ path, mimeType, content }) => ({ path, mimeType, content }));
    },

    async applyChanges(sessionId, upserts, deletedPaths) {
      if (upserts.length === 0 && deletedPaths.length === 0) return;
      const db = await getDatabase();
      const transaction = db.transaction(FILE_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(FILE_STORE);
      for (const path of deletedPaths) store.delete([sessionId, path]);
      for (const { path, mimeType, content } of upserts) {
        const record: FileRecord = { sessionId, path, mimeType, content };
        store.put(record);
      }
      await done;
    },

    async deleteSession(sessionId) {
      const db = await getDatabase();
      const transaction = db.transaction(FILE_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(FILE_STORE);
      const keys = await requestToPromise(store.index(SESSION_INDEX).getAllKeys(sessionId));
      for (const key of keys) store.delete(key);
      await done;
    },
  };
}

/** 永続化しない保存先（テストや IndexedDB が使えない環境向け） */
export function createMemoryBackend(): PersistentFileBackend {
  const sessions = new Map<string, Map<string, VirtualFile>>();
  return {
    async loadSession(sessionId) {
      return [...(sessions.get(sessionId)?.values() ?? [])];
    },
    async applyChanges(sessionId, upserts, deletedPaths) {
      const files = sessions.get(sessionId) ?? new Map<string, VirtualFile>();
      for (const path of deletedPaths) files.delete(path);
      for (const file of upserts) files.set(file.path, file);
      sessions.set(sessionId, files);
    },
    async deleteSession(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

// ---- メモリ + 永続化 ----

function sameContent(a: string | ArrayBuffer, b: string | ArrayBuffer): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function sameFile(a: VirtualFile, b: VirtualFile): boolean {
  return a.mimeType === b.mimeType && sameContent(a.content, b.content);
}

/**
 * メモリを先に引き、なければ永続化先から読み込む保存先。
 * - 書き込み（putFiles / clear）と永続化先からの読み込みは 1 本の列で順番に処理する
 * - putFiles は変わったファイルだけを永続化先に書き込む（CSS だけ編集したときに画像を書き直さない）
 * - 書き込みは永続化先への保存が終わってから完了する（完了後に Service Worker が止まっても失われない）
 */
export function createPreviewFileStore(
  backend: PersistentFileBackend = createIndexedDbBackend(),
): PreviewFileStore {
  const memory = new Map<string, Map<string, VirtualFile>>();
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };

  /** 列の中で呼ぶ。メモリになければ永続化先から読み込む */
  const loadIntoMemory = async (sessionId: string): Promise<Map<string, VirtualFile>> => {
    const cached = memory.get(sessionId);
    if (cached) return cached;
    const files = new Map<string, VirtualFile>();
    for (const file of await backend.loadSession(sessionId)) files.set(file.path, file);
    memory.set(sessionId, files);
    return files;
  };

  return {
    async getFile(sessionId, path) {
      const key = normalizePath(path);
      const cached = memory.get(sessionId);
      if (cached) return cached.get(key);
      const files = await enqueue(() => loadIntoMemory(sessionId));
      return files.get(key);
    },

    putFiles(sessionId, files) {
      // 正規化したパスをキーにする（同じパスが複数あれば後のものを使う）
      const next = new Map<string, VirtualFile>();
      for (const file of files) {
        const path = normalizePath(file.path);
        next.set(path, { path, mimeType: file.mimeType, content: file.content });
      }
      return enqueue(async () => {
        const previous = await loadIntoMemory(sessionId);
        const upserts = [...next.values()].filter((file) => {
          const old = previous.get(file.path);
          return !old || !sameFile(old, file);
        });
        const deletedPaths = [...previous.keys()].filter((path) => !next.has(path));
        await backend.applyChanges(sessionId, upserts, deletedPaths);
        memory.set(sessionId, next);
      });
    },

    clear(sessionId) {
      return enqueue(async () => {
        await backend.deleteSession(sessionId);
        memory.delete(sessionId);
      });
    },
  };
}
