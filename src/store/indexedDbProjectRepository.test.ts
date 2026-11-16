import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectSnapshot } from "../shared";
import { StoreError } from "./errors";
import { DB_VERSION, IndexedDbProjectRepository, STORE_NAMES } from "./indexedDbProjectRepository";
import { SourceStore } from "./sourceStore";
import { createComment, createFiles, PNG_BYTES } from "./testData";

// テストごとに別の DB を使い、互いに影響しないようにする
let dbCount = 0;
const opened: IndexedDbProjectRepository[] = [];

function uniqueDbName(): string {
  dbCount += 1;
  return `store-test-${dbCount}`;
}

function createRepository(dbName: string): IndexedDbProjectRepository {
  const repository = new IndexedDbProjectRepository({ dbName });
  opened.push(repository);
  return repository;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((repository) => repository.close()));
});

function createSnapshot(projectId = "p1", updatedAt = 1000): ProjectSnapshot {
  const store = new SourceStore({
    projectId,
    name: `site-${projectId}`,
    originalFiles: createFiles(),
    now: () => updatedAt,
  });
  store.setEdited("css/style.css", "h1 { color: blue; }");
  store.addComment(createComment("c1"));
  store.addComment(
    createComment("c2", { location: { filePath: "css/style.css", start: 5, end: 9 } }),
  );
  return store.toSnapshot();
}

describe("IndexedDbProjectRepository", () => {
  it("保存したものを新しいインスタンスで読み込むと内容が一致する（テキスト・バイナリ・編集・コメント）", async () => {
    const dbName = uniqueDbName();
    const snapshot = createSnapshot();
    await createRepository(dbName).save(snapshot);

    const loaded = await createRepository(dbName).load("p1");

    expect(loaded).not.toBeNull();
    expect(loaded?.projectId).toBe("p1");
    expect(loaded?.name).toBe("site-p1");
    expect(loaded?.updatedAt).toBe(1000);
    expect(loaded?.editedTexts).toEqual({ "css/style.css": "h1 { color: blue; }" });
    expect(loaded?.comments).toEqual(snapshot.comments);

    // Map に戻り、読み込み順も保つ
    expect(loaded?.originalFiles).toBeInstanceOf(Map);
    expect([...(loaded?.originalFiles.keys() ?? [])]).toEqual([...snapshot.originalFiles.keys()]);
    expect(loaded?.originalFiles.get("index.html")).toEqual({
      path: "index.html",
      mimeType: "text/html",
      content: "<h1>トップ</h1>",
    });

    const image = loaded?.originalFiles.get("images/hero.png");
    expect(image?.mimeType).toBe("image/png");
    // fake-indexeddb は Node の structuredClone で複製するため、jsdom の ArrayBuffer とは realm が違い
    // instanceof では判定できない。型タグで ArrayBuffer であることを確かめる
    expect(Object.prototype.toString.call(image?.content)).toBe("[object ArrayBuffer]");
    expect(new Uint8Array(image?.content as ArrayBuffer)).toEqual(PNG_BYTES);
  });

  it("読み込んだスナップショットから SourceStore を作り直せる", async () => {
    const dbName = uniqueDbName();
    await createRepository(dbName).save(createSnapshot());

    const loaded = await createRepository(dbName).load("p1");
    const store = SourceStore.fromSnapshot(loaded as ProjectSnapshot);

    expect(store.getEdited("css/style.css")).toBe("h1 { color: blue; }");
    expect(store.getOriginal("css/style.css")).toBe("h1 { color: red; }");
    expect(store.getComments().map((comment) => comment.id)).toEqual(["c1", "c2"]);
  });

  it("保存し直すと編集・コメントが上書きされ、元のファイル群は残る", async () => {
    const dbName = uniqueDbName();
    const repository = createRepository(dbName);
    const store = SourceStore.fromSnapshot(createSnapshot(), { now: () => 2000 });
    await repository.save(store.toSnapshot());

    store.resetAll();
    store.removeComment("c1");
    await repository.save(store.toSnapshot());

    const loaded = await createRepository(dbName).load("p1");
    expect(loaded?.editedTexts).toEqual({});
    expect(loaded?.comments.map((comment) => comment.id)).toEqual(["c2"]);
    expect(loaded?.updatedAt).toBe(2000);
    expect(loaded?.originalFiles.size).toBe(4);
  });

  it("ArrayBuffer をそのまま保存し、保存後に元のバッファを変えても影響しない", async () => {
    const dbName = uniqueDbName();
    const snapshot = createSnapshot();
    await createRepository(dbName).save(snapshot);

    new Uint8Array(snapshot.originalFiles.get("images/hero.png")?.content as ArrayBuffer).fill(0);

    const loaded = await createRepository(dbName).load("p1");
    const image = loaded?.originalFiles.get("images/hero.png");
    expect(new Uint8Array(image?.content as ArrayBuffer)).toEqual(PNG_BYTES);
  });

  it("Map を配列にして保存する", async () => {
    const dbName = uniqueDbName();
    await createRepository(dbName).save(createSnapshot());

    const db = await openDB(dbName, DB_VERSION);
    const stored = (await db.get(STORE_NAMES.originalFiles, "p1")) as { files: unknown };
    db.close();

    expect(Array.isArray(stored.files)).toBe(true);
    expect((stored.files as { path: string }[]).map((file) => file.path)).toEqual([
      "index.html",
      "css/style.css",
      "js/main.js",
      "images/hero.png",
    ]);
  });

  it("保存していない ID の load() は null", async () => {
    const repository = createRepository(uniqueDbName());

    expect(await repository.load("nope")).toBeNull();
  });

  it("list() は概要を新しく更新した順で返す", async () => {
    const repository = createRepository(uniqueDbName());
    await repository.save(createSnapshot("old", 1000));
    await repository.save(createSnapshot("new", 3000));
    await repository.save(createSnapshot("mid", 2000));

    expect(await repository.list()).toEqual([
      { projectId: "new", name: "site-new", updatedAt: 3000 },
      { projectId: "mid", name: "site-mid", updatedAt: 2000 },
      { projectId: "old", name: "site-old", updatedAt: 1000 },
    ]);
  });

  it("remove() 後は load() が null になり、一覧からも消える", async () => {
    const dbName = uniqueDbName();
    const repository = createRepository(dbName);
    await repository.save(createSnapshot("p1"));
    await repository.save(createSnapshot("p2"));

    await repository.remove("p1");

    expect(await repository.load("p1")).toBeNull();
    expect(await createRepository(dbName).load("p1")).toBeNull();
    expect((await repository.list()).map((summary) => summary.projectId)).toEqual(["p2"]);
    expect(await repository.load("p2")).not.toBeNull();
  });

  it("remove() のあと同じスナップショットを保存し直すと元のファイル群も保存される", async () => {
    const dbName = uniqueDbName();
    const repository = createRepository(dbName);
    const snapshot = createSnapshot();
    await repository.save(snapshot);
    await repository.remove("p1");

    await repository.save(snapshot);

    expect((await createRepository(dbName).load("p1"))?.originalFiles.size).toBe(4);
  });

  it("保存できない値が含まれていると StoreError（save-failed）で reject する", async () => {
    const repository = createRepository(uniqueDbName());
    const snapshot = createSnapshot();
    const broken = {
      ...snapshot,
      comments: [{ ...createComment("c1"), body: (() => "") as unknown as string }],
    };

    const result = repository.save(broken);

    await expect(result).rejects.toBeInstanceOf(StoreError);
    await expect(result).rejects.toMatchObject({ code: "save-failed" });
  });
});

