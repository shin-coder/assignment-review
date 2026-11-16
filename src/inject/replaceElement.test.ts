import { afterEach, describe, expect, it } from "vitest";
import { replaceElement } from "./replaceElement";

afterEach(() => {
  document.body.innerHTML = "";
  for (const name of document.body.getAttributeNames()) document.body.removeAttribute(name);
});

describe("replaceElement", () => {
  it("指定 ID の要素を新しい HTML に差し替え、前後の要素はそのまま残す", () => {
    document.body.innerHTML = `<p data-review-id="1">前</p><p data-review-id="2">古い</p><p data-review-id="3">後</p>`;
    const before = document.querySelector('[data-review-id="1"]');

    expect(replaceElement(document, "2", `<h2 data-review-id="2" class="title">新しい</h2>`)).toBe(
      true,
    );

    expect(document.body.innerHTML).toBe(
      `<p data-review-id="1">前</p><h2 data-review-id="2" class="title">新しい</h2><p data-review-id="3">後</p>`,
    );
    expect(document.querySelector('[data-review-id="1"]')).toBe(before);
  });

  it("<tr> のように文脈が要る要素も差し替えられる", () => {
    document.body.innerHTML = `<table><tbody><tr data-review-id="5"><td>a</td></tr></tbody></table>`;

    replaceElement(document, "5", `<tr data-review-id="5"><td>b</td><td>c</td></tr>`);

    expect(document.querySelector("tbody")?.innerHTML).toBe(
      `<tr data-review-id="5"><td>b</td><td>c</td></tr>`,
    );
  });

  it("複数の要素に差し替えたり、空にして消したりできる", () => {
    document.body.innerHTML = `<ul><li data-review-id="1">a</li><li data-review-id="2">b</li></ul>`;

    replaceElement(document, "1", `<li data-review-id="1">a1</li><li>a2</li>`);
    replaceElement(document, "2", "");

    expect(document.querySelector("ul")?.innerHTML).toBe(
      `<li data-review-id="1">a1</li><li>a2</li>`,
    );
  });

  it("<body> は属性と中身を入れ替える", () => {
    document.body.setAttribute("data-review-id", "b");
    document.body.setAttribute("class", "old");
    document.body.innerHTML = `<p data-review-id="1">古い</p>`;
    const body = document.body;

    replaceElement(
      document,
      "b",
      `<body data-review-id="b" id="top"><p data-review-id="1">新しい</p></body>`,
    );

    expect(document.body).toBe(body);
    expect(document.body.getAttribute("class")).toBeNull();
    expect(document.body.id).toBe("top");
    expect(document.body.innerHTML).toBe(`<p data-review-id="1">新しい</p>`);
  });

  it("差し替えた HTML の <script> は実行しない", () => {
    document.body.innerHTML = `<div data-review-id="1"></div>`;
    const flags = window as unknown as Record<string, unknown>;

    replaceElement(
      document,
      "1",
      `<div data-review-id="1"><script>window.__reviewInjected = true</script></div>`,
    );

    expect(flags.__reviewInjected).toBeUndefined();
    expect(document.querySelector("script")).not.toBeNull();
  });

  it("要素が見つからなければ何もせず false を返す", () => {
    document.body.innerHTML = `<p data-review-id="1">a</p>`;

    expect(replaceElement(document, "9", "<b>x</b>")).toBe(false);
    expect(document.body.innerHTML).toBe(`<p data-review-id="1">a</p>`);
  });
});
