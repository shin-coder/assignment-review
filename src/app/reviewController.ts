// レビュー画面の状態と操作（React に依存しない）。
// SourceStore・解析結果・選択・編集の反映・コメントをまとめて持ち、画面（React）は
// subscribe / getState で読むだけにする。iframe への送信は attachFrame で渡された関数を通す
import {
  applyChangesToComments,
  createComment,
  resolveCommentElement,
  shiftLocation,
} from "../comments";
import { classifyEdit, isNoopChange, replaceFile } from "../edit";
import { findElementAt } from "../parser";
import {
  PREVIEW_PREFIX,
  normalizePath,
  type ElementId,
  type ElementInfo,
  type LayerNode,
  type ParentToFrameMessage,
  type FrameToParentMessage,
  type PinOffset,
  type ReviewComment,
  type SourceLocation,
  type TextChange,
  type VirtualFile,
} from "../shared";
import type { SourceStore } from "../store";
import { alignChangeToTagBoundary } from "./alignChange";
import {
  analyzePage,
  buildPreviewFiles,
  isHtmlPath,
  planElementReplace,
  type PageInfo,
} from "./previewFiles";

/** JS が生成した要素を選んだときに出す文 */
export const GENERATED_NOTICE = "JS が生成した要素は編集・コメントの対象外です";
const IMPLICIT_REASON = "ソースに記述のない要素にはコメントできません";

export type FrameSender = (message: ParentToFrameMessage) => void;

/**
 * 画面下のツールバーで選ぶツール。
 * - "browse": 生徒のサイトをそのまま操作する（リンク・JS も動く）
 * - "comment": 要素をクリックしてコメントを付ける
 * - "dev": 要素をクリックしてそのコードを見る・編集する
 */
export type Tool = "browse" | "comment" | "dev";

/** 表示中の HTML でコメントのピンを立てる位置 */
export interface CommentPin {
  commentId: string;
  elementId: ElementId;
}

export interface ReviewState {
  tool: Tool;
  /**
   * 利用者が要素を選び直すたびに増える番号。編集で選択中の要素の ID が変わっても増えない。
   * 開発モードの「この要素」の編集範囲をいつ取り直すかの判断に使う
   */
  selectionSeq: number;
  /** 選択中の要素のソース上の範囲。ソースに開始タグのない要素・JS 生成要素なら null */
  selectedLocation: SourceLocation | null;
  /** 表示中の HTML のコメントのピン（対応する要素が見つかるものだけ） */
  pins: readonly CommentPin[];
  /** プレビューで要素をクリックした位置（要素の左上からのずれ）。新しいコメントのピンの位置になる */
  selectedPoint: PinOffset | null;
  /** iframe が最初に開くパス。HTML がなければ null */
  entryPath: string | null;
  /** いま iframe に表示している HTML */
  currentPage: string | null;
  /** 変わると iframe を作り直す */
  rebuildKey: number;
  /** Service Worker に渡すファイル群。内容が変わったときだけ新しい配列になる */
  previewFiles: readonly VirtualFile[];
  htmlPaths: readonly string[];
  tree: readonly LayerNode[];
  selectedId: ElementId | null;
  hoveredId: ElementId | null;
  /** 選択中の要素の表示名 */
  selectedLabel: string | null;
  /** JS 生成要素を選んだときの案内。それ以外は null */
  generatedNotice: string | null;
  /** コメントできない理由。できるなら null */
  commentDisabledReason: string | null;
  openPaths: readonly string[];
  activePath: string | null;
  /** エディタで強調する範囲 */
  highlight: SourceLocation | null;
  comments: readonly ReviewComment[];
  /** コメント ID → 要素の表示名 */
  commentLabels: Record<string, string>;
  /** 表示中の HTML でコメントが付いている要素 */
  commentedIds: ReadonlySet<ElementId>;
  activeCommentId: string | null;
  /** 画面に出すエラーなど */
  message: string | null;
}

