// 親アプリ側から Service Worker を登録し、ファイルを渡す
import {
  serviceWorkerScriptUrl,
  type ParentToWorkerMessage,
  type VirtualFile,
  type WorkerAckMessage,
} from "../shared";
import { PreviewError } from "./errors";
import type { WorkerClaimMessage } from "./worker/messages";

/** navigator.serviceWorker のうち、ここで使う部分。テストではモックを渡す */
export type ServiceWorkerContainerLike = Pick<
  ServiceWorkerContainer,
  "controller" | "ready" | "register" | "addEventListener" | "removeEventListener"
>;

/** 制御下に入るまで待つ時間の既定値（ミリ秒）。ready の後から数える */
export const DEFAULT_CONTROLLER_TIMEOUT_MS = 10_000;
/** sw:ack を待つ時間の既定値（ミリ秒）。画像の多いサイトでも IndexedDB への保存が終わるよう長めにする */
export const DEFAULT_ACK_TIMEOUT_MS = 30_000;

function defaultContainer(): ServiceWorkerContainerLike {
  const container = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  if (!container) {
    throw new PreviewError(
      "unsupported",
      "Service Worker を使えないため、プレビューを表示できません。Chrome で、localhost か HTTPS の URL から開いてください。",
    );
  }
  return container;
}

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `${Date.now().toString(36)}-${requestCounter}`;
}

export interface RegisterOptions {
  container?: ServiceWorkerContainerLike;
  /** 既定は import.meta.env.DEV。開発時は TS のソースを、ビルド後は /sw.js を登録する */
  isDev?: boolean;
  timeoutMs?: number;
}

/**
 * Service Worker を登録し、**このページが制御下に入るまで**待つ。
 * ready（有効になった）だけでは、登録直後のページはまだ制御下になく、
 * そのまま iframe を開くと Service Worker を通らずに 404 になるため、controller が設定されるまで待つ。
 * Shift+再読み込みなどで制御下に入らずに開かれた場合は、Service Worker に clients.claim() を依頼する
 */
export async function registerPreviewWorker(
  options: RegisterOptions = {},
): Promise<ServiceWorkerRegistration> {
  const container = options.container ?? defaultContainer();
  const isDev = options.isDev ?? import.meta.env.DEV;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONTROLLER_TIMEOUT_MS;

  // 登録より前に聞き始め、登録中に起きた controllerchange も取りこぼさない
  let onControllerChange = (): void => undefined;
  const controllerChanged = new Promise<void>((resolve) => {
    onControllerChange = resolve;
  });
  container.addEventListener("controllerchange", onControllerChange);

  try {
    // 開発時は Vite が TS を ES モジュールとして配信するため type: "module" が必要。
    // スコープ "/" は Service-Worker-Allowed ヘッダーで許可している（vite.config.ts）
    await container.register(serviceWorkerScriptUrl(isDev), { type: "module", scope: "/" });
    const registration = await container.ready;
    if (container.controller) return registration;

    const claim: WorkerClaimMessage = { type: "sw:claim", requestId: nextRequestId() };
    registration.active?.postMessage(claim);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new PreviewError(
              "no-controller",
              "Service Worker の準備が終わりませんでした。ページを再読み込みしてください。",
            ),
          ),
        timeoutMs,
      );
    });
    try {
      await Promise.race([controllerChanged, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return registration;
  } finally {
    container.removeEventListener("controllerchange", onControllerChange);
  }
}

function isWorkerAck(value: unknown): value is WorkerAckMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === "sw:ack" &&
    typeof record.requestId === "string" &&
    typeof record.ok === "boolean"
  );
}

export interface SendOptions {
  container?: ServiceWorkerContainerLike;
  timeoutMs?: number;
}

type ParentToWorkerBody =
  | Omit<Extract<ParentToWorkerMessage, { type: "sw:put-files" }>, "requestId">
  | Omit<Extract<ParentToWorkerMessage, { type: "sw:clear" }>, "requestId">;

/**
 * このページを制御している Service Worker にメッセージを送り、sw:ack を待つ。
 * 返事は MessageChannel の port で受け取る（requestId も照合する）
 */
async function sendToWorker(body: ParentToWorkerBody, options: SendOptions): Promise<void> {
  const container = options.container ?? defaultContainer();
  const controller = container.controller;
  if (!controller) {
    throw new PreviewError(
      "no-controller",
      "Service Worker の制御下にありません。registerPreviewWorker() の完了を待ってから送ってください。",
    );
  }

  const message = { ...body, requestId: nextRequestId() } as ParentToWorkerMessage;
  const channel = new MessageChannel();
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new PreviewError("timeout", "Service Worker から応答がありませんでした。")),
        timeoutMs,
      );
      channel.port1.onmessage = (event: MessageEvent) => {
        const ack: unknown = event.data;
        if (!isWorkerAck(ack) || ack.requestId !== message.requestId) return;
        if (ack.ok) resolve();
        else
          reject(
            new PreviewError(
              "worker-error",
              `Service Worker での処理に失敗しました: ${ack.error ?? "原因不明"}`,
            ),
          );
      };
      // ArrayBuffer は transfer せずに複製して送る（呼び出し側が持つ元のファイルを使えなくしないため）
      controller.postMessage(message, [channel.port2]);
    });
  } finally {
    clearTimeout(timer);
    channel.port1.onmessage = null;
    channel.port1.close();
  }
}

/**
 * セッションのファイル群を Service Worker に渡し、保存（IndexedDB を含む）が終わるまで待つ。
 * セッションのファイルはまるごと置き換わる（渡さなかったファイルは消える）
 */
export function putFiles(
  sessionId: string,
  files: readonly VirtualFile[],
  options: SendOptions = {},
): Promise<void> {
  return sendToWorker({ type: "sw:put-files", sessionId, files: [...files] }, options);
}

/** セッションのファイルを Service Worker から破棄する */
export function clearFiles(sessionId: string, options: SendOptions = {}): Promise<void> {
  return sendToWorker({ type: "sw:clear", sessionId }, options);
}
