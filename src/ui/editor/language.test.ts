import { describe, expect, it } from "vitest";
import { getEditorLanguage, requiresApply } from "./language";

describe("getEditorLanguage", () => {
  it.each([
    ["index.html", "html"],
    ["about/INDEX.HTM", "html"],
    ["css/style.css", "css"],
    ["js/main.js", "javascript"],
    ["js/module.mjs", "javascript"],
    ["data.json", "plain"],
    ["images/logo.svg", "plain"],
    ["README", "plain"],
    [".htaccess", "plain"],
  ])("%s → %s", (path, expected) => {
    expect(getEditorLanguage(path)).toBe(expected);
  });
});

describe("requiresApply", () => {
  it("JS ファイルだけ「適用」での確定が必要", () => {
    expect(requiresApply("js/main.js")).toBe(true);
    expect(requiresApply("js/module.mjs")).toBe(true);
    expect(requiresApply("index.html")).toBe(false);
    expect(requiresApply("css/style.css")).toBe(false);
  });
});
