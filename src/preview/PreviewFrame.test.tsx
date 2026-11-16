import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewUrl, type VirtualFile } from "../shared";
import { PreviewFrame, type PreviewFrameProps } from "./PreviewFrame";

/** 外から解決できる Promise */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const files: VirtualFile[] = [{ path: "index.html", mimeType: "text/html", content: "<p>a</p>" }];

function setup(props: Partial<PreviewFrameProps> = {}) {
  const sendFiles = props.sendFiles ?? vi.fn(async () => undefined);
  const base: PreviewFrameProps = {
    sessionId: "s1",
    files,
    entryPath: "index.html",
    workerReady: Promise.resolve(),
    ...props,
    sendFiles,
  };
  const result = render(<PreviewFrame {...base} />);
  const rerender = (next: Partial<PreviewFrameProps>) =>
    result.rerender(<PreviewFrame {...base} {...next} />);
  return { ...result, sendFiles, rerender };
}

const findFrame = () => screen.findByTitle<HTMLIFrameElement>("プレビュー");
const queryFrame = () => screen.queryByTitle("プレビュー");

// Vitest の globals を使っていないため、Testing Library の自動の後片付けが動かない
afterEach(cleanup);

describe("PreviewFrame", () => {
  it("Service Worker の準備と putFiles が終わるまで iframe を描画しない", async () => {
    const worker = deferred();
    const send = deferred();
    const sendFiles = vi.fn(() => send.promise);
    setup({ workerReady: worker.promise, sendFiles });

    expect(screen.getByRole("status")).toHaveTextContent("準備しています");
    expect(queryFrame()).toBeNull();

    await act(async () => worker.resolve());
    expect(sendFiles).toHaveBeenCalledWith("s1", files);
    expect(queryFrame()).toBeNull();

    await act(async () => send.resolve());
    const iframe = await findFrame();
    expect(iframe.getAttribute("src")).toBe(previewUrl("s1", "index.html"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("iframe の中に React で何も描画しない", async () => {
    setup();
    const iframe = await findFrame();
    expect(iframe.childNodes).toHaveLength(0);
    expect(iframe.contentDocument?.body?.childNodes.length ?? 0).toBe(0);
  });

  it("rebuildKey が変わったら、送り直してから iframe を作り直す", async () => {
    const { rerender, sendFiles } = setup({ rebuildKey: 1 });
    const first = await findFrame();

    const send = deferred();
    vi.mocked(sendFiles).mockImplementationOnce(() => send.promise);
    rerender({ rebuildKey: 2 });
    // 送り終えるまでは前の iframe を表示したまま
    expect(await findFrame()).toBe(first);

    await act(async () => send.resolve());
    await waitFor(() => expect(queryFrame()).not.toBe(first));
    expect(first.isConnected).toBe(false);
    expect(sendFiles).toHaveBeenCalledTimes(2);
  });

  it("files だけが変わったときは送り直すが、iframe は作り直さない", async () => {
    const { rerender, sendFiles } = setup();
    const first = await findFrame();

    const nextFiles: VirtualFile[] = [
      ...files,
      { path: "style.css", mimeType: "text/css", content: "p{}" },
    ];
    rerender({ files: nextFiles });

    await waitFor(() => expect(sendFiles).toHaveBeenLastCalledWith("s1", nextFiles));
    expect(await findFrame()).toBe(first);
    expect(first.isConnected).toBe(true);
  });

  it("別のセッションに切り替えたら、送り終えるまで読み込み中を表示する", async () => {
    const { rerender, sendFiles } = setup();
    await findFrame();

    const send = deferred();
    vi.mocked(sendFiles).mockImplementationOnce(() => send.promise);
    rerender({ sessionId: "s2" });
    expect(queryFrame()).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => send.resolve());
    expect((await findFrame()).getAttribute("src")).toBe(previewUrl("s2", "index.html"));
  });

  it("iframe の load と review:ready を親に通知する", async () => {
    const onLoad = vi.fn();
    const onReady = vi.fn();
    const onMessage = vi.fn();
    setup({ onLoad, onReady, onMessage });
    const iframe = await findFrame();

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(onLoad).toHaveBeenCalledWith(iframe);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "review:ready" },
          source: iframe.contentWindow,
          origin: window.location.origin,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "review:hover", elementId: "2" },
          source: iframe.contentWindow,
          origin: window.location.origin,
        }),
      );
      // 別の送信元は無視する
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "review:ready" },
          source: window,
          origin: window.location.origin,
        }),
      );
    });
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(iframe);
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenLastCalledWith({ type: "review:hover", elementId: "2" }, iframe);
  });

  it("ref で iframe の要素を受け取れる", async () => {
    const ref = { current: null as HTMLIFrameElement | null };
    setup({ ref });
    const iframe = await findFrame();
    expect(ref.current).toBe(iframe);
  });

  it("準備に失敗したらエラーを表示して通知し、iframe は描画しない", async () => {
    const onError = vi.fn();
    setup({ workerReady: Promise.reject(new Error("登録できません")), onError });

    expect(await screen.findByRole("alert")).toHaveTextContent("登録できません");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "登録できません" }));
    expect(queryFrame()).toBeNull();
  });
});
