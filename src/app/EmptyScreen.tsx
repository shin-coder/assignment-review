import { useState, type DragEvent } from "react";
import type { DirectoryHandleLike } from "../loader";
import { CodeIcon, CommentIcon, FolderIcon } from "../ui/review/icons";

export interface EmptyScreenProps {
  /** showDirectoryPicker が使えるか */
  supported: boolean;
  busy: boolean;
  onPick: () => void;
  onDrop: (handle: DirectoryHandleLike) => void;
}

/** ドロップされたもの（Chrome の getAsFileSystemHandle）からフォルダを取り出す。なければ null */
async function directoryFrom(event: DragEvent): Promise<DirectoryHandleLike | null> {
  for (const item of event.dataTransfer.items) {
    if (item.kind !== "file") continue;
    const getHandle = (
      item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
      }
    ).getAsFileSystemHandle;
    if (typeof getHandle !== "function") return null;
    const handle = await getHandle.call(item);
    if (handle?.kind === "directory") return handle as unknown as DirectoryHandleLike;
  }
  return null;
}

/** フォルダを読み込む前の画面。真ん中に 1 つだけ「フォルダを選ぶ」を置き、ドロップでも開ける */
export function EmptyScreen({ supported, busy, onPick, onDrop }: EmptyScreenProps) {
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  function handleDragOver(event: DragEvent) {
    if (!supported || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!supported || busy) return;
    // getAsFileSystemHandle はドロップのイベント中に呼ぶ必要があるので、await の前に始める
    const handle = await directoryFrom(event);
    if (handle) {
      setDropError(null);
      onDrop(handle);
    } else {
      setDropError("フォルダをドロップしてください（ファイルは開けません）");
    }
  }

  return (
    <main
      className="empty-screen"
      data-dragging={dragging ? "true" : undefined}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="empty-card">
        <span className="empty-logo" aria-hidden="true">
          <CommentIcon size={26} />
        </span>
        <h1 className="empty-title">生徒サイト レビューツール</h1>
        <p className="empty-lead">生徒のサイトのフォルダを選んでください。</p>

        <div className="dropzone" data-active={dragging ? "true" : undefined}>
          <span className="dropzone-icon" aria-hidden="true">
            <FolderIcon size={32} />
          </span>
          <button
            type="button"
            className="btn btn-primary btn-large"
            data-testid="open-folder"
            disabled={!supported || busy}
            onClick={onPick}
          >
            {busy ? "読み込み中…" : "フォルダを選ぶ"}
          </button>
          <p className="dropzone-hint">または、ここにフォルダをドラッグ＆ドロップ</p>
        </div>

        {!supported && (
          <p role="alert" className="inline-alert" data-testid="unsupported-browser">
            このブラウザではフォルダを選べません。Chrome で開いてください。
          </p>
        )}
        {dropError && (
          <p role="alert" className="inline-alert">
            {dropError}
          </p>
        )}

        <ul className="empty-features">
          <li>
            <CommentIcon size={18} />
            要素をクリックしてコメント
          </li>
          <li>
            <CodeIcon size={18} />
            HTML / CSS / JS をその場で編集
          </li>
        </ul>
        <p className="empty-note">
          読み込んだフォルダには書き込みません。編集とコメントはこのブラウザだけに保存されます。
        </p>
      </div>
    </main>
  );
}
