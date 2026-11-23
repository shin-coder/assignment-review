import { useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import type { CommentPin } from "../../app/reviewController";
import type { ElementId, PinOffset, ReviewComment } from "../../shared";
import { CommentInput } from "./CommentInput";
import type { FrameGeometry } from "./DeviceCanvas";
import { CloseIcon } from "./icons";
import { MoreMenu } from "./MoreMenu";
import type { RectStore } from "./rectStore";
import { relativeTime } from "./relativeTime";

const PIN_SIZE = 32;
/** 同じ要素で位置の決まっていないピンを横にずらす幅（CSS px） */
const PIN_GAP = PIN_SIZE + 4;
const POPOVER_WIDTH = 340;
/** これ以上動いたらクリックではなくドラッグとみなす（画面上の px） */
const DRAG_THRESHOLD = 3;
/** 要素の矩形がまだ届いていないときに入力欄を出す位置 */
const FALLBACK_POINT = { x: 16, y: 16 };

export const ORPHANED_MESSAGE = "対応する要素が編集で削除されました";

export interface CommentLayerProps {
  geometry: FrameGeometry;
  rects: RectStore;
  pins: readonly CommentPin[];
  comments: readonly ReviewComment[];
  numbers: Record<string, number>;
  activeCommentId: string | null;
  selectedId: ElementId | null;
  /** 要素をクリックした位置（要素の左上からのずれ） */
  selectedPoint: PinOffset | null;
  /** コメントできない理由。JS 生成要素なら generated を true にする */
  disabledReason: string | null;
  generated: boolean;
  onSelectComment: (id: string) => void;
  onAddComment: (body: string) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
  onMoveComment: (id: string, pin: PinOffset) => void;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Drag {
  commentId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

/**
 * プレビューの上に重ねるコメントの層（Figma のコメントのように、クリックした場所にピンを立てる）。
 * - ピンを押すとそのコメントを開き、ドラッグすると位置を動かせる
 * - 要素を選んでいてコメントを開いていなければ、その場所に入力欄を出す
 */
export function CommentLayer(props: CommentLayerProps) {
  const rectMap = useSyncExternalStore(props.rects.subscribe, props.rects.get);
  const { geometry } = props;
  const { scale } = geometry;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグの直後に来るクリックを無視する */
  const suppressClickRef = useRef(false);

  /** 要素の左上に offset を足した点（画面上の座標）。ビューポートの外なら null */
  function pointOf(elementId: ElementId, offset: PinOffset): Point | null {
    const rect = rectMap.get(elementId);
    if (!rect) return null;
    const x = rect.x + offset.x;
    const y = rect.y + offset.y;
    if (y < 0 || y > geometry.frameHeight || x < 0 || x > geometry.frameWidth) return null;
    return { x: x * scale, y: y * scale };
  }

  const offsets = new Map<string, PinOffset>();
  const pinPoints = new Map<string, Point>();
  const unplaced = new Map<ElementId, number>();
  const commentById = new Map(props.comments.map((comment) => [comment.id, comment]));
  for (const pin of props.pins) {
    let offset = commentById.get(pin.commentId)?.pin;
    if (!offset) {
      const index = unplaced.get(pin.elementId) ?? 0;
      unplaced.set(pin.elementId, index + 1);
      offset = { x: (index * PIN_GAP) / scale, y: 0 };
    }
    offsets.set(pin.commentId, offset);
    const point = pointOf(pin.elementId, offset);
    if (point) pinPoints.set(pin.commentId, point);
  }

  const active =
    props.activeCommentId === null ? null : (commentById.get(props.activeCommentId) ?? null);
  const activePoint = active ? (pinPoints.get(active.id) ?? null) : null;
  const composing = activePoint === null && (props.selectedId !== null || props.generated);
  const composerPoint = composing
    ? ((props.selectedId !== null
        ? pointOf(props.selectedId, props.selectedPoint ?? { x: 0, y: 0 })
        : null) ?? FALLBACK_POINT)
    : null;

  function moved(point: Point, commentId: string): Point {
    if (!drag || drag.commentId !== commentId || !drag.moved) return point;
    return { x: point.x + drag.dx, y: point.y + drag.dy };
  }

  function popoverStyle(point: Point) {
    // ピンの右に出す。入りきらなければ左に出す（キャンバスの余白まではみ出してよい）
    const right = point.x + PIN_SIZE + 8;
    const fitsRight = right + POPOVER_WIDTH <= geometry.width + geometry.roomRight - 16;
    const left = fitsRight ? right : Math.max(-geometry.roomLeft + 16, point.x - POPOVER_WIDTH - 8);
    const top = Math.min(Math.max(point.y - PIN_SIZE, 0), Math.max(0, geometry.height - 200));
    return { left, top, width: POPOVER_WIDTH };
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, commentId: string) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: Drag = {
      commentId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const next = {
      ...current,
      dx,
      dy,
      moved: current.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!current.moved) return;
    suppressClickRef.current = true;
    const offset = offsets.get(current.commentId) ?? { x: 0, y: 0 };
    props.onMoveComment(current.commentId, {
      x: offset.x + current.dx / scale,
      y: offset.y + current.dy / scale,
    });
  }

  return (
    <div
      className="comment-layer"
      data-testid="comment-layer"
      data-dragging={drag?.moved ? "true" : undefined}
    >
      {props.pins.map((pin) => {
        const base = pinPoints.get(pin.commentId);
        if (!base) return null;
        const point = moved(base, pin.commentId);
        const comment = commentById.get(pin.commentId);
        const number = props.numbers[pin.commentId];
        const isActive = pin.commentId === props.activeCommentId;
        return (
          <button
            key={pin.commentId}
            type="button"
            className="pin"
            data-testid={`pin-${pin.commentId}`}
            data-active={isActive ? "true" : undefined}
            data-dragging={drag?.commentId === pin.commentId && drag.moved ? "true" : undefined}
            aria-label={`コメント ${number ?? ""}を開く`}
            aria-pressed={isActive}
            style={{ left: point.x, top: point.y - PIN_SIZE }}
            onPointerDown={(event) => handlePointerDown(event, pin.commentId)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragRef.current = null;
              setDrag(null);
            }}
            onClick={(event) => {
              // ドラッグの終わりのクリックは無視する（pointerup の後に来る）
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                event.preventDefault();
                return;
              }
              if (isActive) props.onClose();
              else props.onSelectComment(pin.commentId);
            }}
          >
            <span className="pin-number">{number}</span>
            {comment && !isActive && !drag && (
              <span className="pin-preview" aria-hidden="true">
                <span className="pin-preview-time">{relativeTime(comment.createdAt)}</span>
                <span className="pin-preview-body">{comment.body}</span>
              </span>
            )}
          </button>
        );
      })}

      {active && activePoint && (
        <CommentThread
          key={active.id}
          comment={active}
          number={props.numbers[active.id]}
          style={popoverStyle(moved(activePoint, active.id))}
          onClose={props.onClose}
          onUpdate={(body) => props.onUpdateComment(active.id, body)}
          onDelete={() => props.onDeleteComment(active.id)}
        />
      )}

      {composerPoint && (
        <>
          <span
            className="pin pin-draft"
            aria-hidden="true"
            style={{ left: composerPoint.x, top: composerPoint.y - PIN_SIZE }}
          />
          <div
            className="popover popover-composer"
            role="dialog"
            aria-label="コメントを追加"
            data-testid="comment-composer"
            style={popoverStyle(composerPoint)}
          >
            <CommentInput
              // 要素を選び直したら入力中の下書きを捨てる
              key={`${props.selectedId ?? "none"}:${props.selectedPoint?.x ?? ""}:${props.selectedPoint?.y ?? ""}`}
              disabledReason={props.disabledReason}
              reasonTestId={props.generated ? "generated-notice" : undefined}
              autoFocus
              onSubmit={props.onAddComment}
              onCancel={props.onClose}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CommentThread({
  comment,
  number,
  style,
  onClose,
  onUpdate,
  onDelete,
}: {
  comment: ReviewComment;
  number: number | undefined;
  style: { left: number; top: number; width: number };
  onClose: () => void;
  onUpdate: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="popover popover-thread" role="dialog" aria-label="コメント" style={style}>
      <div className="thread-header">
        <span className="thread-title">コメント</span>
        <MoreMenu
          dark
          label="コメントの操作"
          items={[
            { label: "編集", onSelect: () => setEditing(true) },
            { label: "削除", danger: true, onSelect: onDelete },
          ]}
        />
        <button type="button" className="thread-icon" aria-label="閉じる" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="thread-body">
        <div className="thread-meta">
          <span className="thread-number">{number}</span>
          <span className="thread-time">{relativeTime(comment.createdAt)}</span>
        </div>
        {comment.status === "orphaned" && <p className="thread-orphaned">{ORPHANED_MESSAGE}</p>}
        {editing ? (
          <CommentInput
            initialValue={comment.body}
            inputLabel="コメントの編集"
            submitLabel="保存"
            placeholder="コメントを編集"
            autoFocus
            onSubmit={(body) => {
              if (body !== comment.body) onUpdate(body);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="thread-text">{comment.body}</p>
        )}
      </div>
    </div>
  );
}
