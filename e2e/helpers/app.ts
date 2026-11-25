import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { installFakePicker, type FixtureName } from "./fakePicker";

/** プレビューの iframe（中の要素は必ずこれ経由で取る） */
export function previewFrame(page: Page): FrameLocator {
  return page.frameLocator('[data-testid="preview-frame"] iframe');
}

/** 偽ピッカーを入れてアプリを開く */
export async function openApp(page: Page, fixture: FixtureName): Promise<void> {
  await installFakePicker(page, fixture);
  await page.goto("/");
  await expect(page.getByTestId("open-folder")).toBeEnabled();
}

/** 「フォルダを選ぶ」を押し、プレビュー内の見出しが表示されるまで待つ */
export async function pickFolderAndWaitPreview(page: Page): Promise<void> {
  await page.getByTestId("open-folder").click();
  await expect(page.getByTestId("review-screen")).toBeVisible();
  await expect(previewFrame(page).locator("#title")).toBeVisible();
}

/** 見出しの文字色（計算済みスタイル） */
export function titleColor(page: Page): Promise<string> {
  return previewFrame(page)
    .locator("#title")
    .evaluate((element) => getComputedStyle(element).color);
}

/** 画面下のツールバーでツールを選ぶ */
export async function chooseTool(page: Page, tool: "browse" | "dev"): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click();
  await expect(page.getByTestId("review-screen")).toHaveAttribute("data-tool", tool);
}

/** 開発モードの「ファイル」でファイルを開く（タブがあればタブ、なければ「ファイルを開く」） */
export async function openFile(page: Page, path: string): Promise<void> {
  if ((await page.getByTestId("review-screen").getAttribute("data-tool")) !== "dev") {
    await chooseTool(page, "dev");
  }
  // すでにファイル全体の表示（「この要素に戻る」がある）なら、そのまま使う
  if ((await page.getByTestId("dev-view-element").count()) === 0) {
    await page.getByTestId("dev-view-file").click();
  }
  const tab = page.locator(`[role="tab"][title="${path}"]`);
  if ((await tab.count()) > 0) {
    await tab.click();
  } else {
    await page.getByTestId("open-file-select").selectOption(path);
  }
  await expect(page.getByTestId("code-editor")).toHaveAttribute("data-path", path);
}

/** エディタの本文 */
export function editorContent(page: Page): Locator {
  return page.getByTestId("code-editor").locator(".cm-content");
}

/** 開発モードの「この要素」に出ている要素のコード */
export function elementCode(page: Page): Locator {
  return page.getByTestId("element-code").locator(".cm-content");
}

/** 開いているファイルの内容を丸ごと入れ替える（自動閉じ括弧などを避けるため insertText を使う） */
export async function replaceEditorText(page: Page, text: string): Promise<void> {
  const content = editorContent(page);
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
}

/** エディタの本文をテキストとして読む */
export async function readEditorText(page: Page): Promise<string> {
  return editorContent(page).evaluate((element) => (element as HTMLElement).innerText);
}

/** 保存状態が「保存済み」になるまで待つ（編集を反映した後に呼ぶこと） */
export async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved");
  await expect(page.getByTestId("save-status")).toHaveText("保存済み");
}
