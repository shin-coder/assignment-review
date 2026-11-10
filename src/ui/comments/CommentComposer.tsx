import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { isSubmitShortcut } from "./keyboard";
import "./comments.css";

export interface CommentComposerProps {
  /** コメントの対象の表示名（例: "div#main.card"）。要素を選んでいなければ null */
  targetLabel: string | null;
  /** コメントできない理由（例: JS が生成した要素を選んだとき）。コメントできるなら null */
  disabledReason: string | null;
  /** 前後の空白を取り除いた本文で呼ばれる。空の本文では呼ばれない */
  onSubmit: (body: string) => void;
}

/** 要素を選んでいないときに表示する理由 */
export const NO_TARGET_REASON = "コメントする要素を選択してください";

/** 選択中の要素へのコメント入力欄 */
export function CommentComposer({ targetLabel, disabledReason, onSubmit }: CommentComposerProps) {
  const [draft, setDraft] = useState("");
  const reasonId = useId();
  const reason = disabledReason ?? (targetLabel === null ? NO_TARGET_REASON : null);
  const disabled = reason !== null;
  const body = draft.trim();
  const canSubmit = !disabled && body !== "";

  function submit() {
    if (!canSubmit) return;
    onSubmit(body);
    setDraft("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    submit();
  }

  return (
    <form className="rc-composer" onSubmit={handleSubmit} aria-label="コメントの入力">
      <p className="rc-composer-target">
        対象: <span className="rc-label">{targetLabel ?? "なし"}</span>
      </p>
      {reason !== null && (
        <p id={reasonId} className="rc-composer-reason" role="status">
          {reason}
        </p>
      )}
      <textarea
        className="rc-textarea"
        aria-label="コメント"
        aria-describedby={reason !== null ? reasonId : undefined}
        placeholder={disabled ? "" : "コメントを入力（Ctrl / Cmd + Enter で追加）"}
        value={draft}
        disabled={disabled}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="rc-actions">
        <button type="submit" className="rc-button rc-button-primary" disabled={!canSubmit}>
          コメントを追加
        </button>
      </div>
    </form>
  );
}
