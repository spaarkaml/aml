import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("the welcome screen is the first run, with nothing to be recent about yet", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Open Folio…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Folio…" })).toBeVisible();
  await expect(page.getByText("/mock/Writing")).toHaveCount(0);
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
  // With no note open, the home screen is the Overview (WP-2.8).
  await expect(page.getByTestId("overview")).toContainText("5 notes");
});

test("Close Folio from the palette returns to the welcome screen", async ({ page }) => {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByTestId("palette-input").fill("close folio");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("breadcrumb")).toHaveText("Overview");
  await expect(page.getByRole("button", { name: "Open Folio…" })).toBeVisible();
  // Closing is now the way back here, so this is where the recent list earns its place.
  await expect(page.getByText("/mock/Writing")).toBeVisible();
});

test("after the first run, launch goes straight back to the Folio you were in", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // First run: nothing has been opened, so the Welcome screen is the way in.
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");

  // Every launch after that lands in the Folio, with no Welcome screen on the way.
  await page.reload();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await expect(page.getByRole("button", { name: "Open Folio…" })).toHaveCount(0);
  await expect(page.getByTestId("overview")).toBeVisible();
});
