import { useLayoutEffect, useRef, useState } from "react";
import { isHtmlPath } from "../../app/previewFiles";
import type { ReviewController, ReviewState } from "../../app/reviewController";
import { applySnippet, lineOf, snippetRange, type SnippetRange } from "../../app/snippet";
import type { SourceLocation } from "../../shared";
import type { SourceStore } from "../../store";
import { CodeEditor, FileTabs } from "../editor";
import { CodeIcon, FileIcon } from "./icons";

export type DevView = "element" | "file";

export interface DevPanelProps {
  store: SourceStore;
  controller: ReviewController;
  state: ReviewState;
  view: DevView;
  onViewChange: (view: DevView) => void;
}

/** 開発モードの右側のパネル。「この要素」は選んだ要素のコードだけ、「ファイル」はファイル全体を出す */
export function DevPanel({ store, controller, state, view, onViewChange }: DevPanelProps) {
  const textPaths = store.paths().filter((path) => typeof store.getEdited(path) === "string");
  const relatedPaths = textPaths.filter((path) => /\.(css|js|mjs)$/i.test(path));

  function openFile(path: string) {
    controller.openFile(path);
    onViewChange("file");
  }

  return (
    <>
      <header className="side-panel-header">
        <h2 className="side-panel-title">開発</h2>
        <div className="segmented" role="radiogroup" aria-label="表示">
          <button
            type="button"
            role="radio"
            aria-checked={view === "element"}
            data-testid="dev-view-element"
            onClick={() => onViewChange("element")}
          >
            この要素
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={view === "file"}
            data-testid="dev-view-file"
            onClick={() => onViewChange("file")}
          >
            ファイル
          </button>
        </div>
      </header>

      {state.message && (
        <p role="alert" className="panel-notice" data-testid="app-message">
          {state.message}
        </p>
      )}

      {view === "element" ? (
        <ElementView
          store={store}
          controller={controller}
          state={state}
          relatedPaths={relatedPaths}
          onOpenFile={openFile}
          onShowInFile={() => {
            if (state.selectedLocation) controller.openFile(state.selectedLocation.filePath);
            onViewChange("file");
          }}
        />
      ) : (
        <FileView store={store} controller={controller} state={state} textPaths={textPaths} />
      )}
    </>
  );
}

