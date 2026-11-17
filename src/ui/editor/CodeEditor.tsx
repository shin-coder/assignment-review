import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SourceLocation } from "../../shared";
import { EditorController } from "./editorController";
import { getEditorLanguage, requiresApply } from "./language";

export interface CodeEditorProps {
  /** 開いているファイルのパス（正規化済み） */
  path: string;
  /** ファイルの内容。ArrayBuffer（画像などのバイナリ）ならエディタを開かない */
  value: string | ArrayBuffer;
  /** バイナリファイルのプレビューに使う。image/* なら画像を表示する */
  mimeType?: string;
  /**
   * 編集後のテキストを受け取る。HTML / CSS などは入力が CHANGE_DEBOUNCE_MS 止まったら、
   * JS は「適用」したときに呼ぶ。path はその編集をしたファイル（ファイルを切り替えた直後に
   * 前のファイルの保留中の変更を渡すことがあるため、path で振り分けるか key={path} を付けて使う）
   */
  onChange: (text: string, path: string) => void;
  /** 強調表示する範囲。path と別のファイルの位置なら何もしない */
  highlight: SourceLocation | null;
  /** ユーザーの操作でカーソルが動いたときのオフセット */
  onCursorChange?: (offset: number) => void;
  readOnly?: boolean;
  /** 元のソースから編集されているか。「元に戻す」ボタンの有効・無効に使う */
  modified?: boolean;
  /** 「元に戻す」ボタンが押された。元のソースに戻した value を渡し直すのは親の役目 */
  onReset?: () => void;
  /** false ならファイル名・「適用」・「元に戻す」の行を出さない（呼び出し側が見出しを持つとき） */
  showToolbar?: boolean;
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    fontSize: "16px",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "6px 12px",
    borderBottom: "1px solid #ddd",
    flexWrap: "wrap",
  },
  path: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontWeight: "bold" },
  spacer: { flex: 1 },
  draft: { color: "#b35c00" },
  host: { flex: 1, minHeight: 0, overflow: "hidden" },
  binary: { padding: "16px", overflow: "auto" },
  image: { maxWidth: "100%", height: "auto", background: "#f4f4f4" },
} satisfies Record<string, CSSProperties>;

/** HTML / CSS / JS をその場で編集するコードエディタ。バイナリファイルは編集できない旨を表示する */
export function CodeEditor(props: CodeEditorProps) {
  const { path, value, mimeType } = props;
  const binary = typeof value !== "string";
  return (
    <div
      data-testid="code-editor"
      data-path={path}
      data-language={binary ? "binary" : getEditorLanguage(path)}
      style={styles.root}
    >
      {typeof value === "string" ? (
        <TextEditor {...props} value={value} />
      ) : (
        <BinaryFileView path={path} content={value} mimeType={mimeType} />
      )}
    </div>
  );
}

type TextEditorProps = CodeEditorProps & { value: string };

function TextEditor({
  path,
  value,
  onChange,
  highlight,
  onCursorChange,
  readOnly = false,
  modified = false,
  onReset,
  showToolbar = true,
}: TextEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EditorController | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  // EditorView の監視から呼ぶため、最新のコールバックを ref に置く
  const callbacksRef = useRef({ onChange, onCursorChange });
  useLayoutEffect(() => {
    callbacksRef.current = { onChange, onCursorChange };
  });
  // エディタの作成時にだけ使う初期値。以降の変化は下の effect で反映する
  const initialRef = useRef({ path, value, readOnly });

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const controller = new EditorController({
      parent,
      ...initialRef.current,
      callbacks: {
        onChange: (text, filePath) => callbacksRef.current.onChange(text, filePath),
        onCursorChange: (offset) => callbacksRef.current.onCursorChange?.(offset),
        onDraftChange: setHasDraft,
      },
    });
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.sync(path, value);
  }, [path, value]);

  useEffect(() => {
    controllerRef.current?.setReadOnly(readOnly);
  }, [readOnly]);

  // 親が毎回新しいオブジェクトを渡しても、同じ範囲なら再スクロールしないよう値で比べる
  const highlightPath = highlight?.filePath;
  const highlightStart = highlight?.start;
  const highlightEnd = highlight?.end;
  useEffect(() => {
    controllerRef.current?.setHighlight(
      highlightPath === undefined || highlightStart === undefined || highlightEnd === undefined
        ? null
        : { filePath: highlightPath, start: highlightStart, end: highlightEnd },
    );
  }, [path, highlightPath, highlightStart, highlightEnd]);

  const apply = useCallback(() => {
    controllerRef.current?.commit();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.discardPending();
    onReset?.();
  }, [onReset]);

  const needsApply = requiresApply(path);

  return (
    <>
      <div style={showToolbar ? styles.toolbar : { display: "none" }}>
        <span style={styles.path} title={path}>
          {path}
        </span>
        {readOnly && <span>（読み取り専用）</span>}
        <span style={styles.spacer} />
        {needsApply && (
          <>
            {hasDraft && <span style={styles.draft}>未適用の変更があります</span>}
            <button
              type="button"
              onClick={apply}
              disabled={!hasDraft || readOnly}
              title="JS の変更をプレビューに反映します（Ctrl / ⌘ + Enter）"
            >
              適用
            </button>
          </>
        )}
        {onReset && (
          <button
            type="button"
            onClick={reset}
            disabled={!modified && !hasDraft}
            title="このファイルを元のソースに戻します"
          >
            元に戻す
          </button>
        )}
      </div>
      <div ref={hostRef} style={styles.host} />
    </>
  );
}

interface BinaryFileViewProps {
  path: string;
  content: ArrayBuffer;
  mimeType?: string;
}

/** 画像なら表示し、それ以外は「編集できません」とだけ表示する */
function BinaryFileView({ path, content, mimeType }: BinaryFileViewProps) {
  const isImage = mimeType?.startsWith("image/") ?? false;
  // オブジェクト URL は img が DOM にある間だけ作り、外れたら解放する（React 19 の ref のクリーンアップ）
  const imageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return;
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [content, mimeType],
  );

  return (
    <div style={styles.binary} data-testid="binary-file">
      <p>
        <strong>{path}</strong> はテキストではないため、エディタでは編集できません。
      </p>
      {isImage && <img ref={imageRef} alt={path} style={styles.image} />}
    </div>
  );
}
