import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Annotation, Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import type { SourceLocation } from "../../shared";
import { CHANGE_DEBOUNCE_MS, HIGHLIGHT_CLASS } from "./constants";
import { highlightField, setHighlightEffect, toHighlightRange } from "./highlight";
import { getEditorLanguage, languageExtension, requiresApply } from "./language";
import { diffText } from "./textDiff";

/** 親（value）から来た変更に付ける印。更新の監視でこの印の付いた変更を無視し、onChange の無限ループを防ぐ */
const externalChange = Annotation.define<boolean>();

/** 画面共有で読みやすいよう、文字と行間を大きめにする。アプリに合わせて暗い配色にする */
const editorTheme = EditorView.theme(
  {
    "&": { fontSize: "18px", height: "100%", color: "#e4e4e9", backgroundColor: "#1f1f24" },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Noto Sans Mono", monospace',
      lineHeight: "1.6",
    },
    ".cm-content": { caretColor: "#ffffff" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffffff" },
    ".cm-gutters": {
      fontSize: "16px",
      color: "#6e6e78",
      backgroundColor: "#1f1f24",
      borderRight: "1px solid #33333a",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255, 255, 255, 0.06)", color: "#c4c4cc" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.35)",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      outline: "1px solid rgba(255, 255, 255, 0.25)",
    },
    [`.${HIGHLIGHT_CLASS}`]: {
      backgroundColor: "rgba(59, 130, 246, 0.2)",
      outline: "1px solid rgba(59, 130, 246, 0.6)",
    },
  },
  { dark: true },
);

/**
 * CodeMirror の既定の色（白地用）を、暗い背景で読める色に置き換える。
 * タグの定義（@lezer/highlight）を直接の依存に足さずに済むよう、既定のスタイルの色だけ差し替える
 */
const DARK_COLORS: Record<string, string> = {
  "#404740": "#8b8b96", // メタ情報
  "#708": "#c792ea", // キーワード
  "#219": "#f78c6c", // 数値など
  "#164": "#89ddff", // 真偽値・アトム
  "#a11": "#c3e88d", // 文字列
  "#e40": "#ffcb6b", // 正規表現・エスケープ
  "#00f": "#82aaff", // 変数の定義
  "#30a": "#f07178", // ローカル変数
  "#085": "#f07178", // 型名・タグ名
  "#167": "#ffcb6b", // クラス名
  "#256": "#89ddff", // 特殊な変数
  "#00c": "#82aaff", // プロパティの定義・属性名
  "#940": "#7f848e", // コメント
  "#f00": "#ff5370", // 不正な記述
};

const darkHighlightStyle = HighlightStyle.define(
  defaultHighlightStyle.specs.map((spec) =>
    typeof spec.color === "string" && DARK_COLORS[spec.color]
      ? { ...spec, color: DARK_COLORS[spec.color] }
      : spec,
  ),
  { themeType: "dark" },
);

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

export interface EditorControllerCallbacks {
  /** 編集後のテキストを親に渡す。path はその編集をしたファイル */
  onChange(text: string, path: string): void;
  /** ユーザーの操作でカーソル（選択範囲の head）が動いた */
  onCursorChange(offset: number): void;
  /** JS ファイルに「適用」していない変更があるかどうかが変わった */
  onDraftChange(hasDraft: boolean): void;
}

export interface EditorControllerOptions {
  parent: HTMLElement;
  path: string;
  value: string;
  readOnly: boolean;
  callbacks: EditorControllerCallbacks;
  debounceMs?: number;
}

/**
 * CodeMirror の EditorView を持ち、親（React）からの値の反映と、親への変更の通知をまとめる。
 * - HTML / CSS など: 入力が debounceMs 止まったら onChange を呼ぶ
 * - JS: commit()（「適用」ボタンや Mod-Enter / Mod-s）まで onChange を呼ばない
 */
export class EditorController {
  readonly view: EditorView;
  private path: string;
  private readOnly: boolean;
  private readonly callbacks: EditorControllerCallbacks;
  private readonly debounceMs: number;
  private readonly languageCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** JS ファイルの未適用の変更があるか */
  private draft = false;
  /** 最後に onChange で渡したテキスト。親がそれを value として返してきたら（こだま）反映しない */
  private lastEmitted: string | null = null;

