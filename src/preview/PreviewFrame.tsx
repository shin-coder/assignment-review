import { useCallback, useEffect, useEffectEvent, useRef, useState, type Ref } from "react";
import { previewUrl, type FrameToParentMessage, type VirtualFile } from "../shared";
import { onFrameMessage } from "./frame-messages";
import { putFiles } from "./worker-client";

export interface PreviewFrameProps {
  /** Service Worker 上のセッション。変わったら読み込み中表示に戻してから新しいセッションを表示する */
  sessionId: string;
  /**
   * プレビュー用に変換済みのファイル群（data-review-id と操作スクリプトの挿入は呼び出し側で行う）。
   * 配列が変わるたびに Service Worker に送り直すので、内容が変わったときだけ新しい配列を渡す
   */
  files: readonly VirtualFile[];
  /** iframe で開くファイルのパス（例: "index.html"） */
  entryPath: string;
  /**
   * registerPreviewWorker() の Promise。起動時に 1 回だけ呼んだものを渡す。
   * 解決する（このページが Service Worker の制御下に入る）までは iframe を描画しない
   */
  workerReady: Promise<unknown>;
  /**
   * 変わったら iframe を作り直す（JS を編集したときに使う）。新しいファイルを送り終えるまでは
   * 前の iframe を表示したままにし、送り終えたら新しい iframe に差し替える
   */
  rebuildKey?: string | number;
  /** iframe の title（アクセシビリティ用） */
  title?: string;
  className?: string;
  /** iframe の要素。postToFrame() に渡すときに使う */
  ref?: Ref<HTMLIFrameElement>;
  /** iframe の load イベント（生徒サイト内のリンクで別ページに移動したときも呼ばれる） */
  onLoad?: (iframe: HTMLIFrameElement) => void;
  /** 操作スクリプトから review:ready を受け取った */
  onReady?: (iframe: HTMLIFrameElement) => void;
  /** 操作スクリプトからのメッセージ（review:ready を含む）。型ガードと送信元の確認を通ったものだけ */
  onMessage?: (message: FrameToParentMessage, iframe: HTMLIFrameElement) => void;
  /** Service Worker の準備かファイルの送信に失敗した */
  onError?: (error: Error) => void;
  /** ファイルを Service Worker に送る関数。既定は putFiles（テストで差し替える） */
  sendFiles?: (sessionId: string, files: readonly VirtualFile[]) => Promise<void>;
}

/** 表示中の iframe を作ったときのセッションと rebuildKey */
interface FrameKey {
  sessionId: string;
  rebuildKey: string | number | undefined;
}

interface FailedState extends FrameKey {
  error: Error;
}

function sameKey(a: FrameKey | null, b: FrameKey): boolean {
  return a !== null && a.sessionId === b.sessionId && a.rebuildKey === b.rebuildKey;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * プレビューの iframe。Service Worker の準備とファイルの送信が終わってから iframe を描画する。
 * iframe の中身（生徒サイト）は Service Worker が返すファイルそのもので、React では何も描画しない
 */
export function PreviewFrame({
  sessionId,
  files,
  entryPath,
  workerReady,
  rebuildKey,
  title = "プレビュー",
  className,
  ref,
  onLoad,
  onReady,
  onMessage,
  onError,
  sendFiles = putFiles,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // 送り終えた（iframe を表示してよい）セッションと rebuildKey
  const [shown, setShown] = useState<FrameKey | null>(null);
  const [failed, setFailed] = useState<FailedState | null>(null);

  const reportError = useEffectEvent((error: Error) => onError?.(error));

  // files・sessionId・rebuildKey が変わるたびに Service Worker へ送る。
  // files だけが変わったとき（CSS の編集など）は iframe をそのままにして送り直すだけ
  useEffect(() => {
    let cancelled = false;
    const key: FrameKey = { sessionId, rebuildKey };
    workerReady
      .then(() => sendFiles(sessionId, files))
      .then(
        () => {
          if (cancelled) return;
          setFailed(null);
          setShown((current) => (sameKey(current, key) ? current : key));
        },
        (reason: unknown) => {
          if (cancelled) return;
          const error = toError(reason);
          setFailed({ ...key, error });
          reportError(error);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [workerReady, sendFiles, sessionId, files, rebuildKey]);

  const handleMessage = useEffectEvent((message: FrameToParentMessage) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (message.type === "review:ready") onReady?.(iframe);
    onMessage?.(message, iframe);
  });

  useEffect(() => onFrameMessage(() => iframeRef.current, handleMessage), []);

  const setIframe = useCallback(
    (element: HTMLIFrameElement | null) => {
      iframeRef.current = element;
      assignRef(ref, element);
    },
    [ref],
  );

  const current: FrameKey = { sessionId, rebuildKey };
  const error = failed && sameKey(failed, current) ? failed.error : null;
  // 別のセッションに切り替えたら、前のセッションの iframe は表示しない
  const frame = shown && shown.sessionId === sessionId ? shown : null;

  return (
    <div className={className} data-testid="preview-frame">
      {error ? (
        <p role="alert">プレビューを表示できません: {error.message}</p>
      ) : frame === null ? (
        <p role="status">プレビューを準備しています…</p>
      ) : null}
      {frame && (
        <iframe
          // rebuildKey が変わったら key が変わり、iframe が作り直される
          key={`${frame.sessionId}\u0000${String(frame.rebuildKey)}`}
          ref={setIframe}
          title={title}
          src={previewUrl(frame.sessionId, entryPath)}
          onLoad={(event) => onLoad?.(event.currentTarget)}
          style={{ display: "block", width: "100%", height: "100%", border: 0 }}
        />
      )}
    </div>
  );
}
