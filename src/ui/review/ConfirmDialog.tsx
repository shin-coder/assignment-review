import { useEffect, useId, useLayoutEffect, useRef } from "react";

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  /** 取り消せない操作なら true（ボタンを赤くする） */
  danger?: boolean;
  confirmTestId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 確認のダイアログ。Escape・背景のクリックで閉じる。最初のフォーカスは「キャンセル」に置く */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { onCancel } = props;
  // 親が毎回新しい関数を渡しても、フォーカスを取り直したりリスナーを付け直したりしない
  const onCancelRef = useRef(onCancel);
  useLayoutEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="dialog-title">
          {props.title}
        </h2>
        <p id={descriptionId} className="dialog-description">
          {props.description}
        </p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className={props.danger ? "btn btn-danger" : "btn btn-primary"}
            data-testid={props.confirmTestId}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
