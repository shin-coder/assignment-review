import { describe, expect, it } from "vitest";
import { isQuotaExceededError, StoreError, toStoreError } from "./errors";

describe("toStoreError", () => {
  it("容量超過は操作によらず quota-exceeded にし、元のエラーを cause に残す", () => {
    const quota = new DOMException("full", "QuotaExceededError");

    const error = toStoreError(quota, "save-failed");

    expect(error).toBeInstanceOf(StoreError);
    expect(error.code).toBe("quota-exceeded");
    expect(error.message).toContain("保存容量");
    expect(error.cause).toBe(quota);
    expect(toStoreError(quota, "load-failed").code).toBe("quota-exceeded");
  });

  it("それ以外は fallback の code にする", () => {
    const cause = new DOMException("x", "DataCloneError");

    expect(toStoreError(cause, "save-failed")).toMatchObject({ code: "save-failed", cause });
    expect(toStoreError("文字列", "load-failed").code).toBe("load-failed");
    expect(toStoreError(new Error("x"), "remove-failed").code).toBe("remove-failed");
  });

  it("StoreError はそのまま返す", () => {
    const original = new StoreError("load-failed", "読めない");

    expect(toStoreError(original, "save-failed")).toBe(original);
  });
});

describe("isQuotaExceededError", () => {
  it("name で判定する", () => {
    expect(isQuotaExceededError(new DOMException("", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaExceededError(new DOMException("", "AbortError"))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});
