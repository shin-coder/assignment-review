import { expect, test } from "@playwright/test";
import {
  chooseTool,
  elementCode,
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
  test("開発モードで iframe 内の要素をクリックすると、その要素のコードだけが表示される", async ({
    page,
  }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);
    await chooseTool(page, "dev");

    await previewFrame(page).locator("#title").click();
    await expect(elementCode(page)).toContainText('<h1 id="title"');
    await expect(elementCode(page)).not.toContainText("<body");

    // 別の要素に変えると、表示も移る
    await previewFrame(page).locator(".lead").click();
    await expect(elementCode(page)).toContainText('class="lead"');
    await expect(elementCode(page)).not.toContainText('<h1 id="title"');
  });

  test("要素のコードを編集すると、プレビューに反映され、ファイル全体にも入る", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);
    await chooseTool(page, "dev");
    await previewFrame(page).locator("#title").click();
    await expect(elementCode(page)).toContainText('<h1 id="title"');

    const code = await elementCode(page).evaluate((element) => (element as HTMLElement).innerText);
    await elementCode(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(code.replace(/>[^<]*<\/h1>/, ">要素だけ編集</h1>"));

    await expect(previewFrame(page).locator("#title")).toHaveText("要素だけ編集");
    await openFile(page, "index.html");
    await expect.poll(() => readEditorText(page)).toContain("要素だけ編集</h1>");
    await expect.poll(() => readEditorText(page)).toContain("<body");
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
    await chooseTool(page, "comment");
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
    await chooseTool(page, "comment");
    await expect(page.getByRole("list", { name: "コメント一覧" })).toContainText(
      "見出しの色を確認",
    );
    // 対象の要素にコメントのピンが立ち、一覧で選ぶとピンが選択状態になる
    const pin = page.getByRole("button", { name: /コメント 1を開く/ });
    await expect(pin).toBeVisible();
    await page
      .getByRole("list", { name: "コメント一覧" })
      .getByRole("button", { name: /見出しの色を確認/ })
      .click();
    await expect(pin).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("dialog", { name: "コメント" })).toContainText("見出しの色を確認");

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
  test("プレビューの幅を PC / タブレット / モバイルで切り替えられる", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);
    const width = () =>
      previewFrame(page)
        .locator("html")
        .evaluate(() => window.innerWidth);

    await expect.poll(width).toBe(1440);
    await page.getByTestId("device-tablet").click();
    await expect.poll(width).toBe(768);
    await page.getByTestId("device-mobile").click();
    await expect.poll(width).toBe(390);
    await page.getByTestId("device-pc").click();
    await expect.poll(width).toBe(1440);
  });

  test("操作モードでは生徒のサイトの JS が動き、コメントモードではクリックが止まる", async ({
    page,
  }) => {
    await openApp(page, "js-slider");
    await pickFolderAndWaitPreview(page);
    const frame = previewFrame(page);
    await expect(frame.locator(".dot")).toHaveCount(3);

    await chooseTool(page, "browse");
    await frame.locator(".next").click();
    await expect(frame.locator("#slide-2")).toHaveClass(/is-active/);

    await chooseTool(page, "comment");
    await frame.locator(".next").click();
    await expect(frame.locator("#slide-2")).toHaveClass(/is-active/);
    await expect(page.getByTestId("comment-composer")).toContainText("button.next");
  });

  test("JS が生成した要素をクリックすると対象外の案内が出て、コメントできない", async ({
    page,
  }) => {
    await openApp(page, "js-slider");
    await pickFolderAndWaitPreview(page);
    await chooseTool(page, "comment");

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
    await chooseTool(page, "dev");

    await frame.locator(".nav-link").nth(1).click();
    await expect(elementCode(page)).toContainText("プロフィール");
    await expect(elementCode(page)).not.toContainText("作品");

    // 暗黙に作られた要素の中の要素（tbody の下）も選べる
    await frame.locator(".skills th").first().click();
    await expect(elementCode(page)).toContainText("<th>HTML");
  });

  test("フォルダの読み込みでは、書き込み系のメソッドが呼ばれない", async ({ page }) => {
    await openApp(page, "simple-image");
    await pickFolderAndWaitPreview(page);

    const record = await readPickerRecord(page);
    expect(record.pickerCalls).toBe(1);
    expect(record.writeCalls).toEqual([]);
  });
});
