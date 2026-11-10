import type { VirtualFileSystem } from "../shared";
import { getExtension } from "./mime";

/**
 * プレビューで最初に開く HTML を決める。
 * 1. ルートの index.html
 * 2. 最も浅い階層の HTML（同じ深さなら index.html を優先し、残りは名前順）
 * HTML がなければ null
 */
export function findEntryHtml(files: VirtualFileSystem): string | null {
  const htmlPaths = [...files.keys()].filter((path) => {
    const extension = getExtension(path);
    return extension === "html" || extension === "htm";
  });
  if (htmlPaths.length === 0) return null;
  if (htmlPaths.includes("index.html")) return "index.html";

  const depth = (path: string) => path.split("/").length;
  const isIndex = (path: string) => /(^|\/)index\.html?$/i.test(path);

  return [...htmlPaths].sort((a, b) => {
    if (depth(a) !== depth(b)) return depth(a) - depth(b);
    if (isIndex(a) !== isIndex(b)) return isIndex(a) ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  })[0]!;
}
