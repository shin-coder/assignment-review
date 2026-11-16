import { useEffect, useRef, useState } from "react";
import { findEntryHtml, loadDirectory, LoaderError } from "../loader";
import { SourceStore, startAutoSave, type AutoSaver } from "../store";
import type { AppDeps } from "./deps";
import { ReviewScreen } from "./ReviewScreen";
import "./app.css";

type Phase = { kind: "loading" } | { kind: "empty" } | { kind: "open"; store: SourceStore };

type SaveStatus = "saving" | "saved" | "failed";

const SAVE_LABELS: Record<SaveStatus, string> = {
  saving: "保存中…",
  saved: "保存済み",
  failed: "保存失敗",
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 画面全体。起動・フォルダの読み込み・保存・プロジェクトの切り替えを受け持つ */
export function App({ deps }: { deps: AppDeps }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Service Worker の登録は起動時に 1 回だけ。PreviewFrame はこの Promise の解決を待って iframe を出す
  const [workerReady] = useState(() => {
    const promise = deps.registerWorker();
    promise.catch(() => undefined); // 失敗は PreviewFrame が画面に出す
    return promise;
  });
  const saverRef = useRef<AutoSaver | null>(null);
  const skipFlushRef = useRef(false);

  // 起動時: 最後のプロジェクトを復元する
  useEffect(() => {
    let cancelled = false;
    deps.repository.loadLatest().then(
      (snapshot) => {
        if (cancelled) return;
        if (snapshot) {
          setSaveStatus("saved");
          setPhase({ kind: "open", store: SourceStore.fromSnapshot(snapshot) });
        } else {
          setPhase({ kind: "empty" });
        }
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(toMessage(reason));
        setPhase({ kind: "empty" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deps]);

  // 開いているプロジェクトの自動保存
  const openStore = phase.kind === "open" ? phase.store : null;
  useEffect(() => {
    if (!openStore) return;
    const unsubscribe = openStore.subscribe(() => setSaveStatus("saving"));
    const saver: AutoSaver = startAutoSave(openStore, deps.repository, {
      delayMs: deps.autoSaveDelayMs,
      onSaved: () => {
        if (!saver.dirty) {
          setSaveStatus("saved");
          setSaveError(null);
        }
      },
      onError: (storeError) => {
        setSaveStatus("failed");
        setSaveError(storeError.message);
      },
    });
    saverRef.current = saver;
    const flush = () => void saver.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      unsubscribe();
      if (saverRef.current === saver) saverRef.current = null;
      if (skipFlushRef.current) {
        skipFlushRef.current = false;
        saver.dispose();
      } else {
        void saver.flush().finally(() => saver.dispose());
      }
    };
  }, [openStore, deps]);

  async function handleOpenFolder() {
    setError(null);
    setBusy(true);
    try {
      const handle = await deps.pickDirectory();
      if (!handle) return;
      // 読み込み層は読み取りだけ。生徒のフォルダには書き込まない
      const loaded = await loadDirectory(handle);
      if (findEntryHtml(loaded.files) === null) {
        setError("このフォルダには HTML ファイルがありません");
        return;
      }
      const store = new SourceStore({
        projectId: (deps.createProjectId ?? (() => crypto.randomUUID()))(),
        name: loaded.name,
        originalFiles: loaded.files,
      });
      // 古いプロジェクトの保存を済ませてから、新しいプロジェクトを「最後に開いた」ものとして保存する
      await saverRef.current?.flush();
      await deps.repository.save(store.toSnapshot());
      if (openStore) await deps.clearFiles(openStore.projectId).catch(() => undefined);
      setSaveStatus("saved");
      setSaveError(null);
      setPhase({ kind: "open", store });
    } catch (reason) {
      setError(reason instanceof LoaderError ? reason.message : toMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject() {
    if (!openStore) return;
    try {
      // 保存を済ませて止めてから消す（消した後に自動保存が書き戻さないように）
      await saverRef.current?.flush();
      skipFlushRef.current = true;
      await deps.repository.remove(openStore.projectId);
      await deps.clearFiles(openStore.projectId).catch(() => undefined);
      setPhase({ kind: "empty" });
    } catch (reason) {
      skipFlushRef.current = false;
      setError(toMessage(reason));
    }
  }

  const supported = deps.isPickerSupported();

  return (
    <div className="app">
      <header className="app-header">
        <h1>生徒サイト レビューツール</h1>
        {openStore && <span className="project-name">{openStore.name}</span>}
        <span className="spacer" />
        {openStore && (
          <span
            data-testid="save-status"
            data-status={saveStatus}
            role="status"
            title={saveError ?? undefined}
          >
            {SAVE_LABELS[saveStatus]}
          </span>
        )}
        <button
          type="button"
          data-testid="open-folder"
          disabled={!supported || busy}
          onClick={() => void handleOpenFolder()}
        >
          フォルダを選ぶ
        </button>
      </header>

      {!supported && (
        <p role="alert" className="notice" data-testid="unsupported-browser">
          このブラウザではフォルダを選べません。Chrome で開いてください。
        </p>
      )}
      {error && (
        <p role="alert" className="notice" data-testid="app-error">
          {error}
        </p>
      )}
      {saveError && saveStatus === "failed" && (
        <p role="alert" className="notice" data-testid="save-error">
          {saveError}
        </p>
      )}

      {phase.kind === "loading" && <p role="status">読み込み中…</p>}
      {phase.kind === "empty" && <p className="empty">生徒のサイトのフォルダを選んでください。</p>}
      {phase.kind === "open" && (
        <ReviewScreen
          key={phase.store.projectId}
          store={phase.store}
          deps={deps}
          workerReady={workerReady}
          onDeleteProject={() => void handleDeleteProject()}
        />
      )}
    </div>
  );
}
