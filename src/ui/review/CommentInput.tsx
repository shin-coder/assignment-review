import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isSubmitShortcut } from "../comments";
import { ArrowUpIcon } from "./icons";

export interface CommentInputProps {
  /** 前後の空白を取り除いた本文で呼ばれる。空の本文では呼ばれない */
  onSubmit: (body: string) => void;
  /** Escape で閉じる */
  onCancel: () => void;
  initialValue?: string;
  placeholder?: string;
  /** 送信ボタンのアクセシブルな名前 */
  submitLabel?: string;
  /** 入力欄のアクセシブルな名前 */
  inputLabel?: string;
  /** コメントできない理由。あれば入力を無効にして表示する */
  disabledReason?: string | null;
  /** disabledReason の欄に付ける data-testid */
  reasonTestId?: string;
  autoFocus?: boolean;
}

/** 入力に合わせて textarea の高さを伸ばす（上限を超えたらスクロール） */
function fitHeight(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

/**
 * Figma のコメント入力のような、送信ボタン付きの 1 つの入力欄。
 * Enter で送信、Shift + Enter で改行、Escape で閉じる
 */
export function CommentInput({
  onSubmit,
  onCancel,
  initialValue = "",
  placeholder = "コメントを追加",
  submitLabel = "コメントを追加",
  inputLabel = "コメント",
  disabledReason = null,
  reasonTestId,
  autoFocus = false,
}: CommentInputProps) {
  const [draft, setDraft] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = disabledReason !== null;
  const body = draft.trim();
  const canSubmit = !disabled && body !== "";

  useLayoutEffect(() => fitHeight(textareaRef.current), [draft]);
  useLayoutEffect(() => {
    if (!autoFocus || disabled) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus, disabled]);

  function submit() {
    if (!canSubmit) return;
    onSubmit(body);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    submit();
  }

  return (
    <form
      className="cinput"
      data-multiline={draft.includes("\n") || draft.length > 24 ? "true" : undefined}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        submit();
      }}
    >
      {disabled && (
        <p className="cinput-reason" role="status" data-testid={reasonTestId}>
          {disabledReason}
        </p>
      )}
      <div className="cinput-row">
        <textarea
          ref={textareaRef}
          className="cinput-text"
          aria-label={inputLabel}
          placeholder={placeholder}
          value={draft}
          rows={1}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="cinput-send"
          aria-label={submitLabel}
          title={submitLabel}
          disabled={!canSubmit}
        >
          <ArrowUpIcon size={18} />
        </button>
      </div>
    </form>
  );
}
