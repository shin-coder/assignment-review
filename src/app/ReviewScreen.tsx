import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PreviewFrame as DefaultPreviewFrame } from "../preview";
import type { FrameToParentMessage, ParentToFrameMessage } from "../shared";
import type { SourceStore } from "../store";
import { sortComments } from "../ui/comments/sortComments";
import { CommentLayer } from "../ui/review/CommentLayer";
import { CommentPanel } from "../ui/review/CommentPanel";
import { DevPanel, type DevView } from "../ui/review/DevPanel";
import { DeviceCanvas } from "../ui/review/DeviceCanvas";
import { DEVICES, type DeviceId } from "../ui/review/devices";
import { ProjectMenu, type SaveStatus } from "../ui/review/ProjectMenu";
import { createRectStore } from "../ui/review/rectStore";
import { Toolbar } from "../ui/review/Toolbar";
import type { AppDeps } from "./deps";
import { ReviewController, type Tool } from "./reviewController";

export interface ReviewScreenProps {
  store: SourceStore;
  deps: AppDeps;
  workerReady: Promise<unknown>;
  saveStatus: SaveStatus;
  saveError: string | null;
  busy: boolean;
  canOpenFolder: boolean;
  onOpenFolder: () => void;
  onDeleteProject: () => void;
}

const TOOL_KEYS: Record<string, Tool> = { v: "browse", c: "comment", d: "dev" };
const DEVICE_STORAGE_KEY = "review-tool:device";

function loadDevice(): DeviceId {
  try {
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY);
    return DEVICES.some((device) => device.id === saved) ? (saved as DeviceId) : "pc";
  } catch {
    return "pc";
  }
}

function saveDevice(device: DeviceId): void {
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, device);
  } catch {
    // 保存できなくても困らない（次回は PC から始まるだけ）
  }
}

/** キー入力が文字の入力欄（エディタを含む）に向いているか */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !==
    null
  );
}

/**
 * 1 つのプロジェクトのレビュー画面。プレビューを画面いっぱいに置き、
 * 下のツールバーで「操作 / コメント / 開発」とプレビューの幅を切り替える。
 * 右のパネルはコメント・開発モードのときだけ出す
 */
export function ReviewScreen({
  store,
  deps,
  workerReady,
  saveStatus,
  saveError,
  busy,
  canOpenFolder,
  onOpenFolder,
  onDeleteProject,
}: ReviewScreenProps) {
  const [controller] = useState(() => new ReviewController({ store, isDev: deps.isDev }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [rects] = useState(createRectStore);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [device, setDevice] = useState<DeviceId>(loadDevice);
  const [devView, setDevView] = useState<DevView>("element");
  const { postToFrame } = deps;
  const { tool } = state;

  // iframe への送信を結びつける（iframe は作り直されるので、送る時点の要素を使う）
  useEffect(() => {
    controller.attachFrame((message: ParentToFrameMessage) => {
      const iframe = iframeRef.current;
      if (iframe) postToFrame(iframe, message);
    });
    return () => controller.attachFrame(null);
  }, [controller, postToFrame]);

  function changeDevice(next: DeviceId) {
    setDevice(next);
    saveDevice(next);
  }

  // ショートカット: V / C / D でツール、1 / 2 / 3 で幅、Escape で選択を外す
  function handleKey(key: string) {
    const nextTool = TOOL_KEYS[key];
    if (nextTool) {
      controller.setTool(nextTool);
      return;
    }
    const nextDevice = DEVICES.find((d) => d.shortcut === key);
    if (nextDevice) {
      changeDevice(nextDevice.id);
      return;
    }
    if (key === "Escape") controller.clearSelection();
  }
  const handleKeyRef = useRef(handleKey);
  useEffect(() => {
    handleKeyRef.current = handleKey;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.isComposing || isTyping(event.target)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key in TOOL_KEYS || key === "Escape" || DEVICES.some((d) => d.shortcut === key)) {
        handleKeyRef.current(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleFrameMessage(message: FrameToParentMessage) {
    switch (message.type) {
      case "review:rects":
        rects.set(message.rects);
        return;
      case "review:key":
        handleKey(message.key);
        return;
      case "review:select":
        // 開発モードでプレビューの要素を選んだら、その要素のコードを出す
        if (tool === "dev") setDevView("element");
        break;
    }
    controller.handleFrameMessage(message);
  }

  const sorted = useMemo(() => sortComments([...state.comments]), [state.comments]);
  const numbers = useMemo(() => {
    const result: Record<string, number> = {};
    sorted.forEach((comment, index) => (result[comment.id] = index + 1));
    return result;
  }, [sorted]);

  const Frame = deps.PreviewFrame ?? DefaultPreviewFrame;

  return (
    <div className="review" data-testid="review-screen" data-tool={tool}>
      <div className="stage">
        <ProjectMenu
          name={store.name}
          saveStatus={saveStatus}
          saveError={saveError}
          hasEdits={store.editedPaths().length > 0}
          pages={state.htmlPaths}
          currentPage={state.currentPage}
          onPageChange={(path) => controller.openPage(path)}
          busy={busy}
          canOpenFolder={canOpenFolder}
          onOpenFolder={onOpenFolder}
          onResetAll={() => controller.resetAll()}
          onDeleteProject={onDeleteProject}
        />

        {state.entryPath === null ? (
          <p role="alert" className="stage-message">
            プレビューできる HTML ファイルがありません
          </p>
        ) : (
          <DeviceCanvas
            device={device}
            overlay={
              tool === "comment"
                ? (geometry) => (
                    <CommentLayer
                      geometry={geometry}
                      rects={rects}
                      pins={state.pins}
                      comments={state.comments}
                      numbers={numbers}
                      labels={state.commentLabels}
                      activeCommentId={state.activeCommentId}
                      selectedId={state.selectedId}
                      selectedLabel={state.selectedLabel}
                      disabledReason={state.commentDisabledReason}
                      generated={state.generatedNotice !== null}
                      onSelectComment={(id) => controller.selectComment(id)}
                      onAddComment={(body) => controller.addComment(body)}
                      onUpdateComment={(id, body) => controller.updateComment(id, body)}
                      onDeleteComment={(id) => controller.deleteComment(id)}
                      onClose={() => controller.clearSelection()}
                    />
                  )
                : undefined
            }
          >
            <Frame
              className="preview"
              sessionId={store.projectId}
              files={state.previewFiles}
              entryPath={state.entryPath}
              workerReady={workerReady}
              rebuildKey={state.rebuildKey}
              ref={iframeRef}
              sendFiles={deps.sendFiles}
              onMessage={handleFrameMessage}
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
          </DeviceCanvas>
        )}

        {state.message && tool !== "dev" && (
          <p role="alert" className="toast stage-toast" data-testid="app-message">
            {state.message}
          </p>
        )}

        <Toolbar
          tool={tool}
          onToolChange={(next) => controller.setTool(next)}
          device={device}
          onDeviceChange={changeDevice}
        />
      </div>

      {tool === "comment" && (
        <CommentPanel
          comments={sorted}
          labels={state.commentLabels}
          numbers={numbers}
          activeId={state.activeCommentId}
          onSelect={(id) => controller.selectComment(id)}
          onDelete={(id) => controller.deleteComment(id)}
          onUpdate={(id, body) => controller.updateComment(id, body)}
        />
      )}
      {tool === "dev" && (
        <DevPanel
          store={store}
          controller={controller}
          state={state}
          view={devView}
          onViewChange={setDevView}
        />
      )}
    </div>
  );
}