  constructor(options: EditorControllerOptions) {
    this.path = options.path;
    this.readOnly = options.readOnly;
    this.callbacks = options.callbacks;
    this.debounceMs = options.debounceMs ?? CHANGE_DEBOUNCE_MS;
    this.view = new EditorView({ parent: options.parent, state: this.createState(options.value) });
  }

  /** 親から渡された path と value を反映する */
  sync(path: string, value: string): void {
    if (path !== this.path) {
      this.switchFile(path, value);
    } else {
      this.setValue(value);
    }
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly === this.readOnly) return;
    this.readOnly = readOnly;
    this.view.dispatch({
      effects: this.readOnlyCompartment.reconfigure(readOnlyExtension(readOnly)),
    });
  }

  /** 範囲を強調表示し、見える位置までスクロールする。null や別ファイルの位置なら強調を消す */
  setHighlight(location: SourceLocation | null): void {
    const range = toHighlightRange(location, this.path, this.view.state.doc.length);
    this.view.dispatch({
      effects: range
        ? [setHighlightEffect.of(range), EditorView.scrollIntoView(range.from, { y: "center" })]
        : [setHighlightEffect.of(null)],
    });
  }

  /** 保留中の変更（待ち時間中の変更・JS の未適用の変更）があれば、すぐに onChange で渡す */
  commit(): boolean {
    if (this.timer === null && !this.draft) return false;
    this.clearTimer();
    this.setDraft(false);
    this.emit();
    return true;
  }

  /** 保留中の変更を親に渡さずに捨てる（「元に戻す」の前に使う） */
  discardPending(): void {
    this.clearTimer();
    this.setDraft(false);
    this.lastEmitted = null;
  }

  /** 保留中の変更を渡してからエディタを破棄する */
  destroy(): void {
    if (this.timer !== null || this.draft) {
      this.clearTimer();
      // 破棄した後は React の状態を更新しないよう、onDraftChange は呼ばない
      this.draft = false;
      this.emit();
    }
    this.view.destroy();
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(darkHighlightStyle),
        Prec.highest(
          keymap.of([
            // JS の「適用」。JS 以外では既定の動作（空行の挿入）のままにする
            { key: "Mod-Enter", run: () => requiresApply(this.path) && (this.commit(), true) },
            // ブラウザの「ページを保存」を出さず、保留中の変更をすぐ渡す
            { key: "Mod-s", run: () => (this.commit(), true), preventDefault: true },
          ]),
        ),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        this.languageCompartment.of(languageExtension(getEditorLanguage(this.path))),
        this.readOnlyCompartment.of(readOnlyExtension(this.readOnly)),
        highlightField,
        editorTheme,
        EditorView.updateListener.of((update) => this.handleUpdate(update)),
      ],
    });
  }

  private handleUpdate(update: ViewUpdate): void {
    if (update.transactions.some((transaction) => transaction.annotation(externalChange))) return;
    if (update.selectionSet) {
      this.callbacks.onCursorChange(update.state.selection.main.head);
    }
    if (update.docChanged) {
      this.scheduleChange();
    }
  }

  private scheduleChange(): void {
    if (requiresApply(this.path)) {
      this.setDraft(true);
      return;
    }
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit();
    }, this.debounceMs);
  }

  private setValue(value: string): void {
    if (value === this.lastEmitted) {
      // 自分が渡したテキストのこだま。その後さらに入力していても、エディタの内容を巻き戻さない
      this.lastEmitted = null;
      return;
    }
    const current = this.view.state.doc.toString();
    const change = diffText(current, value);
    if (!change) return;
    // 外からの変更を優先し、保留中の変更は捨てる
    this.discardPending();
    const { scrollTop, scrollLeft } = this.view.scrollDOM;
    this.view.dispatch({ changes: change, annotations: externalChange.of(true) });
    this.view.scrollDOM.scrollTop = scrollTop;
    this.view.scrollDOM.scrollLeft = scrollLeft;
  }

  private switchFile(path: string, value: string): void {
    // 前のファイルの保留中の変更は前のファイルのものとして渡す
    this.commit();
    this.path = path;
    this.lastEmitted = null;
    // 元に戻す履歴がファイルをまたがないよう、状態ごと作り直す
    this.view.setState(this.createState(value));
  }

  private emit(): void {
    const text = this.view.state.doc.toString();
    this.lastEmitted = text;
    this.callbacks.onChange(text, this.path);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private setDraft(draft: boolean): void {
    if (draft === this.draft) return;
    this.draft = draft;
    this.callbacks.onDraftChange(draft);
  }
}
