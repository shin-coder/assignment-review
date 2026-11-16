import type { ProjectRepository, ProjectSnapshot } from "../shared";
import { toStoreError, type StoreError } from "./errors";
import type { SourceStore } from "./sourceStore";

/** 最後の変更からこの時間だけ変更がなければ保存する（ミリ秒） */
export const AUTO_SAVE_DELAY_MS = 500;

/** 自動保存に必要な SourceStore の機能 */
export type AutoSaveSource = Pick<SourceStore, "subscribe" | "toSnapshot">;

export interface AutoSaveOptions {
  /** デバウンス時間（ミリ秒）。省略時は AUTO_SAVE_DELAY_MS */
  delayMs?: number;
  /** 保存に失敗したとき。容量超過は error.code === "quota-exceeded"。省略時は console.error に出す */
  onError?: (error: StoreError) => void;
  /** 保存に成功したとき */
  onSaved?: (snapshot: ProjectSnapshot) => void;
}

export interface AutoSaver {
  /** 未保存の変更があればすぐに保存し、実行中の保存も含めて終わるまで待つ。失敗は onError に渡し、reject しない */
  flush(): Promise<void>;
  /** 未保存の変更があるか（保存に失敗した変更も含む） */
  readonly dirty: boolean;
  /** 購読とタイマーをやめる。未保存の変更は保存しないので、必要なら先に flush() を呼ぶ */
  dispose(): void;
}

/**
 * SourceStore の変更（編集・コメント）を購読し、短時間の連続変更をまとめて repository に保存する。
 * 保存は順番に 1 つずつ行い、古いスナップショットが新しいものを上書きしないようにする
 */
export function startAutoSave(
  source: AutoSaveSource,
  repository: ProjectRepository,
  options: AutoSaveOptions = {},
): AutoSaver {
  const delayMs = options.delayMs ?? AUTO_SAVE_DELAY_MS;
  const onError =
    options.onError ??
    ((error: StoreError) => {
      console.error(error);
    });
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const saveOnce = async (): Promise<void> => {
    if (!dirty) return;
    dirty = false;
    const snapshot = source.toSnapshot();
    try {
      await repository.save(snapshot);
      options.onSaved?.(snapshot);
    } catch (error) {
      // 失敗した変更は未保存のまま残し、次の変更や flush() で保存し直す
      dirty = true;
      onError(toStoreError(error, "save-failed"));
    }
  };

  const enqueue = (): Promise<void> => {
    clearTimer();
    queue = queue.then(saveOnce);
    return queue;
  };

  const unsubscribe = source.subscribe(() => {
    dirty = true;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void enqueue();
    }, delayMs);
  });

  return {
    flush: enqueue,
    get dirty() {
      return dirty;
    },
    dispose() {
      clearTimer();
      unsubscribe();
    },
  };
}