type Core = {
  tool: Tool;
  selectedPoint: PinOffset | null;
  selectionSeq: number;
  entryPath: string | null;
  currentPage: string | null;
  rebuildKey: number;
  previewFiles: readonly VirtualFile[];
  selectedId: ElementId | null;
  hoveredId: ElementId | null;
  generated: boolean;
  /** true のとき、エディタの強調を出さない（エディタのカーソル操作で選んだとき） */
  highlightHidden: boolean;
  /** 見つからなくなったコメントを選んだときの強調範囲 */
  highlightOverride: SourceLocation | null;
  openPaths: readonly string[];
  activePath: string | null;
  activeCommentId: string | null;
  message: string | null;
};

export interface ReviewControllerOptions {
  store: SourceStore;
  /** 操作スクリプトの URL の選択に使う（import.meta.env.DEV） */
  isDev: boolean;
  /** 最初に開く HTML。省略時は index.html、なければ最初の HTML */
  initialPage?: string | null;
}

export type AddCommentResult = { ok: true; id: string } | { ok: false; message: string };

export class ReviewController {
  readonly store: SourceStore;
  private readonly isDev: boolean;
  private readonly pages = new Map<string, PageInfo>();
  private readonly listeners = new Set<() => void>();
  private sender: FrameSender | null = null;
  /** 最後に iframe へ送った review:track の内容 */
  private lastTrackKey: string | null = null;
  private core: Core;
  private state: ReviewState;

  constructor({ store, isDev, initialPage }: ReviewControllerOptions) {
    this.store = store;
    this.isDev = isDev;
    for (const path of store.paths()) this.analyze(path);
    const htmlPaths = [...this.pages.keys()];
    const first =
      (initialPage && this.pages.has(initialPage) ? initialPage : null) ??
      (this.pages.has("index.html") ? "index.html" : (htmlPaths[0] ?? null));
    this.core = {
      tool: "browse",
      selectedPoint: null,
      selectionSeq: 0,
      entryPath: first,
      currentPage: first,
      rebuildKey: 0,
      previewFiles: buildPreviewFiles(store.currentFiles(), this.pages),
      selectedId: null,
      hoveredId: null,
      generated: false,
      highlightHidden: false,
      highlightOverride: null,
      openPaths: first ? [first] : [],
      activePath: first,
      activeCommentId: null,
      message: null,
    };
    this.state = this.derive();
  }

  // ---- 購読 ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ReviewState => this.state;

  /** iframe へ送る関数を設定する。iframe がないときは null */
  attachFrame(sender: FrameSender | null): void {
    this.sender = sender;
    this.lastTrackKey = null;
  }

  // ---- 内部 ----

  private analyze(path: string): PageInfo | null {
    if (!isHtmlPath(path)) return null;
    const text = this.store.getEdited(path);
    if (typeof text !== "string") return null;
    const page = analyzePage(path, text, this.isDev);
    this.pages.set(path, page);
    return page;
  }

  private page(): PageInfo | null {
    return this.core.currentPage ? (this.pages.get(this.core.currentPage) ?? null) : null;
  }

  private selectedInfo(): ElementInfo | null {
    const id = this.core.selectedId;
    return id === null ? null : (this.page()?.analysis.map.get(id) ?? null);
  }

  private commit(patch: Partial<Core>): void {
    this.core = { ...this.core, ...patch };
    this.state = this.derive();
    this.syncTrack();
    for (const listener of [...this.listeners]) listener();
  }

  /** iframe での操作モード */
  private frameMode(): "inspect" | "browse" {
    return this.core.tool === "browse" ? "browse" : "inspect";
  }

  /** iframe に送るモード。コメントモードでは枠に要素名を出さない */
  private modeMessage(): ParentToFrameMessage {
    return { type: "review:mode", mode: this.frameMode(), labels: this.core.tool !== "comment" };
  }

