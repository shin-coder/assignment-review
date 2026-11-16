import type { CSSProperties } from "react";

export interface FileTabItem {
  /** ファイルのパス（正規化済み） */
  path: string;
  /** 元のソースから編集されているか。true なら目印を付ける */
  modified?: boolean;
}

export interface FileTabsProps {
  files: FileTabItem[];
  /** 選択中のファイルのパス。どれも選ばれていなければ null */
  activePath: string | null;
  onSelect: (path: string) => void;
  /** 渡したときだけ各タブに「閉じる」ボタンを出す */
  onClose?: (path: string) => void;
}

const styles = {
  list: {
    display: "flex",
    gap: "2px",
    overflowX: "auto",
    borderBottom: "1px solid #ddd",
    fontSize: "16px",
  },
  item: { display: "flex", alignItems: "center", flexShrink: 0 },
  tab: {
    padding: "8px 12px",
    border: "none",
    borderBottom: "3px solid transparent",
    background: "transparent",
    font: "inherit",
    cursor: "pointer",
  },
  activeTab: { borderBottomColor: "#1a73e8", fontWeight: "bold" },
  mark: { marginLeft: "6px", color: "#e37400" },
  close: { border: "none", background: "transparent", font: "inherit", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** 開いているファイルの切り替えタブ。同じファイル名が複数あるときはパス全体を表示する */
export function FileTabs({ files, activePath, onSelect, onClose }: FileTabsProps) {
  const nameCounts = new Map<string, number>();
  for (const file of files) {
    const name = baseName(file.path);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return (
    <div role="tablist" aria-label="開いているファイル" style={styles.list}>
      {files.map((file) => {
        const name = baseName(file.path);
        const label = (nameCounts.get(name) ?? 0) > 1 ? file.path : name;
        const active = file.path === activePath;
        return (
          <div key={file.path} style={styles.item}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={file.path}
              style={active ? { ...styles.tab, ...styles.activeTab } : styles.tab}
              onClick={() => onSelect(file.path)}
            >
              {label}
              {file.modified && (
                <span style={styles.mark} title="編集済み" aria-label="編集済み">
                  ●
                </span>
              )}
            </button>
            {onClose && (
              <button
                type="button"
                style={styles.close}
                aria-label={`${file.path} を閉じる`}
                onClick={() => onClose(file.path)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
