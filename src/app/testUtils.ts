// テスト用の補助（本体からは使わない）
import type { ElementId, LayerNode, VirtualFile } from "../shared";
import { SourceStore } from "../store";
import type { ReviewState } from "./reviewController";

export const INDEX_HTML =
  '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head>' +
  '<body><h1>title</h1><p class="a">first</p><p class="b">second</p>' +
  '<script src="app.js"></script></body></html>';

export function textFile(path: string, content: string, mimeType: string): VirtualFile {
  return { path, mimeType, content };
}

export function createStore(
  overrides: Record<string, string> = {},
  projectId = "project-1",
): SourceStore {
  const texts: Record<string, [string, string]> = {
    "index.html": [INDEX_HTML, "text/html"],
    "style.css": ["h1 { color: red; }", "text/css"],
    "app.js": ["console.log(1);", "text/javascript"],
  };
  const originalFiles = new Map<string, VirtualFile>();
  for (const [path, [content, mimeType]] of Object.entries(texts)) {
    originalFiles.set(path, textFile(path, overrides[path] ?? content, mimeType));
  }
  return new SourceStore({ projectId, name: "student-site", originalFiles });
}

/** ツリーから、ラベルが prefix で始まる最初のノードの ID を返す */
export function idOf(state: Pick<ReviewState, "tree">, prefix: string): ElementId {
  const walk = (nodes: readonly LayerNode[]): ElementId | null => {
    for (const node of nodes) {
      if (node.label.startsWith(prefix)) return node.id;
      const found = walk(node.children);
      if (found !== null) return found;
    }
    return null;
  };
  const id = walk(state.tree);
  if (id === null) throw new Error(`ノードが見つかりません: ${prefix}`);
  return id;
}
