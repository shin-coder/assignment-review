import { expect, test } from "@playwright/test";

// 基盤（チケット 00）の動作確認用。必須シナリオはチケット 13 で追加する
test("アプリが localhost で表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "生徒サイト レビューツール" })).toBeVisible();
});