  /** コメントモードの間だけ、ピンと選択中の要素の矩形を iframe に知らせてもらう */
  private trackIds(): ElementId[] {
    if (this.core.tool !== "comment") return [];
    const ids = new Set(this.state.pins.map((pin) => pin.elementId));
    if (this.state.selectedId !== null) ids.add(this.state.selectedId);
    return [...ids];
  }

  private syncTrack(force = false): void {
    const elementIds = this.trackIds();
    const key = elementIds.join("\u0000");
    if (!force && key === this.lastTrackKey) return;
    this.lastTrackKey = key;
    this.send({ type: "review:track", elementIds });
  }

  private send(message: ParentToFrameMessage): void {
    this.sender?.(message);
  }

  private derive(): ReviewState {
    const page = this.page();
    const info = this.selectedInfo();
    const comments = this.store.getComments();
    const commentLabels: Record<string, string> = {};
    const commentedIds = new Set<ElementId>();
    const pins: CommentPin[] = [];
    for (const comment of comments) {
      if (comment.status !== "active") continue;
      const target = this.pages.get(comment.location.filePath);
      if (!target) continue;
      const id = resolveCommentElement(comment, target.analysis.map);
      if (id === null) continue;
      const label = target.labels.get(id);
      if (label !== undefined) commentLabels[comment.id] = label;
      if (target === page) {
        commentedIds.add(id);
        pins.push({ commentId: comment.id, elementId: id });
      }
    }
    const { core } = this;
    let commentDisabledReason: string | null = null;
    if (core.generated) commentDisabledReason = GENERATED_NOTICE;
    else if (info && info.location === null) commentDisabledReason = IMPLICIT_REASON;
    const highlight =
      core.highlightOverride ?? (core.highlightHidden ? null : (info?.location ?? null));
    return {
      tool: core.tool,
      selectionSeq: core.selectionSeq,
      selectedLocation: core.generated ? null : (info?.location ?? null),
      pins,
      selectedPoint: core.selectedPoint,
      entryPath: core.entryPath,
      currentPage: core.currentPage,
      rebuildKey: core.rebuildKey,
      previewFiles: core.previewFiles,
      htmlPaths: [...this.pages.keys()],
      tree: page?.analysis.tree ?? [],
      selectedId: core.selectedId,
      hoveredId: core.hoveredId,
      selectedLabel: core.selectedId === null ? null : (page?.labels.get(core.selectedId) ?? null),
      generatedNotice: core.generated ? GENERATED_NOTICE : null,
      commentDisabledReason,
      openPaths: core.openPaths,
      activePath: core.activePath,
      highlight,
      comments,
      commentLabels,
      commentedIds,
      activeCommentId: core.activeCommentId,
      message: core.message,
    };
  }

  /** 指定したファイルをエディタで開く（タブになければ足す） */
  private withOpened(path: string): Pick<Core, "openPaths" | "activePath"> {
    const openPaths = this.core.openPaths.includes(path)
      ? this.core.openPaths
      : [...this.core.openPaths, path];
    return { openPaths, activePath: path };
  }

  /** iframe を作り直す。表示中の HTML から開き直す */
  private rebuildPatch(): Partial<Core> {
    return {
      rebuildKey: this.core.rebuildKey + 1,
      entryPath: this.core.currentPage,
      hoveredId: null,
    };
  }

  private updatePreviewFile(path: string): readonly VirtualFile[] {
    const current = this.store.currentFiles().find((file) => file.path === path);
    if (!current) return this.core.previewFiles;
    const next = buildPreviewFiles([current], this.pages)[0]!;
    return this.core.previewFiles.map((file) => (file.path === path ? next : file));
  }

  // ---- 選択 ----

