import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";

/** テスト用サンプルサイトの名前（tests/fixtures/ 直下のフォルダ名） */
export type FixtureName = "simple-image" | "js-slider" | "broken-html";

const FIXTURES_ROOT = resolve(process.cwd(), "tests/fixtures");

/** ページへ渡すために直列化したフォルダ。テキストは文字列、バイナリは base64 */
export type SerializedEntry =
  | { kind: "file"; name: string; text: string }
  | { kind: "file"; name: string; base64: string }
  | { kind: "directory"; name: string; children: SerializedEntry[] };

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".svg", ".txt"]);

function isTextName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function serialize(directory: string, name: string): SerializedEntry {
  const children: SerializedEntry[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      children.push(serialize(full, entry));
    } else if (isTextName(entry)) {
      children.push({ kind: "file", name: entry, text: readFileSync(full, "utf8") });
    } else {
      children.push({ kind: "file", name: entry, base64: readFileSync(full).toString("base64") });
    }
  }
  return { kind: "directory", name, children };
}

/** フィクスチャのファイルを Node 側で読む（期待値の組み立て用） */
export function readFixtureText(fixture: FixtureName, path: string): string {
  return readFileSync(join(FIXTURES_ROOT, fixture, path), "utf8");
}

/** ページ側に記録される、偽ピッカーの利用状況 */
export interface PickerRecord {
  /** showDirectoryPicker が呼ばれた回数 */
  pickerCalls: number;
  /** 書き込み系メソッドの呼び出し記録（空であるべき） */
  writeCalls: string[];
}

declare global {
  interface Window {
    __pickerCalls: number;
    __writeCalls: string[];
  }
}

/**
 * `window.showDirectoryPicker` を、フィクスチャのフォルダを返す偽物に差し替える。
 * addInitScript なので、再読み込みしても差し替えが残る（そのたびに記録は 0 に戻る）。
 * ページ内で組み立てたハンドルは kind / name / values() / getFile()（File）を持ち、
 * 書き込み系（createWritable / removeEntry / getFileHandle / getDirectoryHandle）は
 * 呼ばれたら window.__writeCalls に記録する
 */
export async function installFakePicker(page: Page, fixture: FixtureName): Promise<void> {
  const tree = serialize(join(FIXTURES_ROOT, fixture), fixture);
  await page.addInitScript((root: SerializedEntry) => {
    window.__pickerCalls = 0;
    window.__writeCalls = [];

    const record = (name: string) => () => {
      window.__writeCalls.push(name);
      throw new Error(`偽ハンドル: 書き込み系 API ${name} が呼ばれた`);
    };

    const toBytes = (base64: string): Uint8Array<ArrayBuffer> => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };

    const build = (entry: SerializedEntry): unknown => {
      if (entry.kind === "file") {
        const parts = "text" in entry ? [entry.text] : [toBytes(entry.base64)];
        return {
          kind: "file",
          name: entry.name,
          getFile: async () => new File(parts, entry.name),
          createWritable: record(`${entry.name}.createWritable`),
        };
      }
      const children = entry.children.map(build);
      return {
        kind: "directory",
        name: entry.name,
        values: async function* () {
          for (const child of children) yield child;
        },
        getFileHandle: record(`${entry.name}.getFileHandle`),
        getDirectoryHandle: record(`${entry.name}.getDirectoryHandle`),
        removeEntry: record(`${entry.name}.removeEntry`),
      };
    };

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => {
        window.__pickerCalls += 1;
        return build(root);
      };
  }, tree);
}

/** 偽ピッカーの記録を読む */
export async function readPickerRecord(page: Page): Promise<PickerRecord> {
  return page.evaluate(() => ({
    pickerCalls: window.__pickerCalls,
    writeCalls: [...window.__writeCalls],
  }));
}