describe("IndexedDbProjectRepository: 最後に開いたプロジェクト", () => {
  it("何も保存していなければ loadLatest() は null", async () => {
    expect(await createRepository(uniqueDbName()).loadLatest()).toBeNull();
  });

  it("最後に保存したプロジェクトを新しいインスタンスで返す", async () => {
    const dbName = uniqueDbName();
    const repository = createRepository(dbName);
    await repository.save(createSnapshot("p1", 5000));
    await repository.save(createSnapshot("p2", 1000));

    const latest = await createRepository(dbName).loadLatest();

    expect(latest?.projectId).toBe("p2");
    expect(latest?.originalFiles.size).toBe(4);
  });

  it("setLatest() で開いたプロジェクトを記録する", async () => {
    const dbName = uniqueDbName();
    const repository = createRepository(dbName);
    await repository.save(createSnapshot("p1"));
    await repository.save(createSnapshot("p2"));

    await repository.setLatest("p1");

    expect((await createRepository(dbName).loadLatest())?.projectId).toBe("p1");
  });

  it("最後に開いたプロジェクトを remove() すると null、別のものを消しても変わらない", async () => {
    const repository = createRepository(uniqueDbName());
    await repository.save(createSnapshot("p1"));
    await repository.save(createSnapshot("p2"));

    await repository.remove("p1");
    expect((await repository.loadLatest())?.projectId).toBe("p2");

    await repository.remove("p2");
    expect(await repository.loadLatest()).toBeNull();
  });
});
