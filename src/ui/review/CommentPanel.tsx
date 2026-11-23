import type { ReviewComment } from "../../shared";
import { ORPHANED_MESSAGE } from "./CommentLayer";
import { CommentIcon } from "./icons";
import { MoreMenu } from "./MoreMenu";
import { relativeTime } from "./relativeTime";

export interface CommentPanelProps {
  /** 並べる順（ピンの番号順）に並べたコメント */
  comments: readonly ReviewComment[];
  numbers: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * コメントモードの右側のパネル。すべてのコメント（要素が消えたものも）を並べる。
 * 編集はコメントを開いたところでだけ行い、ここではホバーで出る「…」から削除だけできる
 */
export function CommentPanel(props: CommentPanelProps) {
  return (
    <>
      <header className="side-panel-header">
        <h2 className="side-panel-title">コメント</h2>
        <span className="count-badge">{props.comments.length}</span>
      </header>
      <div className="side-panel-body">
        {props.comments.length === 0 ? (
          <div className="panel-empty">
            <CommentIcon size={28} />
            <p>
              プレビューをクリックすると、
              <br />
              その場所にコメントを付けられます
            </p>
          </div>
        ) : (
          <ul className="clist" aria-label="コメント一覧">
            {props.comments.map((comment) => {
              const active = comment.id === props.activeId;
              const orphaned = comment.status === "orphaned";
              return (
                <li
                  key={comment.id}
                  className="clist-item"
                  data-testid={`comment-${comment.id}`}
                  data-status={comment.status}
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="clist-main"
                    onClick={() => props.onSelect(comment.id)}
                  >
                    <span className="clist-head">
                      <span className="clist-number">{props.numbers[comment.id]}</span>
                      <span className="clist-time">{relativeTime(comment.createdAt)}</span>
                    </span>
                    {orphaned && <span className="clist-orphaned">{ORPHANED_MESSAGE}</span>}
                    <span className="clist-body">{comment.body}</span>
                  </button>
                  <MoreMenu
                    className="clist-more"
                    label="コメントの操作"
                    items={[
                      { label: "削除", danger: true, onSelect: () => props.onDelete(comment.id) },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
