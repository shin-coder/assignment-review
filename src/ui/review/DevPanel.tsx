import { useLayoutEffect, useRef, useState } from "react";
import { isHtmlPath } from "../../app/previewFiles";
import type { ReviewController, ReviewState } from "../../app/reviewController";
import { locateCssRule } from "../../app/cssRules";
import { applySnippet, lineOf, snippetRange, type SnippetRange } from "../../app/snippet";
import type { MatchedCssRule, SourceLocation } from "../../shared";
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
        <h2 className="side-panel-title">Dev mode</h2>
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
    rules: readonly MatchedCssRule[];
  } | null>(() =>
    state.selectedLocation
      ? { seq: state.selectionSeq, location: state.selectedLocation, rules: state.selectedRules }
      : null,
  );
  if (session?.seq !== state.selectionSeq && state.selectedLocation) {
    setSession({
      seq: state.selectionSeq,
      location: state.selectedLocation,
      rules: state.selectedRules,
    });
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
            その要素の HTML と CSS がここに出ます
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
      // 選び直したら作り直す（前の要素の保留中の変更は前の範囲に反映される）
      <div className="dev-element-scroll" key={session.seq}>
        <SnippetEditor
          store={store}
          location={session.location}
          label={state.selectedLabel}
          onChange={(path, text) => controller.editFile(path, text)}
          onShowInFile={onShowInFile}
        />
        <CssRulesView
          store={store}
          rules={session.rules}
          onChange={(path, text) => controller.editFile(path, text)}
        />
      </div>
    );
  }

  return (
    <div className="dev-element">
      {body}
      {relatedPaths.length > 0 && (
        <div className="related-files">
          <span className="related-files-title">ファイルを開く</span>
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

/** エディタ 1 行の高さ（18px × 行間 1.6） */
const LINE_HEIGHT = 28.8;

/** 中身の行数に合わせたエディタの高さ（多すぎる分はエディタの中でスクロール） */
function editorHeight(code: string, maxLines: number): number {
  const lines = code.split("\n").length;
  return Math.min(Math.max(lines, 1), maxLines) * LINE_HEIGHT + 12;
}

function linesLabel(text: string, range: SnippetRange): string {
  const startLine = lineOf(text, range.start);
  const endLine = startLine + (text.slice(range.start, range.end).match(/\n/g)?.length ?? 0);
  return startLine === endLine ? `${startLine}行目` : `${startLine}〜${endLine}行目`;
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

  return (
    <section className="code-section" aria-label="HTML">
      <div className="snippet-meta">
        <span className="code-section-title">HTML</span>
        <span className="snippet-label">{label}</span>
        <span className="snippet-where">
          {path} ・ {linesLabel(text, range)}
        </span>
        <button type="button" className="link-button" onClick={onShowInFile}>
          ファイル全体で見る
        </button>
      </div>
      <div
        className="code-block"
        data-testid="element-code"
        style={{ height: editorHeight(code, 14) }}
      >
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
    </section>
  );
}

interface CssEntry {
  rule: MatchedCssRule;
  /** ソースの中の範囲。見つからなければ null（ブラウザが整えたルールを読み取り専用で出す） */
  range: SnippetRange | null;
}

/**
 * 選んだ要素に当たっている CSS ルールを、ソースの順に 1 つずつ編集できるエディタで並べる。
 * 同じファイルのルールを編集すると後ろのルールの位置がずれるので、ずれた分を足して持ち直す
 */
function CssRulesView({
  store,
  rules,
  onChange,
}: {
  store: SourceStore;
  rules: readonly MatchedCssRule[];
  onChange: (path: string, text: string) => void;
}) {
  const [entries, setEntries] = useState<CssEntry[]>(() =>
    rules.map((rule) => {
      const text = store.getEdited(rule.path);
      const found = typeof text === "string" ? locateCssRule(text, rule) : null;
      return { rule, range: found && typeof text === "string" ? snippetRange(text, found) : null };
    }),
  );
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    entriesRef.current = entries;
  });

  function edit(index: number, code: string) {
    const current = entriesRef.current;
    const target = current[index];
    if (!target?.range) return;
    const { path } = target.rule;
    const text = store.getEdited(path);
    if (typeof text !== "string") return;
    const result = applySnippet(text, target.range, code);
    const oldEnd = target.range.end;
    const delta = result.range.end - oldEnd;
    const next = current.map((entry, i) => {
      if (i === index) return { ...entry, range: result.range };
      if (entry.rule.path !== path || !entry.range || entry.range.start < oldEnd) return entry;
      return {
        ...entry,
        range: { start: entry.range.start + delta, end: entry.range.end + delta },
      };
    });
    entriesRef.current = next;
    setEntries(next);
    onChange(path, result.text);
  }

  return (
    <section className="code-section" aria-label="CSS">
      <div className="snippet-meta">
        <span className="code-section-title">CSS</span>
        <span className="snippet-where">{entries.length} 件</span>
      </div>
      {entries.length === 0 ? (
        <p className="code-section-empty">この要素に当たっている CSS ルールはありません</p>
      ) : (
        <ul className="css-rules" aria-label="この要素の CSS">
          {entries.map((entry, index) => {
            const text = store.getEdited(entry.rule.path);
            const source = typeof text === "string" ? text : "";
            const code = entry.range
              ? source.slice(entry.range.start, entry.range.end)
              : entry.rule.cssText;
            return (
              <li key={`${entry.rule.path}:${entry.rule.selector}:${entry.rule.occurrence}`}>
                <div className="css-rule-meta">
                  <span>{entry.rule.path}</span>
                  {entry.range && <span>{linesLabel(source, entry.range)}</span>}
                  {entry.rule.media && <span className="css-rule-media">{entry.rule.media}</span>}
                  {!entry.range && <span>ソースの中で見つからないため読み取り専用</span>}
                </div>
                <div
                  className="code-block"
                  data-testid="element-css"
                  style={{ height: editorHeight(code, 12) }}
                >
                  <CodeEditor
                    path={entry.rule.path}
                    value={code}
                    highlight={null}
                    showToolbar={false}
                    readOnly={!entry.range}
                    onChange={(nextCode) => edit(index, nextCode)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
