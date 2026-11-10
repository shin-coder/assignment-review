// テスト用サンプルサイト（tests/fixtures）を実際のファイルから読み込めることの確認
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findEntryHtml } from "./findEntryHtml";
import { loadDirectory, type DirectoryHandleLike } from "./loadDirectory";

const fixturesDir = path.resolve(import.meta.dirname, "../../tests/fixtures");

/** ディスク上のフォルダを読み取り専用の DirectoryHandleLike として扱う */
function diskDirectory(dir: string): DirectoryHandleLike {
  return {
    kind: "directory",
    name: path.basename(dir),
    async *values() {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          yield diskDirectory(full);
        } else {
          const bytes = readFileSync(full);
          yield {
            kind: "file" as const,
            name,
            getFile: async () => ({
              size: bytes.byteLength,
              text: async () => bytes.toString("utf8"),
              arrayBuffer: async () => new Uint8Array(bytes).buffer,
            }),
          };
        }
      }
    },
  };
}

describe("サンプルサイトの読み込み", () => {
  it("simple-image: HTML・CSS・画像を読み込む", async () => {
    const { name, files } = await loadDirectory(
      diskDirectory(path.join(fixturesDir, "simple-image")),
    );

    expect(name).toBe("simple-image");
    expect([...files.keys()]).toEqual(["css/style.css", "images/hero.png", "index.html"]);
    expect(findEntryHtml(files)).toBe("index.html");

    const image = files.get("images/hero.png")!;
    expect(image.mimeType).toBe("image/png");
    expect(image.content).toBeInstanceOf(ArrayBuffer);
    // PNG のシグネチャ
    expect([...new Uint8Array(image.content as ArrayBuffer).slice(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(files.get("index.html")!.content).toContain('<h1 id="title">');
  });

  it("js-slider: JS を文字列で読み込む", async () => {
    const { files } = await loadDirectory(diskDirectory(path.join(fixturesDir, "js-slider")));

    expect([...files.keys()]).toEqual(["css/style.css", "index.html", "js/slider.js"]);
    expect(files.get("js/slider.js")!.mimeType).toBe("text/javascript");
    expect(files.get("js/slider.js")!.content).toContain("createElement");
  });

  it("broken-html: 不正な HTML もそのままのテキストで読み込む", async () => {
    const dir = path.join(fixturesDir, "broken-html");
    const { files } = await loadDirectory(diskDirectory(dir));

    expect(files.get("index.html")!.content).toBe(
      readFileSync(path.join(dir, "index.html"), "utf8"),
    );
  });
});
