import { describe, expect, it } from "vitest";
import { isFrameMessage, isParentMessage } from "./messages";

describe("isFrameMessage", () => {
  it.each([
    { type: "review:ready" },
    { type: "review:hover", elementId: "3" },
    { type: "review:hover", elementId: null },
    { type: "review:select", elementId: "3", generated: false },
    { type: "review:select", elementId: null, generated: true },
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
  ])("不正なメッセージを拒否する: %o", (message) => {
    expect(isParentMessage(message)).toBe(false);
  });
});
