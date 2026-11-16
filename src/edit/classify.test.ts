import { describe, expect, it } from "vitest";
import { classifyEdit } from "./classify";

describe("classifyEdit", () => {
  it.each([
    ["js/slider.js", "js"],
    ["js/module.mjs", "js"],
    ["js/legacy.cjs", "js"],
    ["JS/APP.JS", "js"],
  ])("%s は %s で、iframe の作り直しが必要", (path, kind) => {
    expect(classifyEdit(path)).toEqual({ kind, needsReload: true });
  });

  it.each([
    ["index.html", "html"],
    ["about/index.htm", "html"],
    ["css/style.css", "css"],
    ["CSS/STYLE.CSS", "css"],
  ])("%s は %s で、iframe の作り直しは不要", (path, kind) => {
    expect(classifyEdit(path)).toEqual({ kind, needsReload: false });
  });

  it.each(["images/logo.svg", "data.json", "README", ".htaccess", "js.backup/notes.txt"])(
    "%s はその他で、その場で反映できないので作り直す",
    (path) => {
      expect(classifyEdit(path)).toEqual({ kind: "other", needsReload: true });
    },
  );
});
