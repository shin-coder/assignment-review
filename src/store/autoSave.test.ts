import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRepository, ProjectSnapshot } from "../shared";
import { AUTO_SAVE_DELAY_MS, startAutoSave } from "./autoSave";
import { StoreError } from "./errors";
import { SourceStore } from "./sourceStore";
import { createComment, createFiles } from "./testData";

function createMockRepository() {
  const save = vi.fn<(snapshot: ProjectSnapshot) => Promise<void>>(() => Promise.resolve());
  const repository: ProjectRepository = {
    save,
    load: vi.fn(() => Promise.resolve(null)),
    list: vi.fn(() => Promise.resolve([])),
    remove: vi.fn(() => Promise.resolve()),
  };
  return { repository, save };
}

function createStore() {
  return new SourceStore({ projectId: "p1", name: "site", originalFiles: createFiles() });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startAutoSave", () => {
  it("短時間の連続変更を 1 回の保存にまとめ、最後の状態を保存する", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    startAutoSave(store, repository);

    store.setEdited("index.html", "a");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1);
    store.setEdited("index.html", "ab");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1);
    store.addComment(createComment("c1"));
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toBe(store.toSnapshot());
    expect(save.mock.calls[0]?.[0].editedTexts).toEqual({ "index.html": "ab" });
    expect(save.mock.calls[0]?.[0].comments).toHaveLength(1);
  });

  it("間が空いた変更はそれぞれ保存する", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    startAutoSave(store, repository, { delayMs: 100 });

    store.setEdited("index.html", "a");
    await vi.advanceTimersByTimeAsync(100);
    store.setEdited("index.html", "b");
    await vi.advanceTimersByTimeAsync(100);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].editedTexts).toEqual({ "index.html": "b" });
  });

  it("変更がなければ保存しない", async () => {
    const { repository, save } = createMockRepository();
    const saver = startAutoSave(createStore(), repository);

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 10);
    await saver.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("flush() で待たずにすぐ保存し、タイマーでもう一度保存しない", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    const saver = startAutoSave(store, repository);

    store.setEdited("index.html", "a");
    expect(saver.dirty).toBe(true);
    await saver.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保存中に変わった内容は、前の保存が終わってから保存する", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    let finishFirst = () => {};
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const saver = startAutoSave(store, repository, { delayMs: 10 });

    store.setEdited("index.html", "a");
    await vi.advanceTimersByTimeAsync(10);
    store.setEdited("index.html", "b");
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);

    finishFirst();
    await saver.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].editedTexts).toEqual({ "index.html": "b" });
  });

  it("保存の失敗（容量超過）を StoreError で onError に伝え、flush() で保存し直せる", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    save.mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
    const onError = vi.fn();
    const onSaved = vi.fn();
    const saver = startAutoSave(store, repository, { onError, onSaved });

    store.setEdited("index.html", "a");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);

    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]?.[0] as StoreError;
    expect(error).toBeInstanceOf(StoreError);
    expect(error.code).toBe("quota-exceeded");
    expect(onSaved).not.toHaveBeenCalled();
    expect(saver.dirty).toBe(true);

    await saver.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith(store.toSnapshot());
    expect(saver.dirty).toBe(false);
  });

  it("onError を省略すると console.error に出す", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    save.mockRejectedValueOnce(new Error("x"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    startAutoSave(store, repository);

    store.setEdited("index.html", "a");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);

    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ code: "save-failed" }));
  });

  it("dispose() 後は変更しても保存しない", async () => {
    const store = createStore();
    const { repository, save } = createMockRepository();
    const saver = startAutoSave(store, repository);

    store.setEdited("index.html", "a");
    saver.dispose();
    store.setEdited("index.html", "b");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });
});