  private select(
    id: ElementId | null,
    options: { generated?: boolean; fromEditor?: boolean; point?: PinOffset } = {},
  ): void {
    const info = id === null ? null : (this.page()?.analysis.map.get(id) ?? null);
    const selectedId = info ? info.id : null;
    const patch: Partial<Core> = {
      selectionSeq: this.core.selectionSeq + 1,
      selectedId,
      selectedPoint: selectedId === null ? null : (options.point ?? null),
      generated: options.generated ?? false,
      highlightHidden: options.fromEditor ?? false,
      highlightOverride: null,
      activeCommentId: null,
      message: null,
    };
    if (info && !options.fromEditor) Object.assign(patch, this.withOpened(info.filePath));
    this.commit(patch);
    this.send({ type: "review:highlight", elementId: selectedId });
  }

  /** レイヤーツリーで選んだ */
  selectFromTree(id: ElementId): void {
    this.select(id);
  }

  /** 選択とコメントの選択を外す（Escape） */
  clearSelection(): void {
    if (this.core.selectedId === null && this.core.activeCommentId === null && !this.core.generated)
      return;
    this.select(null);
  }

  /** ツールを切り替える。選択はそのまま残す（コメントを付けた要素をそのまま開発モードで見られる） */
  setTool(tool: Tool): void {
    if (tool === this.core.tool) return;
    this.commit({ tool, hoveredId: null });
    this.send(this.modeMessage());
  }

  setHovered(id: ElementId | null): void {
    if (this.core.hoveredId === id) return;
    this.commit({ hoveredId: id });
  }

  /** iframe からのメッセージ */
  handleFrameMessage(message: FrameToParentMessage): void {
    switch (message.type) {
      case "review:ready":
        // 作り直し直後の iframe にモード・選択の枠・追跡する要素を付け直す
        this.send(this.modeMessage());
        if (this.core.selectedId !== null) {
          this.send({ type: "review:highlight", elementId: this.core.selectedId });
        }
        this.syncTrack(true);
        break;
      case "review:rects":
      case "review:key":
        // 画面（React）側で扱う
        break;
      case "review:hover": {
        const known =
          message.elementId !== null && this.page()?.analysis.map.has(message.elementId);
        this.setHovered(known ? message.elementId : null);
        break;
      }
      case "review:select":
        // JS 生成要素は祖先を選んで案内を出す（祖先がなければ選択なし）
        this.select(message.elementId, { generated: message.generated, point: message.point });
        break;
    }
  }

  /** エディタのカーソルが動いた（表示中の HTML の中のときだけ要素を選ぶ） */
  cursorMoved(path: string, offset: number): void {
    const page = this.page();
    if (!page || page.path !== path) return;
    const info = findElementAt(page.analysis.map, path, offset);
    if (!info || (info.id === this.core.selectedId && !this.core.generated)) return;
    this.select(info.id, { fromEditor: true });
  }

  // ---- ファイル・ページ ----

  openFile(path: string): void {
    if (!this.store.hasFile(path)) return;
    this.commit(this.withOpened(path));
  }

  closeFile(path: string): void {
    const openPaths = this.core.openPaths.filter((p) => p !== path);
    const activePath =
      this.core.activePath === path
        ? (openPaths[openPaths.length - 1] ?? null)
        : this.core.activePath;
    this.commit({ openPaths, activePath });
  }

  /** 表示する HTML を切り替える（iframe を開き直す） */
  openPage(path: string): void {
    if (!this.pages.has(path)) return;
    this.commit({
      selectionSeq: this.core.selectionSeq + 1,
      currentPage: path,
      selectedId: null,
      generated: false,
      highlightOverride: null,
      activeCommentId: null,
      ...this.withOpened(path),
      ...this.rebuildPatchFor(path),
    });
  }

  private rebuildPatchFor(path: string): Partial<Core> {
    return { rebuildKey: this.core.rebuildKey + 1, entryPath: path, hoveredId: null };
  }

