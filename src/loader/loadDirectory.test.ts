import { describe, expect, it } from "vitest";
import { LoaderError } from "./errors";
import { createFakeDirectory, type WriteCall } from "./fakeHandles";
import { isExcludedName, loadDirectory, type DirectoryHandleLike } from "./loadDirectory";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("loadDirectory", () => {
  it("ネストしたフォルダを正規化したパスで読み込む", async () => {
    const root = createFakeDirectory("student-site", {
      "index.html": "<h1>トップ</h1>",
      css: { "style.css": "h1 { color: red; }" },
      pages: { sub: { "about.html": "<p>about</p>" } },
    });

    const result = await loadDirectory(root);

    expect(result.name).toBe("student-site");
    expect([...result.files.keys()]).toEqual([
      "css/style.css",
      "index.html",
      "pages/sub/about.html",
    ]);
    expect(result.files.get("css/style.css")).toEqual({
      path: "css/style.css",
      mimeType: "text/css",
      content: "h1 { color: red; }",
    });
    expect(result.files.get("index.html")?.content).toBe("<h1>トップ</h1>");
  });

  it("テキストは文字列、画像などは ArrayBuffer で読み込む", async () => {
    const root = createFakeDirectory("site", {
      "index.html": "<p>あ</p>",
      "app.js": "console.log(1)",
      "logo.svg": "<svg></svg>",
      images: { "hero.png": png },
      fonts: { "a.woff2": new Uint8Array([1, 2, 3]) },
    });

    const { files } = await loadDirectory(root);

    expect(typeof files.get("index.html")?.content).toBe("string");
    expect(typeof files.get("app.js")?.content).toBe("string");
    expect(typeof files.get("logo.svg")?.content).toBe("string");

    const image = files.get("images/hero.png");
    expect(image?.mimeType).toBe("image/png");
    expect(image?.content).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(image?.content as ArrayBuffer)).toEqual(png);
    expect(files.get("fonts/a.woff2")?.mimeType).toBe("font/woff2");
  });

  it("node_modules・.git・.DS_Store などを読み込まない", async () => {
    const root = createFakeDirectory("site", {
      "index.html": "",
      ".DS_Store": new Uint8Array([0]),
      ".git": { HEAD: "ref: refs/heads/main" },
      ".vscode": { "settings.json": "{}" },
      node_modules: { lib: { "index.js": "" } },
      "Thumbs.db": new Uint8Array([0]),
      css: { ".DS_Store": new Uint8Array([0]), "style.css": "" },
    });

    const { files } = await loadDirectory(root);

    expect([...files.keys()]).toEqual(["css/style.css", "index.html"]);
  });

  it("読み込み順はフォルダの中身の返り順に左右されない", async () => {
    const tree = { "b.html": "", "a.html": "", c: { "z.css": "", "y.css": "" } };
    const forward = await loadDirectory(createFakeDirectory("site", tree));
    const reversed = await loadDirectory(createFakeDirectory("site", tree, { reverseOrder: true }));

    expect([...reversed.files.keys()]).toEqual([...forward.files.keys()]);
    expect([...forward.files.keys()]).toEqual(["a.html", "b.html", "c/y.css", "c/z.css"]);
  });

  it("ファイル数が上限を超えるとエラーになる", async () => {
    const root = createFakeDirectory("site", { "a.html": "", "b.html": "", "c.html": "" });

    await expect(loadDirectory(root, { maxFiles: 3 })).resolves.toBeDefined();
    const error = await loadDirectory(root, { maxFiles: 2 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoaderError);
    expect((error as LoaderError).code).toBe("too-many-files");
    expect((error as LoaderError).message).toContain("2 件");
  });

  it("合計サイズが上限を超えるとエラーになる", async () => {
    const root = createFakeDirectory("site", { "a.txt": "12345", "b.txt": "67890" });

    await expect(loadDirectory(root, { maxTotalBytes: 10 })).resolves.toBeDefined();
    const error = await loadDirectory(root, { maxTotalBytes: 9 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoaderError);
    expect((error as LoaderError).code).toBe("too-large");
  });

  it("フォルダに書き込まない（書き込み系のメソッドを呼ばない）", async () => {
    const writeCalls: WriteCall[] = [];
    const root = createFakeDirectory(
      "site",
      { "index.html": "", css: { "style.css": "" }, images: { "a.png": png } },
      { writeCalls },
    );

    await loadDirectory(root);

    expect(writeCalls).toEqual([]);
  });

  it("空のフォルダは空の仮想ファイル群になる", async () => {
    const { files } = await loadDirectory(createFakeDirectory("empty", {}));
    expect(files.size).toBe(0);
  });

  it("本物の FileSystemDirectoryHandle を渡せる型になっている", () => {
    // 型の互換性の確認（実行時には何もしない）
    const accept = (handle: DirectoryHandleLike) => handle;
    const real = null as unknown as FileSystemDirectoryHandle;
    expect(() => accept(real)).not.toThrow();
  });
});

describe("isExcludedName", () => {
  it.each([".git", ".DS_Store", ".vscode", "node_modules", "Thumbs.db"])(
    "%s は除外する",
    (name) => {
      expect(isExcludedName(name)).toBe(true);
    },
  );

  it.each(["index.html", "css", "images", "modules"])("%s は除外しない", (name) => {
    expect(isExcludedName(name)).toBe(false);
  });
});
