import { describe, expect, it } from "vitest";
import { injectScriptUrl } from "../shared";
import {
  analyzePage,
  buildPreviewFiles,
  hasSameStructure,
  planElementReplace,
  previewOuterHtml,
} from "./previewFiles";
import { INDEX_HTML } from "./testUtils";

describe("analyzePage / buildPreviewFiles", () => {
  it("HTML は data-review-id と操作スクリプトを入れ、それ以外はそのまま使う", () => {
    const page = analyzePage("index.html", INDEX_HTML, false);
    expect(page.previewHtml).toContain('data-review-id="0"');
    expect(page.previewHtml).toContain(injectScriptUrl(false));
    const css = { path: "style.css", mimeType: "text/css", content: "h1{}" };
    const html = { path: "index.html", mimeType: "text/html", content: INDEX_HTML };
    const files = buildPreviewFiles([html, css], new Map([["index.html", page]]));
    expect(files[0]?.content).toBe(page.previewHtml);
    expect(files[1]).toBe(css);
  });
});

describe("previewOuterHtml", () => {
  it("挿入後の HTML から切り出したものと同じになる（子の ID も含む）", () => {
    const source = '<div class="x"><p>a<b>b</b></p><p>c</p></div>';
    const page = analyzePage("a.html", source, false);
    const id = [...page.analysis.map.values()].find((info) => info.tagName === "div")!.id;
    const html = previewOuterHtml(source, page.analysis.map, id)!;
    expect(html.startsWith(`<div data-review-id="${id}" class="x">`)).toBe(true);
    for (const info of page.analysis.map.values()) {
      if (info.tagName === "p" || info.tagName === "b") {
        expect(html).toContain(`data-review-id="${info.id}"`);
      }
    }
    // 要素のタグ以外の文字は元のまま
    expect(html.replace(/ data-review-id="\d+"/g, "")).toBe(source);
  });

  it("暗黙の要素は null", () => {
    const page = analyzePage("a.html", "<p>x</p>", false);
    const body = [...page.analysis.map.values()].find((info) => info.tagName === "body")!;
    expect(previewOuterHtml("<p>x</p>", page.analysis.map, body.id)).toBeNull();
  });
});

describe("planElementReplace", () => {
  const change = (source: string, from: number, to: number, inserted: number) => ({
    filePath: "a.html",
    start: from,
    end: to,
    insertedLength: inserted,
    source,
  });

  it("要素の中身の編集は、その要素の差し替えにする", () => {
    const before = analyzePage("a.html", "<div><p>abc</p></div>", false);
    const after = analyzePage("a.html", "<div><p>abXc</p></div>", false);
    const plan = planElementReplace(before, after, change("", 10, 10, 1));
    expect(plan?.html).toBe(`<p data-review-id="4">abXc</p>`);
  });

  it("構造が変わる編集は作り直し（null）", () => {
    const before = analyzePage("a.html", "<div><p>a</p></div>", false);
    const after = analyzePage("a.html", "<div><p>a</p><p>b</p></div>", false);
    expect(hasSameStructure(before.analysis.map, after.analysis.map)).toBe(false);
    expect(planElementReplace(before, after, change("", 14, 14, 8))).toBeNull();
  });

  it("要素の外の編集や、script を含む差し替えは作り直し（null）", () => {
    const before = analyzePage("a.html", "<p>a</p>text", false);
    const after = analyzePage("a.html", "<p>a</p>texts", false);
    expect(planElementReplace(before, after, change("", 12, 12, 1))).toBeNull();

    const b2 = analyzePage("a.html", "<div>a<script>x()</script></div>", false);
    const a2 = analyzePage("a.html", "<div>ab<script>x()</script></div>", false);
    expect(planElementReplace(b2, a2, change("", 6, 6, 1))).toBeNull();
  });
});
