import { normalizePath, type VirtualFile, type VirtualFileSystem } from "../shared";
import { LoaderError } from "./errors";
import { getMimeType, isTextPath } from "./mime";

// FileSystemDirectoryHandle のうち、読み込みに必要な最小限だけに依存する。
// 書き込み系のメソッド（createWritable / removeEntry / getFileHandle({ create: true }) など）は
// 型に含めないので、この層からは呼べない。テストや E2E では偽のハンドルを渡せる

export interface FileLike {
  readonly size: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<FileLike>;
}

export interface DirectoryHandleLike {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}

export interface LoadOptions {
  /** 読み込むファイル数の上限 */
  maxFiles?: number;
  /** 読み込むファイルの合計サイズの上限（バイト） */
  maxTotalBytes?: number;
}

export const DEFAULT_MAX_FILES = 2000;
export const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export interface LoadedDirectory {
  /** 選んだフォルダの名前 */
  name: string;
  files: VirtualFileSystem;
}

/** 生徒のサイトに関係しないため読み込まない名前 */
const EXCLUDED_NAMES = new Set(["node_modules", "Thumbs.db"]);

/** ドットで始まるもの（.git / .DS_Store / .vscode など）と EXCLUDED_NAMES は読み込まない */
export function isExcludedName(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_NAMES.has(name);
}

/** フォルダを再帰的に辿り、仮想ファイル群として読み込む。フォルダには書き込まない */
export async function loadDirectory(
  root: DirectoryHandleLike,
  options: LoadOptions = {},
): Promise<LoadedDirectory> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const files: VirtualFileSystem = new Map();
  let totalBytes = 0;

  const walk = async (directory: DirectoryHandleLike, prefix: string): Promise<void> => {
    const entries: (FileHandleLike | DirectoryHandleLike)[] = [];
    for await (const entry of directory.values()) {
      if (!isExcludedName(entry.name)) entries.push(entry);
    }
    // 読み込み順（= Map の順）をフォルダの中身の返り順に左右されないようにする
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const path = normalizePath(prefix === "" ? entry.name : `${prefix}/${entry.name}`);
      if (entry.kind === "directory") {
        await walk(entry, path);
        continue;
      }

      if (files.size >= maxFiles) {
        throw new LoaderError(
          "too-many-files",
          `ファイル数が上限（${maxFiles} 件）を超えています。サイトのフォルダだけを選んでください。`,
        );
      }
      const file = await entry.getFile();
      totalBytes += file.size;
      if (totalBytes > maxTotalBytes) {
        throw new LoaderError(
          "too-large",
          `ファイルの合計サイズが上限（${formatMegabytes(maxTotalBytes)}）を超えています。サイトのフォルダだけを選んでください。`,
        );
      }

      const virtualFile: VirtualFile = {
        path,
        mimeType: getMimeType(path),
        content: isTextPath(path) ? await file.text() : await file.arrayBuffer(),
      };
      files.set(path, virtualFile);
    }
  };

  await walk(root, "");
  return { name: root.name, files };
}

function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
