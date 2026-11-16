import { describe, expect, it, vi } from "vitest";
import type { ParentToWorkerMessage, VirtualFile } from "../shared";
import { PreviewError } from "./errors";
import {
  clearFiles,
  putFiles,
  registerPreviewWorker,
  type ServiceWorkerContainerLike,
} from "./worker-client";

type ControllerLike = Pick<ServiceWorker, "postMessage">;

/** navigator.serviceWorker のモック。ready は最初から解決済み */
function mockContainer(initialController: ControllerLike | null = null) {
  const events = new EventTarget();
  const active = { postMessage: vi.fn() };
  const registration = { active } as unknown as ServiceWorkerRegistration;
  const state = {
    controller: initialController,
    ready: Promise.resolve(registration),
    register: vi.fn(async () => registration),
    addEventListener: vi.fn((type: string, listener: EventListener) =>
      events.addEventListener(type, listener),
    ),
    removeEventListener: vi.fn((type: string, listener: EventListener) =>
      events.removeEventListener(type, listener),
    ),
  };
  return {
    container: state as unknown as ServiceWorkerContainerLike,
    state,
    active,
    registration,
    /** Service Worker が clients.claim() してこのページの controller が設定されたことにする */
    takeControl(controller: ControllerLike = { postMessage: vi.fn() }) {
      state.controller = controller;
      events.dispatchEvent(new Event("controllerchange"));
    },
  };
}

/** Promise が解決・拒否されたかどうかを、マイクロタスクを流してから調べる */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return settled;
}

describe("registerPreviewWorker", () => {
  it("module 形式・スコープ / で登録する（開発時は TS、ビルド後は /sw.js）", async () => {
    const dev = mockContainer({ postMessage: vi.fn() });
    await registerPreviewWorker({ container: dev.container, isDev: true });
    expect(dev.state.register).toHaveBeenCalledWith("/src/sw/sw.ts", {
      type: "module",
      scope: "/",
    });

    const prod = mockContainer({ postMessage: vi.fn() });
    await registerPreviewWorker({ container: prod.container, isDev: false });
    expect(prod.state.register).toHaveBeenCalledWith("/sw.js", { type: "module", scope: "/" });
  });

  it("ready が解決済みでも、controller が null の間は解決しない", async () => {
    const mock = mockContainer(null);
    const promise = registerPreviewWorker({ container: mock.container, isDev: false });

    expect(await isSettled(promise)).toBe(false);

    mock.takeControl();
    await expect(promise).resolves.toBe(mock.registration);
    // 聞き終えたら controllerchange のリスナーを外す
    expect(mock.state.removeEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
  });

  it("controller がまだないときは、有効な Service Worker に clients.claim() を依頼する", async () => {
    const mock = mockContainer(null);
    const promise = registerPreviewWorker({ container: mock.container, isDev: false });
    await isSettled(promise);

    expect(mock.active.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sw:claim", requestId: expect.any(String) }),
    );
    mock.takeControl();
    await promise;
  });

  it("すでに制御下にあれば claim を依頼せずに解決する", async () => {
    const mock = mockContainer({ postMessage: vi.fn() });
    await expect(registerPreviewWorker({ container: mock.container, isDev: false })).resolves.toBe(
      mock.registration,
    );
    expect(mock.active.postMessage).not.toHaveBeenCalled();
  });

  it("決められた時間内に制御下に入らなければ no-controller で失敗する", async () => {
    vi.useFakeTimers();
    try {
      const mock = mockContainer(null);
      const promise = registerPreviewWorker({
        container: mock.container,
        isDev: false,
        timeoutMs: 1000,
      });
      const result = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1000);
      const error = await result;
      expect(error).toBeInstanceOf(PreviewError);
      expect((error as PreviewError).code).toBe("no-controller");
    } finally {
      vi.useRealTimers();
    }
  });

  it("登録に失敗したらそのエラーで失敗する", async () => {
    const mock = mockContainer(null);
    mock.state.register.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(registerPreviewWorker({ container: mock.container })).rejects.toThrow(
      "SecurityError",
    );
  });

  it("Service Worker を使えない環境では unsupported で失敗する", async () => {
    // jsdom の navigator には serviceWorker がない
    const error = await registerPreviewWorker().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreviewError);
    expect((error as PreviewError).code).toBe("unsupported");
  });
});

/** postMessage を受け取ったら respond の結果を port で返す controller */
function respondingController(
  respond: (message: ParentToWorkerMessage) => unknown,
): ControllerLike & { postMessage: ReturnType<typeof vi.fn> } {
  return {
    postMessage: vi.fn((message: ParentToWorkerMessage, transfer: Transferable[]) => {
      const port = transfer[0] as MessagePort;
      port.postMessage(respond(message));
    }),
  };
}

const files: VirtualFile[] = [
  { path: "index.html", mimeType: "text/html", content: "<p>a</p>" },
  { path: "a.png", mimeType: "image/png", content: new Uint8Array([1]).buffer },
];

describe("putFiles / clearFiles", () => {
  it("sw:put-files を送り、同じ requestId の sw:ack(ok) で解決する", async () => {
    const controller = respondingController((message) => ({
      type: "sw:ack",
      requestId: message.requestId,
      ok: true,
    }));
    const { container } = mockContainer(controller);

    await putFiles("s1", files, { container });

    const [message, transfer] = controller.postMessage.mock.calls[0] as [
      ParentToWorkerMessage,
      Transferable[],
    ];
    expect(message).toMatchObject({ type: "sw:put-files", sessionId: "s1", files });
    // 送るのは返事用の port だけで、ArrayBuffer は transfer しない
    expect(transfer).toHaveLength(1);
    expect(files[1]?.content).toHaveProperty("byteLength", 1);
  });

  it("sw:clear を送る", async () => {
    const controller = respondingController((message) => ({
      type: "sw:ack",
      requestId: message.requestId,
      ok: true,
    }));
    const { container } = mockContainer(controller);

    await clearFiles("s1", { container });
    expect(controller.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "sw:clear",
      sessionId: "s1",
    });
  });

  it("sw:ack が ok: false なら worker-error で失敗する", async () => {
    const controller = respondingController((message) => ({
      type: "sw:ack",
      requestId: message.requestId,
      ok: false,
      error: "容量不足",
    }));
    const { container } = mockContainer(controller);

    const error = await putFiles("s1", files, { container }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreviewError);
    expect((error as PreviewError).code).toBe("worker-error");
    expect((error as PreviewError).message).toContain("容量不足");
  });

  it("requestId が違う返事は無視し、応答がなければ timeout で失敗する", async () => {
    const controller = respondingController(() => ({
      type: "sw:ack",
      requestId: "other",
      ok: true,
    }));
    const { container } = mockContainer(controller);

    const error = await putFiles("s1", files, { container, timeoutMs: 50 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PreviewError);
    expect((error as PreviewError).code).toBe("timeout");
  });

  it("制御下にないときは no-controller で失敗する", async () => {
    const { container } = mockContainer(null);
    const error = await putFiles("s1", files, { container }).catch((e: unknown) => e);
    expect((error as PreviewError).code).toBe("no-controller");
  });
});
