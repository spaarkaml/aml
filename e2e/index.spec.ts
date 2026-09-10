import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Rebuild Index shows progress in the status bar, then Quick Open still works", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await expect(page.getByTestId("index-state")).toHaveCount(0);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByPlaceholder("Type a command…").fill("Rebuild Index");
  await page.keyboard.press("Enter");

  const state = page.getByTestId("index-state");
  await expect(state).toContainText("Indexing");
  await expect(state).toHaveCount(0, { timeout: 5000 });

  await page.keyboard.press(process.platform === "darwin" ? "Meta+O" : "Control+O");
  await page.getByTestId("quickopen-input").fill("methods");
  await expect(page.getByTestId("quickopen-backdrop")).toContainText("04 Methods");
});
