// 親アプリ → Service Worker のメッセージの検証と処理。
// src/sw/sw.ts（WebWorker の型）と単体テスト（DOM の型）の両方から使う
import type { ParentToWorkerMessage, VirtualFile, WorkerAckMessage } from "../../shared";
import type { PreviewFileStore } from "./fileStore";

/**
 * このページを Service Worker の制御下に入れてもらう依頼（clients.claim() を呼ばせる）。
 * Shift+再読み込みなどで制御下に入らずに開かれたページは、activate が再び起きないため
 * controllerchange を待っても終わらない。そのときに registerPreviewWorker() が送る。
 * src/shared の ParentToWorkerMessage にはないため、ここで定義している（チケットのメモ参照）
 */
export interface WorkerClaimMessage {
  type: "sw:claim";
  requestId: string;
}

export type PreviewWorkerMessage = ParentToWorkerMessage | WorkerClaimMessage;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** 別のレルムで作られた ArrayBuffer も受け付けるよう、instanceof ではなく型タグで判定する */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function isVirtualFile(value: unknown): value is VirtualFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.mimeType === "string" &&
    (typeof value.content === "string" || isArrayBuffer(value.content))
  );
}

/** Service Worker が受け取ったメッセージを検証する */
export function isPreviewWorkerMessage(value: unknown): value is PreviewWorkerMessage {
  if (!isRecord(value) || typeof value.requestId !== "string") return false;
  switch (value.type) {
    case "sw:put-files":
      return (
        typeof value.sessionId === "string" &&
        Array.isArray(value.files) &&
        value.files.every(isVirtualFile)
      );
    case "sw:clear":
      return typeof value.sessionId === "string";
    case "sw:claim":
      return true;
    default:
      return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface WorkerMessageContext {
  store: PreviewFileStore;
  /** sw:claim を受け取ったときに呼ぶ（Service Worker では clients.claim()） */
  claim: () => Promise<void>;
}

/**
 * メッセージを処理し、返す sw:ack を作る。
 * type が "sw:" で始まり requestId を持つが中身が不正なものには ok: false を返す（親が待ち続けないように）。
 * それ以外の無関係なメッセージには null を返す
 */
export async function handleWorkerMessage(
  data: unknown,
  context: WorkerMessageContext,
): Promise<WorkerAckMessage | null> {
  if (!isPreviewWorkerMessage(data)) {
    if (
      isRecord(data) &&
      typeof data.type === "string" &&
      data.type.startsWith("sw:") &&
      typeof data.requestId === "string"
    ) {
      return {
        type: "sw:ack",
        requestId: data.requestId,
        ok: false,
        error: `不正なメッセージです: ${data.type}`,
      };
    }
    return null;
  }

  try {
    switch (data.type) {
      case "sw:put-files":
        await context.store.putFiles(data.sessionId, data.files);
        break;
      case "sw:clear":
        await context.store.clear(data.sessionId);
        break;
      case "sw:claim":
        await context.claim();
        break;
    }
    return { type: "sw:ack", requestId: data.requestId, ok: true };
  } catch (error) {
    return { type: "sw:ack", requestId: data.requestId, ok: false, error: errorMessage(error) };
  }
}
