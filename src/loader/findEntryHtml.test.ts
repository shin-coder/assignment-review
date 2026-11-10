import { describe, expect, it } from "vitest";
import type { VirtualFileSystem } from "../shared";
import { findEntryHtml } from "./findEntryHtml";

const vfs = (...paths: string[]): VirtualFileSystem =>
  new Map(paths.map((path) => [path, { path, mimeType: "text/html", content: "" }]));

describe("findEntryHtml", () => {
  it("ルートの index.html を最優先する", () => {
    expect(findEntryHtml(vfs("about.html", "a.html", "index.html", "sub/index.html"))).toBe(
      "index.html",
    );
  });

  it("ルートに index.html がなければ、最も浅い階層の HTML を返す", () => {
    expect(findEntryHtml(vfs("pages/top.html", "work/a/b.html", "home.html"))).toBe("home.html");
    expect(findEntryHtml(vfs("pages/top.html", "work/a/b.html"))).toBe("pages/top.html");
  });

  it("同じ深さなら index.html / index.htm を優先し、残りは名前順", () => {
    expect(findEntryHtml(vfs("site/b.html", "site/index.htm", "site/a.html"))).toBe(
      "site/index.htm",
    );
    expect(findEntryHtml(vfs("site/b.html", "site/a.html"))).toBe("site/a.html");
  });

  it(".htm も HTML として扱う", () => {
    expect(findEntryHtml(vfs("top.htm"))).toBe("top.htm");
  });

  it("HTML がなければ null", () => {
    expect(findEntryHtml(new Map())).toBeNull();
    expect(
      findEntryHtml(new Map([["a.css", { path: "a.css", mimeType: "text/css", content: "" }]])),
    ).toBeNull();
  });
});
