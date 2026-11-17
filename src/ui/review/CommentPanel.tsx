import type { ReviewComment } from "../../shared";
import { CommentList } from "../comments";
import { CommentIcon } from "./icons";
import { relativeTime } from "./relativeTime";

export interface CommentPanelProps {
  comments: readonly ReviewComment[];
  labels: Record<string, string>;
  numbers: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, body: string) => void;
}

/** コメントモードの右側のパネル。すべてのコメント（要素が消えたものも）を並べる */
export function CommentPanel(props: CommentPanelProps) {
  return (
    <aside className="side-panel" aria-label="コメント">
      <header className="side-panel-header">
        <h2 className="side-panel-title">コメント</h2>
        <span className="count-badge">{props.comments.length}</span>
      </header>
      <div className="side-panel-body">
        {props.comments.length === 0 ? (
          <div className="panel-empty">
            <CommentIcon size={28} />
            <p>
              プレビューの要素をクリックすると、
              <br />
              そこにコメントを付けられます
            </p>
          </div>
        ) : (
          <CommentList
            comments={[...props.comments]}
            labels={props.labels}
            numbers={props.numbers}
            activeId={props.activeId}
            formatTime={relativeTime}
            onSelect={props.onSelect}
            onDelete={props.onDelete}
            onUpdate={props.onUpdate}
          />
        )}
      </div>
    </aside>
  );
}
