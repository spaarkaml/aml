import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("welcome screen offers open/create and recent Folios", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Open Folio…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Folio…" })).toBeVisible();
  await expect(page.getByText("/mock/Writing")).toBeVisible();
});

test("opening a Folio fills the Browser tree and the breadcrumb", async ({ page }) => {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  const tree = page.getByTestId("folio-tree");
  await expect(tree.getByText("Thesis")).toBeVisible();
  await expect(tree.getByText("Inbox")).toBeVisible();
  // top-level folders start expanded; deeper ones collapsed
  await expect(tree.getByText("chapters")).toBeVisible();
  await expect(tree.getByText("03 Influence networks")).toHaveCount(0);
  await tree.getByText("chapters").click();
  await expect(tree.getByText("03 Influence networks")).toBeVisible();
  await expect(page.getByTestId("editor-placeholder")).toContainText("5 notes in Writing");
});

test("Close Folio from the palette returns to the welcome screen", async ({ page }) => {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByTestId("palette-input").fill("close folio");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("breadcrumb")).toHaveText("Overview");
  await expect(page.getByRole("button", { name: "Open Folio…" })).toBeVisible();
});
