import { useState, useSyncExternalStore } from "react";
import type { CommentPin } from "../../app/reviewController";
import { clampPinPoint, type ElementId, type PinPoint, type ReviewComment } from "../../shared";
import { CommentInput } from "./CommentInput";
import type { FrameGeometry } from "./DeviceCanvas";
import { CloseIcon } from "./icons";
import { MoreMenu } from "./MoreMenu";
import type { RectStore } from "./rectStore";
import { relativeTime } from "./relativeTime";

const PIN_SIZE = 32;
/** 同じ要素で位置の決まっていないピンを横にずらす幅（画面上の px） */
const PIN_GAP = PIN_SIZE + 4;
const POPOVER_WIDTH = 340;
/** 要素の矩形がまだ届いていないときに入力欄を出す位置 */
const FALLBACK_POINT = { x: 16, y: 16 };
const TOP_LEFT: PinPoint = { x: 0, y: 0 };

export const ORPHANED_MESSAGE = "対応する要素が編集で削除されました";

export interface CommentLayerProps {
  geometry: FrameGeometry;
  rects: RectStore;
  pins: readonly CommentPin[];
  comments: readonly ReviewComment[];
  numbers: Record<string, number>;
  activeCommentId: string | null;
  selectedId: ElementId | null;
  /** 要素をクリックした位置（要素に対する割合） */
  selectedPoint: PinPoint | null;
  /** コメントできない理由（ソースに開始タグのない要素など）。コメントできるなら null */
  disabledReason: string | null;
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
 * ピンの置き方。ピンの先（とがった角）が point に来るように置く。
 * 枠の上端・右端の近くでは、ピンの本体が枠の外（プロジェクト名などの上）にはみ出さないよう、
 * 下向き・左向きに反転する
 */
function placePin(point: Point, geometry: FrameGeometry) {
  const flipY = point.y < PIN_SIZE;
  const flipX = point.x + PIN_SIZE > geometry.width;
  return {
    style: {
      left: flipX ? point.x - PIN_SIZE : point.x,
      top: flipY ? point.y : point.y - PIN_SIZE,
    },
    flip: flipX || flipY ? `${flipY ? "down" : "up"}-${flipX ? "left" : "right"}` : undefined,
  };
}

/**
 * プレビューの上に重ねるコメントの層（Figma のコメントのように、クリックした場所にピンを立てる）。
 * ピンは要素に紐付いていて、要素の中の割合で位置を持つ。プレビューの幅を変えても、
 * スクロールしても、要素の中の同じあたりに立つ（ピンは動かせない）。
 * - ピンを押すとそのコメントを開く
 * - コメントを開いていなければ、クリックした場所に入力欄を出す
 */
export function CommentLayer(props: CommentLayerProps) {
  const rectMap = useSyncExternalStore(props.rects.subscribe, props.rects.get);
  const { geometry } = props;
  const { scale } = geometry;

  /** 要素の中の割合 point の位置（画面上の座標）。ビューポートの外なら null */
  function pointOf(elementId: ElementId, point: PinPoint): Point | null {
    const rect = rectMap.get(elementId);
    if (!rect) return null;
    const { x: rx, y: ry } = clampPinPoint(point);
    const x = rect.x + rect.width * rx;
    const y = rect.y + rect.height * ry;
    if (y < 0 || y > geometry.frameHeight || x < 0 || x > geometry.frameWidth) return null;
    return { x: x * scale, y: y * scale };
  }

  const pinPoints = new Map<string, Point>();
  const unplaced = new Map<ElementId, number>();
  const commentById = new Map(props.comments.map((comment) => [comment.id, comment]));
  for (const pin of props.pins) {
    const saved = commentById.get(pin.commentId)?.pin;
    const point = pointOf(pin.elementId, saved ?? TOP_LEFT);
    if (!point) continue;
    if (saved) {
      pinPoints.set(pin.commentId, point);
      continue;
    }
    // 位置の分からない（古い）コメントは要素の左上に立て、重ならないよう横にずらす
    const index = unplaced.get(pin.elementId) ?? 0;
    unplaced.set(pin.elementId, index + 1);
    pinPoints.set(pin.commentId, { x: point.x + index * PIN_GAP, y: point.y });
  }

  const active =
    props.activeCommentId === null ? null : (commentById.get(props.activeCommentId) ?? null);
  const activePoint = active ? (pinPoints.get(active.id) ?? null) : null;
  const composing = activePoint === null && props.selectedId !== null;
  const composerPoint = composing
    ? (pointOf(props.selectedId!, props.selectedPoint ?? TOP_LEFT) ?? FALLBACK_POINT)
    : null;

  function popoverStyle(point: Point) {
    // ピンの右に出す。入りきらなければ左に出す（キャンバスの余白まではみ出してよい）
    const right = point.x + PIN_SIZE + 8;
    const fitsRight = right + POPOVER_WIDTH <= geometry.width + geometry.roomRight - 16;
    const left = fitsRight ? right : Math.max(-geometry.roomLeft + 16, point.x - POPOVER_WIDTH - 8);
    const top = Math.min(Math.max(point.y - PIN_SIZE, 0), Math.max(0, geometry.height - 200));
    return { left, top, width: POPOVER_WIDTH };
  }

  return (
    <div className="comment-layer" data-testid="comment-layer">
      {props.pins.map((pin) => {
        const point = pinPoints.get(pin.commentId);
        if (!point) return null;
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
            aria-label={`コメント ${number ?? ""}を開く`}
            aria-pressed={isActive}
            style={placePin(point, geometry).style}
            data-flip={placePin(point, geometry).flip}
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
        <CommentThread
          key={active.id}
          comment={active}
          number={props.numbers[active.id]}
          style={popoverStyle(activePoint)}
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
            style={placePin(composerPoint, geometry).style}
            data-flip={placePin(composerPoint, geometry).flip}
          />
          <div
            className="popover popover-composer"
            role="dialog"
            aria-label="コメントを追加"
            data-testid="comment-composer"
            style={popoverStyle(composerPoint)}
          >
            <CommentInput
              // 別の場所をクリックし直したら入力中の下書きを捨てる
              key={`${props.selectedId ?? "none"}:${props.selectedPoint?.x ?? ""}:${props.selectedPoint?.y ?? ""}`}
              disabledReason={props.disabledReason}
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
