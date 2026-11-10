import { describe, expect, it, vi } from "vitest";
import { LoaderError } from "./errors";
import { pickDirectory } from "./pickDirectory";

const handle = { kind: "directory", name: "site" } as unknown as FileSystemDirectoryHandle;

describe("pickDirectory", () => {
  it("読み取り専用でフォルダ選択を開き、選ばれたフォルダを返す", async () => {
    const showDirectoryPicker = vi.fn().mockResolvedValue(handle);

    await expect(pickDirectory({ showDirectoryPicker })).resolves.toBe(handle);
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: "read" });
  });

  it("キャンセル（AbortError）されたら null を返す", async () => {
    const showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException("The user aborted a request.", "AbortError"));

    await expect(pickDirectory({ showDirectoryPicker })).resolves.toBeNull();
  });

  it("キャンセル以外のエラーはそのまま投げる", async () => {
    const error = new DOMException("denied", "SecurityError");
    const showDirectoryPicker = vi.fn().mockRejectedValue(error);

    await expect(pickDirectory({ showDirectoryPicker })).rejects.toBe(error);
  });

  it("showDirectoryPicker がないブラウザではエラーになる", async () => {
    const result = await pickDirectory({ showDirectoryPicker: undefined }).catch((e: unknown) => e);

    expect(result).toBeInstanceOf(LoaderError);
    expect((result as LoaderError).code).toBe("unsupported-browser");
    expect((result as LoaderError).message).toContain("Chrome");
  });
});
