import { afterEach, describe, expect, it, vi } from "vitest";
import { onFrameMessage, postToFrame } from "./frame-messages";

function addIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  return iframe;
}

function dispatchFromFrame(
  data: unknown,
  source: Window | null,
  origin: string = window.location.origin,
): void {
  window.dispatchEvent(new MessageEvent("message", { data, source, origin }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("onFrameMessage", () => {
  it("対象の iframe からの正しいメッセージを受け取る", () => {
    const iframe = addIframe();
    const handler = vi.fn();
    const stop = onFrameMessage(iframe, handler);

    dispatchFromFrame(
      { type: "review:select", elementId: "3", generated: false },
      iframe.contentWindow,
    );

    expect(handler).toHaveBeenCalledWith(
      { type: "review:select", elementId: "3", generated: false },
      expect.any(MessageEvent),
    );
    stop();
  });

  it("型ガードを通らないメッセージを無視する", () => {
    const iframe = addIframe();
    const handler = vi.fn();
    const stop = onFrameMessage(iframe, handler);

    dispatchFromFrame({ type: "review:select", elementId: "3" }, iframe.contentWindow);
    dispatchFromFrame({ type: "review:highlight", elementId: "3" }, iframe.contentWindow);
    dispatchFromFrame("review:ready", iframe.contentWindow);

    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  it("別の送信元・別のオリジンのメッセージを無視する", () => {
    const iframe = addIframe();
    const other = addIframe();
    const handler = vi.fn();
    const stop = onFrameMessage(iframe, handler);

    dispatchFromFrame({ type: "review:ready" }, other.contentWindow);
    dispatchFromFrame({ type: "review:ready" }, window);
    dispatchFromFrame({ type: "review:ready" }, null);
    dispatchFromFrame({ type: "review:ready" }, iframe.contentWindow, "https://example.com");

    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  it("関数で渡すと、その時点の iframe を対象にする（作り直しに追従する）", () => {
    const first = addIframe();
    const second = addIframe();
    let current: HTMLIFrameElement | null = first;
    const handler = vi.fn();
    const stop = onFrameMessage(() => current, handler);

    current = second;
    dispatchFromFrame({ type: "review:ready" }, first.contentWindow);
    expect(handler).not.toHaveBeenCalled();
    dispatchFromFrame({ type: "review:ready" }, second.contentWindow);
    expect(handler).toHaveBeenCalledOnce();

    current = null;
    dispatchFromFrame({ type: "review:ready" }, second.contentWindow);
    expect(handler).toHaveBeenCalledOnce();
    stop();
  });

  it("戻り値の関数を呼ぶと受け取りをやめる", () => {
    const iframe = addIframe();
    const handler = vi.fn();
    onFrameMessage(iframe, handler)();

    dispatchFromFrame({ type: "review:ready" }, iframe.contentWindow);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("postToFrame", () => {
  it("iframe のウィンドウに自分のオリジン宛てで送る", () => {
    const iframe = addIframe();
    const target = iframe.contentWindow as Window;
    const postMessage = vi.spyOn(target, "postMessage").mockImplementation(() => undefined);

    expect(postToFrame(iframe, { type: "review:highlight", elementId: "1" })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "review:highlight", elementId: "1" },
      window.location.origin,
    );
  });

  it("iframe がまだ文書に入っていなければ false を返す", () => {
    const iframe = document.createElement("iframe");
    expect(postToFrame(iframe, { type: "review:highlight", elementId: null })).toBe(false);
  });
});
