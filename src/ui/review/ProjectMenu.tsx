import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ChevronDownIcon, FolderIcon, TrashIcon, UndoIcon } from "./icons";

export type SaveStatus = "saving" | "saved" | "failed";

const SAVE_LABELS: Record<SaveStatus, string> = {
  saving: "保存中…",
  saved: "保存済み",
  failed: "保存失敗",
};

export interface ProjectMenuProps {
  name: string;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** 編集されたファイルがあるか（なければ「すべての編集を元に戻す」を無効にする） */
  hasEdits: boolean;
  pages: readonly string[];
  currentPage: string | null;
  onPageChange: (path: string) => void;
  busy: boolean;
  canOpenFolder: boolean;
  onOpenFolder: () => void;
  onResetAll: () => void;
  onDeleteProject: () => void;
}

type Confirming = "reset" | "delete" | null;

/**
 * 左上のプロジェクト名。保存状態とページの切り替えを並べ、
 * めったに使わない操作（別のフォルダ・すべて元に戻す・削除）はメニューの中にしまう
 */
export function ProjectMenu(props: ProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="project-chip" ref={rootRef}>
      <button
        type="button"
        className="project-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="project-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="project-mark" aria-hidden="true">
          <FolderIcon size={16} />
        </span>
        <span className="project-name" title={props.name}>
          {props.name}
        </span>
        <ChevronDownIcon size={16} />
      </button>

      {props.pages.length > 1 && (
        <select
          className="page-select"
          aria-label="表示するページ"
          data-testid="page-select"
          value={props.currentPage ?? ""}
          onChange={(event) => props.onPageChange(event.target.value)}
        >
          {props.pages.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      )}

      <span
        className="save-status"
        data-testid="save-status"
        data-status={props.saveStatus}
        role="status"
        title={props.saveError ?? undefined}
      >
        <span className="save-dot" aria-hidden="true" />
        {SAVE_LABELS[props.saveStatus]}
      </span>

      {open && (
        <div className="menu" role="menu" aria-label="プロジェクト">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            data-testid="menu-open-folder"
            disabled={!props.canOpenFolder || props.busy}
            onClick={() => choose(props.onOpenFolder)}
          >
            <FolderIcon size={18} />
            別のフォルダを開く
          </button>
          <div className="menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            data-testid="reset-all"
            disabled={!props.hasEdits}
            onClick={() => choose(() => setConfirming("reset"))}
          >
            <UndoIcon size={18} />
            すべての編集を元に戻す
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item-danger"
            data-testid="delete-project"
            onClick={() => choose(() => setConfirming("delete"))}
          >
            <TrashIcon size={18} />
            このプロジェクトを削除
          </button>
        </div>
      )}

      {confirming === "reset" && (
        <ConfirmDialog
          title="すべての編集を元に戻しますか？"
          description="HTML・CSS・JS を読み込んだときの状態に戻します。コメントは残ります。"
          confirmLabel="元に戻す"
          confirmTestId="reset-all-confirm"
          onConfirm={() => {
            setConfirming(null);
            props.onResetAll();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === "delete" && (
        <ConfirmDialog
          title="このプロジェクトを削除しますか？"
          description="このツールに保存した編集とコメントも消えます。生徒のフォルダの中身は変わりません。"
          confirmLabel="削除する"
          danger
          confirmTestId="delete-project-confirm"
          onConfirm={() => {
            setConfirming(null);
            props.onDeleteProject();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
