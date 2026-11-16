import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { VirtualFile } from "../../shared";
import {
  createIndexedDbBackend,
  createMemoryBackend,
  createPreviewFileStore,
  type PersistentFileBackend,
} from "./fileStore";

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

const html: VirtualFile = {
  path: "index.html",
  mimeType: "text/html",
  content: "<p>こんにちは</p>",
};
const css: VirtualFile = { path: "css/style.css", mimeType: "text/css", content: "p{color:red}" };
const image: VirtualFile = { path: "images/a.png", mimeType: "image/png", content: bytes(1, 2, 3) };

function spyBackend(inner: PersistentFileBackend = createMemoryBackend()) {
  return {
    loadSession: vi.fn(inner.loadSession),
    applyChanges: vi.fn(inner.applyChanges),
    deleteSession: vi.fn(inner.deleteSession),
  } satisfies PersistentFileBackend;
}

describe("createPreviewFileStore", () => {
  it("putFiles したファイルをそのまま取り出せる（テキスト・バイナリ）", async () => {
    const store = createPreviewFileStore(createMemoryBackend());
    await store.putFiles("s1", [html, css, image]);

    expect(await store.getFile("s1", "index.html")).toEqual(html);
    expect(await store.getFile("s1", "css/style.css")).toEqual(css);
    const got = await store.getFile("s1", "images/a.png");
    expect(got?.mimeType).toBe("image/png");
    expect(new Uint8Array(got?.content as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("セッションごとに分けて持つ", async () => {
    const store = createPreviewFileStore(createMemoryBackend());
    await store.putFiles("s1", [html]);
    await store.putFiles("s2", [css]);

    expect(await store.getFile("s1", "css/style.css")).toBeUndefined();
    expect(await store.getFile("s2", "css/style.css")).toEqual(css);
    expect(await store.getFile("unknown", "index.html")).toBeUndefined();
  });

  it("パスを正規化して保存・検索する", async () => {
    const store = createPreviewFileStore(createMemoryBackend());
    await store.putFiles("s1", [{ ...css, path: "./css//style.css" }]);
    expect(await store.getFile("s1", "css/style.css")).toEqual(css);
  });

  it("putFiles はセッションのファイルをまるごと置き換える", async () => {
    const store = createPreviewFileStore(createMemoryBackend());
    await store.putFiles("s1", [html, css]);
    await store.putFiles("s1", [{ ...css, content: "p{color:blue}" }]);

    expect(await store.getFile("s1", "index.html")).toBeUndefined();
    expect((await store.getFile("s1", "css/style.css"))?.content).toBe("p{color:blue}");
  });

  it("変わったファイルだけを永続化先に書き込む", async () => {
    const backend = spyBackend();
    const store = createPreviewFileStore(backend);
    await store.putFiles("s1", [html, css, image]);
    // ArrayBuffer は postMessage で複製されて届くので、同じ内容の別オブジェクトで送る
    await store.putFiles("s1", [
      html,
      { ...css, content: "p{color:blue}" },
      { ...image, content: bytes(1, 2, 3) },
    ]);

    expect(backend.applyChanges).toHaveBeenLastCalledWith(
      "s1",
      [{ ...css, content: "p{color:blue}" }],
      [],
    );
  });

  it("clear でセッションのファイルを破棄する", async () => {
    const backend = createMemoryBackend();
    const store = createPreviewFileStore(backend);
    await store.putFiles("s1", [html]);
    await store.putFiles("s2", [html]);
    await store.clear("s1");

    expect(await store.getFile("s1", "index.html")).toBeUndefined();
    expect(await store.getFile("s2", "index.html")).toEqual(html);
    // 再起動後も戻ってこない
    expect(await createPreviewFileStore(backend).getFile("s1", "index.html")).toBeUndefined();
  });

  it("永続化に失敗したら putFiles は失敗し、メモリの内容も変えない", async () => {
    const backend = spyBackend();
    const store = createPreviewFileStore(backend);
    await store.putFiles("s1", [html]);
    backend.applyChanges.mockRejectedValueOnce(new Error("容量不足"));

    await expect(store.putFiles("s1", [css])).rejects.toThrow("容量不足");
    expect(await store.getFile("s1", "index.html")).toEqual(html);
    // 失敗の後も続けて使える
    await store.putFiles("s1", [css]);
    expect(await store.getFile("s1", "css/style.css")).toEqual(css);
  });

  it("書き込みは順番に処理される", async () => {
    const store = createPreviewFileStore(createMemoryBackend());
    const first = store.putFiles("s1", [html]);
    const second = store.putFiles("s1", [css]);
    await Promise.all([first, second]);
    expect(await store.getFile("s1", "index.html")).toBeUndefined();
    expect(await store.getFile("s1", "css/style.css")).toEqual(css);
  });
});

describe("IndexedDB への保存（Service Worker の再起動）", () => {
  it("新しく作った保存先（= 再起動後）でも IndexedDB から読み込んで返す", async () => {
    const factory = new IDBFactory();
    await createPreviewFileStore(createIndexedDbBackend(factory)).putFiles("s1", [
      html,
      css,
      image,
    ]);

    const restarted = createPreviewFileStore(createIndexedDbBackend(factory));
    expect(await restarted.getFile("s1", "index.html")).toEqual(html);
    expect(await restarted.getFile("s1", "css/style.css")).toEqual(css);
    const got = await restarted.getFile("s1", "images/a.png");
    // fake-indexeddb は Node 側の structuredClone を使うため、instanceof ではなく型タグで確かめる
    expect(Object.prototype.toString.call(got?.content)).toBe("[object ArrayBuffer]");
    expect(new Uint8Array(got?.content as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("置き換え・破棄も IndexedDB に反映される", async () => {
    const factory = new IDBFactory();
    const store = createPreviewFileStore(createIndexedDbBackend(factory));
    await store.putFiles("s1", [html, css]);
    await store.putFiles("s2", [html]);
    await store.putFiles("s1", [{ ...css, content: "p{}" }]);
    await store.clear("s2");

    const backend = createIndexedDbBackend(factory);
    expect(await backend.loadSession("s1")).toEqual([{ ...css, content: "p{}" }]);
    expect(await backend.loadSession("s2")).toEqual([]);
  });

  it("再起動後の putFiles でも、前に保存したファイルの消し残しがない", async () => {
    const factory = new IDBFactory();
    await createPreviewFileStore(createIndexedDbBackend(factory)).putFiles("s1", [html, css]);

    await createPreviewFileStore(createIndexedDbBackend(factory)).putFiles("s1", [css]);

    const backend = createIndexedDbBackend(factory);
    expect(await backend.loadSession("s1")).toEqual([css]);
  });
});