function ElementView({
  store,
  controller,
  state,
  relatedPaths,
  onOpenFile,
  onShowInFile,
}: {
  store: SourceStore;
  controller: ReviewController;
  state: ReviewState;
  relatedPaths: string[];
  onOpenFile: (path: string) => void;
  onShowInFile: () => void;
}) {
  // 編集の途中で要素が見つからなくなっても（タグを書きかけたときなど）、
  // 利用者が選び直すまでは同じ範囲を編集し続ける
  const [session, setSession] = useState<{
    seq: number;
    location: SourceLocation;
  } | null>(() =>
    state.selectedLocation ? { seq: state.selectionSeq, location: state.selectedLocation } : null,
  );
  if (session?.seq !== state.selectionSeq && state.selectedLocation) {
    setSession({ seq: state.selectionSeq, location: state.selectedLocation });
  } else if (session && session.seq !== state.selectionSeq && !state.selectedLocation) {
    setSession(null);
  }

  let body;
  if (state.generatedNotice) {
    body = (
      <p className="panel-notice" role="status" data-testid="generated-notice">
        {state.generatedNotice}
      </p>
    );
  } else if (session === null) {
    body =
      state.selectedId === null ? (
        <div className="panel-empty">
          <CodeIcon size={28} />
          <p>
            プレビューの要素をクリックすると、
            <br />
            その要素のコードだけがここに出ます
          </p>
        </div>
      ) : (
        <p className="panel-notice" role="status">
          {state.selectedLabel}{" "}
          はソースに書かれていない要素（ブラウザが補ったもの）なので、コードを表示できません
        </p>
      );
  } else {
    body = (
      <SnippetEditor
        // 選び直したら作り直す（前の要素の保留中の変更は前の範囲に反映される）
        key={session.seq}
        store={store}
        location={session.location}
        label={state.selectedLabel}
        onChange={(path, text) => controller.editFile(path, text)}
        onShowInFile={onShowInFile}
      />
    );
  }

  return (
    <div className="dev-element">
      {body}
      {relatedPaths.length > 0 && (
        <div className="related-files">
          <span className="related-files-title">CSS / JS を開く</span>
          <div className="related-files-list">
            {relatedPaths.map((path) => (
              <button
                key={path}
                type="button"
                className="file-chip"
                data-modified={store.isEdited(path) ? "true" : undefined}
                onClick={() => onOpenFile(path)}
              >
                <FileIcon size={14} />
                {path}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SnippetEditor({
  store,
  location,
  label,
  onChange,
  onShowInFile,
}: {
  store: SourceStore;
  location: SourceLocation;
  label: string | null;
  onChange: (path: string, text: string) => void;
  onShowInFile: () => void;
}) {
  const path = location.filePath;
  const full = store.getEdited(path);
  const text = typeof full === "string" ? full : "";
  const [range, setRange] = useState<SnippetRange>(() => snippetRange(text, location));
  // CodeEditor は最新のコールバックを呼ぶが、連続した変更の間に再描画が挟まらないこともあるので ref で持つ
  const rangeRef = useRef(range);
  useLayoutEffect(() => {
    rangeRef.current = range;
  });

  const code = text.slice(range.start, range.end);
  const startLine = lineOf(text, range.start);
  const endLine = startLine + (code.match(/\n/g)?.length ?? 0);

  return (
    <div className="snippet">
      <div className="snippet-meta">
        <span className="snippet-label">{label}</span>
        <span className="snippet-where">
          {path} ・ {startLine === endLine ? `${startLine}行目` : `${startLine}〜${endLine}行目`}
        </span>
        <button type="button" className="link-button" onClick={onShowInFile}>
          ファイル全体で見る
        </button>
      </div>
      <div className="snippet-editor" data-testid="element-code">
        <CodeEditor
          path={path}
          value={code}
          highlight={null}
          showToolbar={false}
          onChange={(nextCode) => {
            const current = store.getEdited(path);
            if (typeof current !== "string") return;
            const result = applySnippet(current, rangeRef.current, nextCode);
            rangeRef.current = result.range;
            setRange(result.range);
            onChange(path, result.text);
          }}
        />
      </div>
    </div>
  );
}

function FileView({
  store,
  controller,
  state,
  textPaths,
}: {
  store: SourceStore;
  controller: ReviewController;
  state: ReviewState;
  textPaths: string[];
}) {
  const { activePath } = state;
  const activeValue = activePath === null ? undefined : store.getEdited(activePath);
  const activeMime =
    activePath !== null && typeof activeValue !== "string"
      ? store.currentFiles().find((file) => file.path === activePath)?.mimeType
      : undefined;
  const closedTextPaths = textPaths.filter((path) => !state.openPaths.includes(path));

  return (
    <section className="dev-file" aria-label="コードエディタ">
      <div className="dev-file-tabs">
        <FileTabs
          files={state.openPaths.map((path) => ({ path, modified: store.isEdited(path) }))}
          activePath={activePath}
          onSelect={(path) => controller.openFile(path)}
          onClose={(path) => controller.closeFile(path)}
        />
        {closedTextPaths.length > 0 && (
          <select
            className="open-file-select"
            data-testid="open-file-select"
            aria-label="ファイルを開く"
            value=""
            onChange={(event) => controller.openFile(event.target.value)}
          >
            <option value="">＋ ファイルを開く</option>
            {closedTextPaths.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="editor-host">
        {activePath !== null && activeValue !== undefined && (
          <CodeEditor
            path={activePath}
            value={activeValue}
            mimeType={activeMime}
            // ファイルを切り替えた直後に前のファイルの保留中の変更（JS の未適用の変更を含む）が
            // 届くことがあるため、現在の activePath ではなく、渡された path で振り分ける
            onChange={(text, path) => controller.editFile(path, text)}
            highlight={state.highlight}
            onCursorChange={
              isHtmlPath(activePath)
                ? (offset) => controller.cursorMoved(activePath, offset)
                : undefined
            }
            modified={store.isEdited(activePath)}
            onReset={() => {
              const original = store.getOriginal(activePath);
              if (typeof original === "string") controller.editFile(activePath, original);
            }}
          />
        )}
      </div>
    </section>
  );
}
