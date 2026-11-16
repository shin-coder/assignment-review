import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PreviewFrame as DefaultPreviewFrame } from "../preview";
import type { ParentToFrameMessage } from "../shared";
import type { SourceStore } from "../store";
import { CommentComposer, CommentList } from "../ui/comments";
import { CodeEditor, FileTabs } from "../ui/editor";
import { LayerTree } from "../ui/layer-tree";
import type { AppDeps } from "./deps";
import { isHtmlPath } from "./previewFiles";
import { ReviewController } from "./reviewController";

export interface ReviewScreenProps {
  store: SourceStore;
  deps: AppDeps;
  workerReady: Promise<unknown>;
  onDeleteProject: () => void;
}

type Confirming = "reset" | "delete" | null;

/** 1 つのプロジェクトのレビュー画面。左: レイヤーツリー / 中央: プレビュー / 右: エディタとコメント */
export function ReviewScreen({ store, deps, workerReady, onDeleteProject }: ReviewScreenProps) {
  const [controller] = useState(() => new ReviewController({ store, isDev: deps.isDev }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const { postToFrame } = deps;

  // iframe への送信を結びつける（iframe は作り直されるので、送る時点の要素を使う）
  useEffect(() => {
    controller.attachFrame((message: ParentToFrameMessage) => {
      const iframe = iframeRef.current;
      if (iframe) postToFrame(iframe, message);
    });
    return () => controller.attachFrame(null);
  }, [controller, postToFrame]);

  const Frame = deps.PreviewFrame ?? DefaultPreviewFrame;
  const { activePath } = state;
  const activeValue = activePath === null ? undefined : store.getEdited(activePath);
  const activeMime =
    activePath !== null && typeof activeValue !== "string"
      ? store.currentFiles().find((file) => file.path === activePath)?.mimeType
      : undefined;
  const closedTextPaths = store
    .paths()
    .filter((path) => !state.openPaths.includes(path) && typeof store.getEdited(path) === "string");

  return (
    <div className="review" data-testid="review-screen">
      <div className="review-toolbar">
        {state.htmlPaths.length > 1 && (
          <label>
            表示するページ{" "}
            <select
              data-testid="page-select"
              value={state.currentPage ?? ""}
              onChange={(event) => controller.openPage(event.target.value)}
            >
              {state.htmlPaths.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        {confirming === "reset" ? (
          <ConfirmRow
            label="すべての編集を元に戻しますか？（コメントは残ります）"
            testId="reset-all-confirm"
            onConfirm={() => {
              setConfirming(null);
              controller.resetAll();
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : confirming === "delete" ? (
          <ConfirmRow
            label="このプロジェクトを削除しますか？（編集とコメントも消えます）"
            testId="delete-project-confirm"
            onConfirm={() => {
              setConfirming(null);
              onDeleteProject();
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <>
            <button type="button" data-testid="reset-all" onClick={() => setConfirming("reset")}>
              すべての編集を元に戻す
            </button>
            <button
              type="button"
              data-testid="delete-project"
              onClick={() => setConfirming("delete")}
            >
              このプロジェクトを削除
            </button>
          </>
        )}
      </div>

      <div className="review-body">
        <aside className="pane pane-left" aria-label="レイヤーツリー">
          <LayerTree
            key={state.currentPage ?? ""}
            nodes={state.tree}
            selectedId={state.selectedId}
            hoveredId={state.hoveredId}
            commentedIds={state.commentedIds}
            onSelect={(id) => controller.selectFromTree(id)}
            onHover={(id) => controller.setHovered(id)}
          />
        </aside>

        <main className="pane-center">
          {state.entryPath === null ? (
            <p role="alert">プレビューできる HTML ファイルがありません</p>
          ) : (
            <Frame
              className="preview"
              sessionId={store.projectId}
              files={state.previewFiles}
              entryPath={state.entryPath}
              workerReady={workerReady}
              rebuildKey={state.rebuildKey}
              ref={iframeRef}
              sendFiles={deps.sendFiles}
              onMessage={(message) => controller.handleFrameMessage(message)}
              onLoad={(iframe) => {
                try {
                  controller.notifyFramePath(
                    store.projectId,
                    iframe.contentWindow?.location.pathname ?? "",
                  );
                } catch {
                  // 別オリジンに移動していたときは何もしない
                }
              }}
            />
          )}
        </main>

        <aside className="pane pane-right">
          <section className="editor-area" aria-label="コードエディタ">
            <FileTabs
              files={state.openPaths.map((path) => ({ path, modified: store.isEdited(path) }))}
              activePath={activePath}
              onSelect={(path) => controller.openFile(path)}
              onClose={(path) => controller.closeFile(path)}
            />
            {closedTextPaths.length > 0 && (
              <select
                data-testid="open-file-select"
                aria-label="ファイルを開く"
                value=""
                onChange={(event) => controller.openFile(event.target.value)}
              >
                <option value="">ファイルを開く…</option>
                {closedTextPaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            )}
            {state.generatedNotice && (
              <p role="status" className="notice" data-testid="generated-notice">
                {state.generatedNotice}
              </p>
            )}
            {state.message && (
              <p role="alert" className="notice" data-testid="app-message">
                {state.message}
              </p>
            )}
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
          <section className="comment-area" aria-label="コメント">
            <CommentComposer
              targetLabel={state.selectedLabel}
              disabledReason={state.commentDisabledReason}
              onSubmit={(body) => controller.addComment(body)}
            />
            <CommentList
              comments={[...state.comments]}
              labels={state.commentLabels}
              activeId={state.activeCommentId}
              onSelect={(id) => controller.selectComment(id)}
              onDelete={(id) => controller.deleteComment(id)}
              onUpdate={(id, body) => controller.updateComment(id, body)}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function ConfirmRow(props: {
  label: string;
  testId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span role="group" aria-label={props.label}>
      {props.label}{" "}
      <button type="button" data-testid={props.testId} onClick={props.onConfirm}>
        実行する
      </button>{" "}
      <button type="button" onClick={props.onCancel}>
        キャンセル
      </button>
    </span>
  );
}
