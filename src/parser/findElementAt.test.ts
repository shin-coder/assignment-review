import { describe, expect, it } from "vitest";
import { analyzeHtml } from "./analyzeHtml";
import { findElementAt } from "./findElementAt";

const FILE = "index.html";

describe("findElementAt", () => {
  const source = '<div class="a">\n  <p>abc<b>def</b></p>\n</div>\n<ul><li>x<li>y</ul>';
  const { map } = analyzeHtml(FILE, source);
  const at = (needle: string, delta = 0) =>
    findElementAt(map, FILE, source.indexOf(needle) + delta)?.tagName ?? null;

  it("ネストした要素で最も内側の要素を返す", () => {
    expect(at("def")).toBe("b");
    expect(at("abc")).toBe("p");
    expect(at("<b>")).toBe("b");
    expect(at("</b>")).toBe("b");
    expect(at("</p>")).toBe("p");
    expect(at("\n  <p>")).toBe("div");
    expect(at('class="a"')).toBe("div");
  });

  it("範囲の終わり（end）は含まない", () => {
    // </b> の直後は p の中
    expect(at("</b>", "</b>".length)).toBe("p");
    // </div> の直後は body（暗黙で位置がない）なので null
    expect(at("</div>", "</div>".length)).toBeNull();
  });

  it("閉じタグがない要素も、暗黙に閉じた位置までを範囲とする", () => {
    expect(at("x")).toBe("li");
    expect(findElementAt(map, FILE, source.indexOf("x"))).toBe(
      [...map.values()].filter((info) => info.tagName === "li")[0],
    );
    expect(findElementAt(map, FILE, source.indexOf("y"))).toBe(
      [...map.values()].filter((info) => info.tagName === "li")[1],
    );
  });

  it("位置のない要素（暗黙の html / body）は返さない", () => {
    expect(findElementAt(map, FILE, 0)?.tagName).toBe("div");
    expect(findElementAt(map, FILE, source.length)).toBeNull();
    expect(findElementAt(map, FILE, -1)).toBeNull();
  });

  it("別のファイルの位置では見つからない", () => {
    expect(findElementAt(map, "other.html", source.indexOf("def"))).toBeNull();
  });
});