  /** iframe の load 後に、生徒サイト内のリンクで移動したページを追従する */
  notifyFramePath(sessionId: string, pathname: string): void {
    const prefix = `${PREVIEW_PREFIX}${encodeURIComponent(sessionId)}/`;
    if (!pathname.startsWith(prefix)) return;
    let path: string;
    try {
      const decoded = pathname
        .slice(prefix.length)
        .split("/")
        .map((s) => decodeURIComponent(s))
        .join("/");
      path = normalizePath(decoded);
    } catch {
      return;
    }
    const candidates = [path, path === "" ? "index.html" : `${path}/index.html`];
    const found = candidates.find((p) => this.pages.has(p));
    if (!found || found === this.core.currentPage) return;
    // iframe はすでにそのページを表示しているので、作り直さず状態だけ合わせる
    this.commit({
      selectionSeq: this.core.selectionSeq + 1,
      currentPage: found,
      selectedId: null,
      generated: false,
      highlightOverride: null,
      activeCommentId: null,
      hoveredId: null,
      ...this.withOpened(found),
    });
  }

  // ---- 編集 ----

  /**
   * エディタの変更を反映する。path は編集したファイル（ファイルを切り替えた直後に
   * 前のファイルの保留中の変更が届くことがあるため、必ず path で振り分ける）
   */
  editFile(path: string, text: string): void {
    const current = this.store.getEdited(path);
    if (typeof current !== "string" || current === text) return;
    const kind = classifyEdit(path);
    const raw = replaceFile(current, text, path).change;
    const change = isHtmlPath(path) ? alignChangeToTagBoundary(current, text, raw) : raw;

    this.store.setEdited(path, text);
    this.followComments([change]);

    if (kind.kind === "html") {
      this.afterHtmlEdit(path, change);
    } else if (kind.kind === "css") {
      this.commit({ previewFiles: this.updatePreviewFile(path), message: null });
      this.send({ type: "review:replace-css", path, text });
    } else {
      // JS・その他は iframe を作り直す。HTML/CSS の編集はソースに入っているので残る
      this.commit({
        previewFiles: this.updatePreviewFile(path),
        message: null,
        ...this.rebuildPatch(),
      });
    }
  }

  /** 編集の TextChange（発生順）でコメントの位置を追従させる */
  private followComments(changes: readonly TextChange[]): void {
    const real = changes.filter((c) => !isNoopChange(c));
    if (real.length === 0) return;
    const before = this.store.getComments();
    const after = applyChangesToComments(before, real);
    if (after.some((comment, i) => comment !== before[i])) this.store.replaceComments(after);
  }

  private afterHtmlEdit(path: string, change: TextChange): void {
    const before = this.pages.get(path) ?? null;
    const after = this.analyze(path);
    if (!after) return;
    const previewFiles = this.updatePreviewFile(path);
    const patch: Partial<Core> = { previewFiles, message: null };

    // 選択中の要素は、編集で動いた開始位置から探し直す
    const selected = this.selectedInfo();
    let selectedId: ElementId | null = this.core.selectedId;
    if (path === this.core.currentPage && selected?.location) {
      const moved = shiftLocation(selected.location, change);
      selectedId = null;
      if (moved && selected.filePath === path) {
        for (const info of after.analysis.map.values()) {
          if (info.location?.start === moved.start) {
            selectedId = info.id;
            break;
          }
        }
      }
      patch.selectedId = selectedId;
      if (selectedId === null) patch.generated = false;
    } else if (path === this.core.currentPage && selected) {
      selectedId = after.analysis.map.has(selected.id) ? selected.id : null;
      patch.selectedId = selectedId;
    }

    if (path !== this.core.currentPage) {
      this.commit(patch);
      return;
    }
    const plan = before ? planElementReplace(before, after, change) : null;
    if (!plan) {
      this.commit({ ...patch, ...this.rebuildPatch() });
      return;
    }
    this.commit(patch);
    this.send({ type: "review:replace-element", elementId: plan.elementId, html: plan.html });
    // head を差し替えると適用済みの CSS が元の link に戻るため、編集済みの CSS を送り直す
    if (/<link[\s>/]/i.test(plan.html)) {
      for (const cssPath of this.store.editedPaths()) {
        const css = this.store.getEdited(cssPath);
        if (classifyEdit(cssPath).kind === "css" && typeof css === "string") {
          this.send({ type: "review:replace-css", path: cssPath, text: css });
        }
      }
    }
    this.send({ type: "review:highlight", elementId: selectedId });
  }

