import { describe, expect, it } from "vitest";
import { isFrameMessage, isParentMessage } from "./messages";

describe("isFrameMessage", () => {
  it.each([
    { type: "review:ready" },
    { type: "review:hover", elementId: "3" },
    { type: "review:hover", elementId: null },
    { type: "review:select", elementId: "3", generated: false },
    { type: "review:select", elementId: null, generated: true },
    { type: "review:rects", rects: [] },
    { type: "review:rects", rects: [{ elementId: "1", x: 0, y: -10, width: 20, height: 5 }] },
    { type: "review:key", key: "c" },
    { type: "review:key", key: "Escape" },
    { type: "review:select", elementId: "3", generated: false, point: { x: 4, y: 5 } },
  ])("正しいメッセージを受け付ける: %o", (message) => {
    expect(isFrameMessage(message)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "review:ready",
    42,
    {},
    { type: "review:unknown" },
    { type: "review:highlight", elementId: "3" },
    { type: "review:hover" },
    { type: "review:hover", elementId: 3 },
    { type: "review:select", elementId: "3" },
    { type: "review:select", elementId: "3", generated: "true" },
    { type: "review:rects" },
    { type: "review:rects", rects: [{ elementId: "1", x: 0, y: 0, width: 1 }] },
    { type: "review:rects", rects: [{ elementId: 1, x: 0, y: 0, width: 1, height: 1 }] },
    { type: "review:rects", rects: [{ elementId: "1", x: NaN, y: 0, width: 1, height: 1 }] },
    { type: "review:key", key: "x" },
    { type: "review:key", key: "C" },
    { type: "review:select", elementId: "3", generated: false, point: { x: 4 } },
  ])("不正なメッセージを拒否する: %o", (message) => {
    expect(isFrameMessage(message)).toBe(false);
  });
});

describe("isParentMessage", () => {
  it.each([
    { type: "review:highlight", elementId: "1" },
    { type: "review:highlight", elementId: null },
    { type: "review:replace-element", elementId: "1", html: "<p>a</p>" },
    { type: "review:replace-css", path: "css/style.css", text: "p{}" },
    { type: "review:mode", mode: "inspect" },
    { type: "review:mode", mode: "browse" },
    { type: "review:mode", mode: "comment" },
    { type: "review:track", elementIds: [] },
    { type: "review:track", elementIds: ["1", "2"] },
  ])("正しいメッセージを受け付ける: %o", (message) => {
    expect(isParentMessage(message)).toBe(true);
  });

  it.each([
    null,
    {},
    { type: "review:ready" },
    { type: "review:highlight" },
    { type: "review:replace-element", elementId: null, html: "" },
    { type: "review:replace-element", elementId: "1" },
    { type: "review:replace-css", path: "a.css" },
    { type: "review:replace-css", path: 1, text: "" },
    { type: "review:mode", mode: "edit" },
    { type: "review:mode" },
    { type: "review:track", elementIds: [1] },
    { type: "review:track" },
  ])("不正なメッセージを拒否する: %o", (message) => {
    expect(isParentMessage(message)).toBe(false);
  });
});
