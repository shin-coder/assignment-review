import { pickDirectory } from "../loader";
import { clearFiles, postToFrame, registerPreviewWorker } from "../preview";
import { IndexedDbProjectRepository } from "../store";
import type { AppDeps } from "./deps";

/** 本番用の依存。main.tsx から App に渡す */
export function createDefaultDeps(): AppDeps {
  return {
    repository: new IndexedDbProjectRepository(),
    registerWorker: () => registerPreviewWorker(),
    clearFiles: (sessionId) => clearFiles(sessionId),
    postToFrame,
    // E2E は addInitScript で window.showDirectoryPicker を差し替えるため、呼ぶたびに window から読む
    pickDirectory: () => pickDirectory(window),
    isPickerSupported: () => typeof window.showDirectoryPicker === "function",
    isDev: import.meta.env.DEV,
  };
}