  /** すべての編集を元に戻す（コメントは残し、位置は元のソースに追従させる） */
  resetAll(): void {
    const changes: TextChange[] = [];
    for (const path of this.store.editedPaths()) {
      const edited = this.store.getEdited(path);
      const original = this.store.getOriginal(path);
      if (typeof edited !== "string" || typeof original !== "string") continue;
      const raw = replaceFile(edited, original, path).change;
      changes.push(isHtmlPath(path) ? alignChangeToTagBoundary(edited, original, raw) : raw);
    }
    const before = this.store.getComments();
    const after = applyChangesToComments(
      before,
      changes.filter((c) => !isNoopChange(c)),
    );
    this.store.resetAll();
    if (after.some((comment, i) => comment !== before[i])) this.store.replaceComments(after);

    this.pages.clear();
    for (const path of this.store.paths()) this.analyze(path);
    const currentPage =
      this.core.currentPage && this.pages.has(this.core.currentPage)
        ? this.core.currentPage
        : (this.pages.keys().next().value ?? null);
    this.core = { ...this.core, currentPage };
    this.commit({
      currentPage,
      previewFiles: buildPreviewFiles(this.store.currentFiles(), this.pages),
      selectionSeq: this.core.selectionSeq + 1,
      selectedId: null,
      generated: false,
      highlightOverride: null,
      activeCommentId: null,
      message: null,
      ...this.rebuildPatch(),
    });
  }

  // ---- コメント ----

  addComment(body: string): AddCommentResult {
    const result = createComment(this.selectedInfo(), body);
    if (!result.ok) {
      this.commit({ message: result.message });
      return { ok: false, message: result.message };
    }
    const point = this.core.selectedPoint;
    this.store.addComment(
      point
        ? { ...result.comment, pin: { x: Math.round(point.x), y: Math.round(point.y) } }
        : result.comment,
    );
    this.commit({ activeCommentId: result.comment.id, message: null });
    return { ok: true, id: result.comment.id };
  }

  updateComment(id: string, body: string): void {
    if (!this.store.getComment(id)) return;
    this.store.updateComment(id, { body });
    this.commit({});
  }

  /** ピンをドラッグして動かした。pin は要素の左上からのずれ（iframe 内の CSS px） */
  moveComment(id: string, pin: PinOffset): void {
    if (!this.store.getComment(id)) return;
    this.store.updateComment(id, { pin: { x: Math.round(pin.x), y: Math.round(pin.y) } });
    this.commit({});
  }

  deleteComment(id: string): void {
    this.store.removeComment(id);
    this.commit({
      activeCommentId: this.core.activeCommentId === id ? null : this.core.activeCommentId,
    });
  }

  /** コメント一覧で選んだ。要素が見つかればツリー・iframe・エディタを連動させる */
  selectComment(id: string): void {
    const comment = this.store.getComment(id);
    if (!comment) return;
    const filePath = comment.location.filePath;
    const target = this.pages.get(filePath);
    const elementId =
      comment.status === "active" && target
        ? resolveCommentElement(comment, target.analysis.map)
        : null;

    if (elementId !== null && target) {
      if (filePath !== this.core.currentPage) this.openPage(filePath);
      this.select(elementId);
      this.commit({ activeCommentId: id });
      return;
    }
    // 見つからないコメントは、元の位置（付近）だけをエディタで示す
    this.commit({
      selectionSeq: this.core.selectionSeq + 1,
      selectedId: null,
      generated: false,
      highlightHidden: false,
      highlightOverride: comment.location,
      activeCommentId: id,
      ...this.withOpened(filePath),
    });
    this.send({ type: "review:highlight", elementId: null });
  }
}
