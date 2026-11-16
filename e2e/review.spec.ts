import { expect, test } from "@playwright/test";
import {
  openApp,
  openFile,
  pickFolderAndWaitPreview,
  previewFrame,
  readEditorText,
  replaceEditorText,
  titleColor,
  waitSaved,
} from "./helpers/app";
import { readFixtureText, readPickerRecord } from "./helpers/fakePicker";

const BLUE = "rgb(0, 0, 255)";
const RED = "rgb(255, 0, 0)";

test.describe("必須シナリオ", () => {
  test("iframe 内の要素をクリックすると、レイヤーツリーの該当ノードが選択される", async ({
    page,
  }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);

    const selected = page.getByRole("treeitem", { selected: true });
    await expect(selected).toHaveCount(0);

    await previewFrame(page).locator("#title").click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText("h1");
    await expect(selected).toHaveAttribute("aria-selected", "true");

    // 別の要素に変えると、選択も移る
    await previewFrame(page).locator(".lead").click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText("lead");
  });

  test("CSS を編集すると、iframe 内の計算済みスタイルが変わる", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);
    expect(await titleColor(page)).toBe(BLUE);

    await openFile(page, "css/style.css");
    const css = readFixtureText("simple-image", "css/style.css");
    await replaceEditorText(page, css.replace(BLUE, RED));

    await expect.poll(() => titleColor(page)).toBe(RED);
  });

  test("JS を編集して iframe を作り直しても、HTML と CSS の編集が残る", async ({ page }) => {
    await openApp(page, "js-slider");
    await pickFolderAndWaitPreview(page);
    const title = previewFrame(page).locator("#title");

    // HTML を編集する
    await openFile(page, "index.html");
    const html = readFixtureText("js-slider", "index.html");
    await replaceEditorText(page, html.replace("フォトギャラリー</h1>", "編集済みギャラリー</h1>"));
    await expect(title).toHaveText("編集済みギャラリー");

    // CSS を編集する
    await openFile(page, "css/style.css");
    const css = readFixtureText("js-slider", "css/style.css");
    await replaceEditorText(page, css.replace(BLUE, RED));
    await expect.poll(() => titleColor(page)).toBe(RED);

    // JS を編集して「適用」する（JS は適用するまでプレビューに反映されない）
    await openFile(page, "js/slider.js");
    const js = readFixtureText("js-slider", "js/slider.js");
    await replaceEditorText(
      page,
      js.replace("show(0);", 'show(0);\n  slider.setAttribute("data-js-applied", "yes");'),
    );
    await page.getByRole("button", { name: "適用" }).click();

    // iframe が作り直され、新しい JS が動いている
    await expect(previewFrame(page).locator("#slider")).toHaveAttribute("data-js-applied", "yes");
    // HTML と CSS の編集は作り直し後も残っている
    await expect(title).toHaveText("編集済みギャラリー");
    await expect.poll(() => titleColor(page)).toBe(RED);
  });

  test("再読み込みしても、編集とコメントが IndexedDB から復元される", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);

    // コメントを付ける
    await previewFrame(page).locator("#title").click();
    await page.getByRole("textbox", { name: "コメント", exact: true }).fill("見出しの色を確認");
    await page.getByRole("button", { name: "コメントを追加" }).click();
    await expect(page.getByRole("list", { name: "コメント一覧" })).toContainText(
      "見出しの色を確認",
    );

    // CSS を編集する
    await openFile(page, "css/style.css");
    const css = readFixtureText("simple-image", "css/style.css");
    const editedCss = css.replace(BLUE, RED);
    await replaceEditorText(page, editedCss);
    await expect.poll(() => titleColor(page)).toBe(RED);
    await waitSaved(page);

    await page.reload();

    // フォルダを選び直さずに復元される
    await expect(page.getByTestId("review-screen")).toBeVisible();
    expect((await readPickerRecord(page)).pickerCalls).toBe(0);
    await expect(previewFrame(page).locator("#title")).toBeVisible();
    await expect.poll(() => titleColor(page)).toBe(RED);
    await expect(page.getByRole("list", { name: "コメント一覧" })).toContainText(
      "見出しの色を確認",
    );
    // コメントを選ぶと、対象の要素がツリーで選択され、コメントの目印が付く
    // （初期表示では折りたたまれた枝にあるため、選ぶまでは行が描画されない）
    await page.getByRole("button", { name: /見出しの色を確認/ }).click();
    const selected = page.getByRole("treeitem", { selected: true });
    await expect(selected).toContainText("h1");
    await expect(selected).toHaveAttribute("data-commented", "true");

    // エディタにも編集後のソースが入っている
    await openFile(page, "css/style.css");
    await expect.poll(() => readEditorText(page)).toContain(RED);
  });

  test("Service Worker の初回登録時でも、CSS と画像を含むプレビューが表示される", async ({
    page,
    context,
  }) => {
    // 新しいコンテキストなので、Service Worker は未登録
    expect(context.serviceWorkers()).toHaveLength(0);
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);

    const frame = previewFrame(page);
    // CSS が当たっている
    await expect.poll(() => titleColor(page)).toBe(BLUE);
    // HTML の相対パスの画像が読み込まれている
    await expect
      .poll(() =>
        frame
          .locator("#hero-image")
          .evaluate(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth,
          ),
      )
      .toBeGreaterThan(0);
    // CSS からの相対パス（../images/hero.png）の背景画像も読み込める
    const backgroundWidth = await frame.locator(".hero").evaluate(async (element) => {
      const match = /url\("?([^")]+)"?\)/.exec(getComputedStyle(element).backgroundImage);
      if (!match?.[1]) return 0;
      const image = new Image();
      image.src = match[1];
      await image.decode();
      return image.naturalWidth;
    });
    expect(backgroundWidth).toBeGreaterThan(0);
  });
});

test.describe("追加シナリオ", () => {
  test("JS が生成した要素をクリックすると対象外の案内が出て、コメントできない", async ({
    page,
  }) => {
    await openApp(page, "js-slider");
    await pickFolderAndWaitPreview(page);

    await expect(previewFrame(page).locator(".dot")).toHaveCount(3);
    await previewFrame(page).locator(".dot").first().click();

    await expect(page.getByTestId("generated-notice")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "コメント", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "コメントを追加" })).toBeDisabled();

    // ソース上にある要素に切り替えると、コメントできる
    await previewFrame(page).locator("#title").click();
    await expect(page.getByTestId("generated-notice")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "コメント", exact: true })).toBeEnabled();
  });

  test("閉じタグ漏れの HTML でも、プレビュー・ツリー・クリック選択が動く", async ({ page }) => {
    await openApp(page, "broken-html");
    await pickFolderAndWaitPreview(page);

    const frame = previewFrame(page);
    await expect(frame.locator(".nav-link")).toHaveCount(3);
    expect(await titleColor(page)).toBe(BLUE);
    await expect(page.getByRole("treeitem").first()).toBeVisible();

    const selected = page.getByRole("treeitem", { selected: true });
    await frame.locator(".nav-link").nth(1).click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText("nav-link");

    // 暗黙に作られた要素の中の要素（tbody の下）も選べる
    await frame.locator(".skills th").first().click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText("th");
  });

  test("フォルダの読み込みでは、書き込み系のメソッドが呼ばれない", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);

    const record = await readPickerRecord(page);
    expect(record.pickerCalls).toBe(1);
    expect(record.writeCalls).toEqual([]);
  });
});
