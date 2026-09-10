import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("boots with wordmark, status info and pinned Browser (Desk layout)", async ({ page }) => {
  await expect(page.getByText("Open a Folio to start writing.")).toBeVisible();
  await expect(page.getByTestId("app-info")).toContainText("0.0.0-browser");
  await expect(page.getByTestId("panel-left")).toHaveAttribute("data-pinned", "true");
});

test("layout shortcut switches Desk → Page and persists across reload", async ({ page }) => {
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect(page.getByTestId("layout-toggle")).toHaveText("Page");
  await expect(page.getByTestId("panel-left")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toHaveText("Page");
});

test("context panel opens as an overlay, Escape closes it, pin keeps it", async ({ page }) => {
  await page.keyboard.press(`${mod}+Shift+I`);
  const right = page.getByTestId("panel-right");
  await expect(right).toHaveAttribute("data-pinned", "false");
  await page.keyboard.press("Escape");
  await expect(right).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+I`);
  await right.getByRole("button", { name: "Pin" }).click();
  await expect(right).toHaveAttribute("data-pinned", "true");
  await page.keyboard.press("Escape");
  await expect(right).toBeVisible();
});

test("command palette: open, fuzzy filter, run, close", async ({ page }) => {
  await page.keyboard.press(`${mod}+K`);
  const input = page.getByTestId("palette-input");
  await expect(input).toBeFocused();
  await input.fill("paper ink");
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-mode", /paper|ink/);
});

test("appearance cycles Auto → Paper → Ink", async ({ page }) => {
  const btn = page.getByTitle(/Appearance/);
  await expect(btn).toHaveText("Auto");
  await btn.click();
  await expect(btn).toHaveText("Paper");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "paper");
  await btn.click();
  await expect(btn).toHaveText("Ink");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "ink");
});

test("every shell shortcut is bound", async ({ page }) => {
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByTestId("panel-left")).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByTestId("panel-left")).toBeVisible();
  await page.keyboard.press(`${mod}+Shift+M`);
  await expect(page.getByTitle(/Appearance/)).toHaveText("Paper");
});
