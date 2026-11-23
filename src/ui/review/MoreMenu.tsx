import { useEffect, useRef, useState } from "react";
import { MoreIcon } from "./icons";

export interface MoreMenuItem {
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

export interface MoreMenuProps {
  /** ボタンのアクセシブルな名前 */
  label: string;
  items: MoreMenuItem[];
  className?: string;
  /** 暗い背景の上に置くとき */
  dark?: boolean;
}

/** 「…」ボタンと、押すと出る小さなメニュー */
export function MoreMenu({ label, items, className, dark = false }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <div
      ref={rootRef}
      className={["more", dark ? "more-dark" : "", className ?? ""].filter(Boolean).join(" ")}
      data-open={open ? "true" : undefined}
    >
      <button
        type="button"
        className="more-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "more-item more-item-danger" : "more-item"}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
