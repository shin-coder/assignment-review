import { useMemo, useState, type KeyboardEvent } from "react";
import type { ReviewComment } from "../../shared";
import { isSubmitShortcut } from "./keyboard";
import { sortComments } from "./sortComments";
import "./comments.css";

export interface CommentListProps {
  comments: ReviewComment[];
  /** コメント ID → 対象の要素の表示名。ないコメントはファイルパスを表示する */
  labels: Record<string, string>;
  /** 選択中のコメントの ID。なければ null */
  activeId: string | null;
  /** コメントをクリックしたときに呼ばれる。該当要素のハイライトは親が行う */
  onSelect: (id: string) => void;
  /** 削除の確認で「削除する」を押したときに呼ばれる */
  onDelete: (id: string) => void;
  /** 編集を保存したときに、前後の空白を取り除いた本文で呼ばれる。空の本文や変更なしでは呼ばれない */
  onUpdate: (id: string, body: string) => void;
  /** コメント ID → 番号（ピンと同じ番号）。渡したときだけ番号を出す */
  numbers?: Record<string, number>;
  /** 一覧のアクセシブルな名前 */
  ariaLabel?: string;
  /** コメントの時刻の表示。渡したときだけ出す */
  formatTime?: (time: number) => string;
}

/** 対応する箇所が編集で消えたコメントに表示する文言 */
export const ORPHANED_MESSAGE = "対応する要素が編集で削除されました";

/** コメント一覧。ファイル・ソース位置の順に並べる */
export function CommentList({
  comments,
  labels,
  activeId,
  onSelect,
  onDelete,
  onUpdate,
  numbers,
  ariaLabel = "コメント一覧",
  formatTime,
}: CommentListProps) {
  const sorted = useMemo(() => sortComments(comments), [comments]);

  if (sorted.length === 0) {
    return <p className="rc-empty">コメントはまだありません</p>;
  }

  return (
    <ul className="rc-list" aria-label={ariaLabel}>
      {sorted.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          label={labels[comment.id] ?? comment.location.filePath}
          active={comment.id === activeId}
          onSelect={onSelect}
          onDelete={onDelete}
          onUpdate={onUpdate}
          number={numbers?.[comment.id]}
          time={formatTime?.(comment.createdAt)}
        />
      ))}
    </ul>
  );
}

// 編集を始めたら入力欄にフォーカスし、カーソルを末尾に置く（追記しやすくする）。
// 関数の同一性が変わらないよう外に置き、表示されたときだけ呼ばれるようにする
function focusAtEnd(textarea: HTMLTextAreaElement | null) {
  if (textarea === null) return;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

type ItemMode = "view" | "edit" | "confirm-delete";

interface CommentItemProps {
  comment: ReviewComment;
  label: string;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, body: string) => void;
  number?: number;
  time?: string;
}

function CommentItem({
  comment,
  label,
  active,
  onSelect,
  onDelete,
  onUpdate,
  number,
  time,
}: CommentItemProps) {
  const [mode, setMode] = useState<ItemMode>("view");
  const [draft, setDraft] = useState("");
  const orphaned = comment.status === "orphaned";
  const draftBody = draft.trim();

  function startEdit() {
    setDraft(comment.body);
    setMode("edit");
  }

  function saveEdit() {
    if (draftBody === "") return;
    if (draftBody !== comment.body) onUpdate(comment.id, draftBody);
    setMode("view");
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMode("view");
      return;
    }
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    saveEdit();
  }

  function confirmDelete() {
    setMode("view");
    onDelete(comment.id);
  }

  const className = ["rc-item", active ? "rc-item-active" : "", orphaned ? "rc-item-orphaned" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={className}
      data-testid={`comment-${comment.id}`}
      data-status={comment.status}
      aria-current={active ? "true" : undefined}
    >
      {mode === "edit" ? (
        <div className="rc-item-main">
          <span className="rc-label">{label}</span>
          <textarea
            className="rc-textarea"
            aria-label="コメントの編集"
            value={draft}
            rows={3}
            ref={focusAtEnd}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleEditKeyDown}
          />
        </div>
      ) : (
        <button
          type="button"
          className="rc-item-main rc-select"
          onClick={() => onSelect(comment.id)}
        >
          <span className="rc-item-head">
            {number !== undefined && (
              <span className="rc-number" aria-label={`コメント ${number}`}>
                {number}
              </span>
            )}
            <span className="rc-label">{label}</span>
            {time && <span className="rc-time">{time}</span>}
          </span>
          {orphaned && <span className="rc-orphaned">{ORPHANED_MESSAGE}</span>}
          <span className="rc-body">{comment.body}</span>
        </button>
      )}

      {mode === "view" && (
        <div className="rc-actions">
          <button type="button" className="rc-button" onClick={startEdit}>
            編集
          </button>
          <button
            type="button"
            className="rc-button rc-button-danger"
            onClick={() => setMode("confirm-delete")}
          >
            削除
          </button>
        </div>
      )}

      {mode === "edit" && (
        <div className="rc-actions">
          <button
            type="button"
            className="rc-button rc-button-primary"
            disabled={draftBody === ""}
            onClick={saveEdit}
          >
            保存
          </button>
          <button type="button" className="rc-button" onClick={() => setMode("view")}>
            キャンセル
          </button>
        </div>
      )}

      {mode === "confirm-delete" && (
        <div className="rc-confirm" role="alertdialog" aria-label="削除の確認">
          <p className="rc-confirm-message">このコメントを削除しますか？</p>
          <div className="rc-actions">
            <button type="button" className="rc-button rc-button-danger" onClick={confirmDelete}>
              削除する
            </button>
            <button type="button" className="rc-button" autoFocus onClick={() => setMode("view")}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
