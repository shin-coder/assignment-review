import { describe, expect, it, vi } from "vitest";
import { PREVIEW_PREFIX, type VirtualFile } from "../../shared";
import { createMemoryBackend, createPreviewFileStore, type PreviewFileStore } from "./fileStore";
import { handleWorkerMessage, isPreviewWorkerMessage } from "./messages";
import { handlePreviewFetch } from "./serve";

const ORIGIN = "http://localhost:5173";

const files: VirtualFile[] = [
  { path: "index.html", mimeType: "text/html", content: "<p>本文</p>" },
  { path: "a.png", mimeType: "image/png", content: new Uint8Array([7, 8, 9]).buffer },
];

function context(store: PreviewFileStore = createPreviewFileStore(createMemoryBackend())) {
  return { store, claim: vi.fn(async () => undefined) };
}

describe("isPreviewWorkerMessage", () => {
  it.each([
    { type: "sw:put-files", requestId: "1", sessionId: "s", files },
    { type: "sw:put-files", requestId: "1", sessionId: "s", files: [] },
    { type: "sw:clear", requestId: "1", sessionId: "s" },
    { type: "sw:claim", requestId: "1" },
  ])("正しいメッセージを受け付ける: %o", (message) => {
    expect(isPreviewWorkerMessage(message)).toBe(true);
  });

  it.each([
    null,
    "sw:clear",
    { type: "sw:clear", sessionId: "s" },
    { type: "sw:clear", requestId: 1, sessionId: "s" },
    { type: "sw:put-files", requestId: "1", sessionId: "s" },
    { type: "sw:put-files", requestId: "1", sessionId: "s", files: [{ path: "a" }] },
    {
      type: "sw:put-files",
      requestId: "1",
      sessionId: "s",
      files: [{ path: "a", mimeType: "x", content: new Uint8Array(1) }],
    },
    { type: "sw:unknown", requestId: "1" },
    { type: "review:ready" },
  ])("不正なメッセージを拒否する: %o", (message) => {
    expect(isPreviewWorkerMessage(message)).toBe(false);
  });
});

describe("handleWorkerMessage", () => {
  it("sw:put-files で保存し、fetch でその内容を返す（テキスト・バイナリ）", async () => {
    const ctx = context();
    const ack = await handleWorkerMessage(
      { type: "sw:put-files", requestId: "r1", sessionId: "s1", files },
      ctx,
    );
    expect(ack).toEqual({ type: "sw:ack", requestId: "r1", ok: true });

    const fetchFile = (path: string) =>
      handlePreviewFetch(
        { url: `${ORIGIN}${PREVIEW_PREFIX}s1/${path}`, method: "GET" },
        ORIGIN,
        ctx.store,
      );
    expect(await (await fetchFile("index.html"))?.text()).toBe("<p>本文</p>");
    const image = await (await fetchFile("a.png"))?.arrayBuffer();
    expect(new Uint8Array(image ?? new ArrayBuffer(0))).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("sw:clear でセッションを破棄する", async () => {
    const ctx = context();
    await handleWorkerMessage(
      { type: "sw:put-files", requestId: "r1", sessionId: "s1", files },
      ctx,
    );
    const ack = await handleWorkerMessage(
      { type: "sw:clear", requestId: "r2", sessionId: "s1" },
      ctx,
    );

    expect(ack).toEqual({ type: "sw:ack", requestId: "r2", ok: true });
    expect(await ctx.store.getFile("s1", "index.html")).toBeUndefined();
  });

  it("sw:claim で claim を呼ぶ", async () => {
    const ctx = context();
    const ack = await handleWorkerMessage({ type: "sw:claim", requestId: "r3" }, ctx);
    expect(ack?.ok).toBe(true);
    expect(ctx.claim).toHaveBeenCalledOnce();
  });

  it("保存に失敗したら ok: false とエラーの内容を返す", async () => {
    const store: PreviewFileStore = {
      getFile: async () => undefined,
      putFiles: () => Promise.reject(new Error("容量不足")),
      clear: async () => undefined,
    };
    const ack = await handleWorkerMessage(
      { type: "sw:put-files", requestId: "r4", sessionId: "s1", files },
      context(store),
    );
    expect(ack).toEqual({ type: "sw:ack", requestId: "r4", ok: false, error: "容量不足" });
  });

  it("requestId 付きの不正な sw: メッセージには ok: false を返す（親が待ち続けないように）", async () => {
    const ack = await handleWorkerMessage(
      { type: "sw:put-files", requestId: "r5", sessionId: "s1" },
      context(),
    );
    expect(ack).toMatchObject({ type: "sw:ack", requestId: "r5", ok: false });
  });

  it("無関係なメッセージには null を返す", async () => {
    expect(await handleWorkerMessage({ type: "review:ready" }, context())).toBeNull();
    expect(await handleWorkerMessage("hello", context())).toBeNull();
  });
});
