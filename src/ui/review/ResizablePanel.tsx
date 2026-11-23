import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export interface ResizablePanelProps {
  /** 幅を覚えておく localStorage のキー */
  storageKey: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  children: ReactNode;
}

const KEY_STEP = 24;

function clampWidth(width: number, min: number): number {
  const max = Math.max(min, Math.round(window.innerWidth * 0.7));
  return Math.round(Math.min(Math.max(width, min), max));
}

function loadWidth(key: string, fallback: number): number {
  try {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved > 0 ? saved : fallback;
  } catch {
    return fallback;
  }
}

function saveWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // 保存できなくても困らない（次回は既定の幅になるだけ）
  }
}

/** 右側のパネル。左端のつまみをドラッグ（または ← / → キー）して幅を変えられる */
export function ResizablePanel({
  storageKey,
  label,
  defaultWidth,
  minWidth = 280,
  children,
}: ResizablePanelProps) {
  const key = `review-tool:panel-width:${storageKey}`;
  const [width, setWidth] = useState(() => clampWidth(loadWidth(key, defaultWidth), minWidth));
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  function apply(next: number) {
    const clamped = clampWidth(next, minWidth);
    setWidth(clamped);
    saveWidth(key, clamped);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setResizing(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // 左端のつまみなので、左へ動かすほど広くなる
    setWidth(clampWidth(drag.startWidth + (drag.startX - event.clientX), minWidth));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setResizing(false);
    apply(width);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") apply(width + KEY_STEP);
    else if (event.key === "ArrowRight") apply(width - KEY_STEP);
    else return;
    event.preventDefault();
  }

  return (
    <aside
      className="side-panel"
      aria-label={label}
      style={{ width }}
      data-resizing={resizing ? "true" : undefined}
    >
      <div
        className="resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label}パネルの幅`}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setResizing(false);
        }}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => apply(defaultWidth)}
      />
      {children}
    </aside>
  );
}
