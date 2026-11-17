import { useSyncExternalStore } from "react";
import type { CommentPin } from "../../app/reviewController";
import type { ElementId, ReviewComment } from "../../shared";
import { CommentComposer, CommentList } from "../comments";
import type { FrameGeometry } from "./DeviceCanvas";
import { CloseIcon } from "./icons";
import type { RectStore } from "./rectStore";
import { relativeTime } from "./relativeTime";

const PIN_SIZE = 32;
/** 同じ要素に複数のコメントがあるとき、ピンを横にずらす幅 */
const PIN_GAP = PIN_SIZE + 4;
const POPOVER_WIDTH = 360;
/** 要素の矩形がまだ届いていないときに入力欄を出す位置 */
const FALLBACK_POINT = { x: 16, y: 16 };

export interface CommentLayerProps {
  geometry: FrameGeometry;
  rects: RectStore;
  pins: readonly CommentPin[];
  comments: readonly ReviewComment[];
  numbers: Record<string, number>;
  labels: Record<string, string>;
  activeCommentId: string | null;
  selectedId: ElementId | null;
  selectedLabel: string | null;
  /** コメントできない理由。JS 生成要素なら generated を true にする */
  disabledReason: string | null;
  generated: boolean;
  onSelectComment: (id: string) => void;
  onAddComment: (body: string) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * プレビューの上に重ねるコメントの層（Figma のコメントのように、要素の左上にピンを立てる）。
 * - ピンを押すとそのコメントを開く
 * - 要素を選んでいてコメントを開いていなければ、要素の横に入力欄を出す
 */
export function CommentLayer(props: CommentLayerProps) {
  const rectMap = useSyncExternalStore(props.rects.subscribe, props.rects.get);
  const { geometry } = props;
  const { scale } = geometry;

  /** 要素の左上（画面上の座標）。ビューポートの外なら null */
  function anchorOf(elementId: ElementId): Point | null {
    const rect = rectMap.get(elementId);
    if (!rect) return null;
    if (rect.y + rect.height <= 0 || rect.y >= geometry.frameHeight) return null;
    if (rect.x + rect.width <= 0 || rect.x >= geometry.frameWidth) return null;
    return { x: Math.max(0, rect.x) * scale, y: Math.max(0, rect.y) * scale };
  }

  const pinPoints = new Map<string, Point>();
  const perElement = new Map<ElementId, number>();
  for (const pin of props.pins) {
    const anchor = anchorOf(pin.elementId);
    if (!anchor) continue;
    const index = perElement.get(pin.elementId) ?? 0;
    perElement.set(pin.elementId, index + 1);
    pinPoints.set(pin.commentId, { x: anchor.x + index * PIN_GAP, y: anchor.y });
  }

  const active =
    props.activeCommentId === null
      ? null
      : (props.comments.find((comment) => comment.id === props.activeCommentId) ?? null);
  const activePoint = active ? (pinPoints.get(active.id) ?? null) : null;
  const composing =
    activePoint === null && (props.selectedId !== null || props.generated) ? true : false;
  const composerPoint = composing
    ? ((props.selectedId !== null ? anchorOf(props.selectedId) : null) ?? FALLBACK_POINT)
    : null;

  function popoverStyle(point: Point) {
    // 右に出すと入りきらなければ左に出す（キャンバスの余白まではみ出してよい）
    const right = point.x + PIN_SIZE + 8;
    const fitsRight = right + POPOVER_WIDTH <= geometry.width + geometry.roomRight - 16;
    const left = fitsRight ? right : Math.max(-geometry.roomLeft + 16, point.x - POPOVER_WIDTH - 8);
    const top = Math.min(Math.max(point.y - PIN_SIZE, 0), Math.max(0, geometry.height - 240));
    return { left, top, width: POPOVER_WIDTH };
  }

  return (
    <div className="comment-layer" data-testid="comment-layer">
      {props.pins.map((pin) => {
        const point = pinPoints.get(pin.commentId);
        if (!point) return null;
        const comment = props.comments.find((c) => c.id === pin.commentId);
        const number = props.numbers[pin.commentId];
        const isActive = pin.commentId === props.activeCommentId;
        return (
          <button
            key={pin.commentId}
            type="button"
            className="pin"
            data-testid={`pin-${pin.commentId}`}
            data-active={isActive ? "true" : undefined}
            aria-label={`コメント ${number ?? ""}を開く`}
            aria-pressed={isActive}
            style={{ left: point.x, top: point.y - PIN_SIZE }}
            onClick={() => (isActive ? props.onClose() : props.onSelectComment(pin.commentId))}
          >
            <span className="pin-number">{number}</span>
            {comment && !isActive && (
              <span className="pin-preview" aria-hidden="true">
                <span className="pin-preview-time">{relativeTime(comment.createdAt)}</span>
                <span className="pin-preview-body">{comment.body}</span>
              </span>
            )}
          </button>
        );
      })}

      {active && activePoint && (
        <div
          className="popover"
          role="dialog"
          aria-label="コメント"
          style={popoverStyle(activePoint)}
        >
          <PopoverHeader
            title={`コメント ${props.numbers[active.id] ?? ""}`}
            onClose={props.onClose}
          />
          <CommentList
            comments={[active]}
            labels={props.labels}
            activeId={null}
            ariaLabel="開いているコメント"
            formatTime={relativeTime}
            onSelect={() => undefined}
            onUpdate={props.onUpdateComment}
            onDelete={props.onDeleteComment}
          />
        </div>
      )}

      {composerPoint && (
        <div
          className="popover"
          role="dialog"
          aria-label="コメントを追加"
          data-testid="comment-composer"
          style={popoverStyle(composerPoint)}
        >
          <PopoverHeader title="コメントを追加" onClose={props.onClose} />
          <CommentComposer
            // 要素を選び直したら入力中の下書きを捨てる
            key={props.selectedId ?? "none"}
            targetLabel={props.selectedLabel}
            disabledReason={props.disabledReason}
            reasonTestId={props.generated ? "generated-notice" : undefined}
            autoFocus
            onSubmit={props.onAddComment}
            onCancel={props.onClose}
          />
        </div>
      )}
    </div>
  );
}

function PopoverHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="popover-header">
      <span className="popover-title">{title}</span>
      <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
        <CloseIcon size={18} />
      </button>
    </div>
  );
}
