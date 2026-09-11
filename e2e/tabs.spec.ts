import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function openFolio(page: Page) {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("folio-tree")).toBeVisible();
}

async function openNote(page: Page, label: string) {
  await page.getByTestId("folio-tree").getByText(label, { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText(label);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await openFolio(page);
});

test("opening notes adds tabs; clicking a tab switches the editor and breadcrumb", async ({
  page,
}) => {
  await openNote(page, "Inbox");
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await openNote(page, "03 Influence networks");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(page.getByTestId("breadcrumb")).toHaveText(
    /^Writing\s*Thesis\s*chapters\s*03 Influence networks$/,
  );
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Influence networks");
  await tabs.filter({ hasText: "Inbox" }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await expect(page.getByTestId("breadcrumb")).toHaveText(/^Writing\s*Inbox$/);
  await expect(page.getByTestId("note-editor")).toContainText("Quick thoughts.");
});

test("Close Tab shortcut closes the active tab and activates its neighbour", async ({ page }) => {
  await openNote(page, "Inbox");
  await openNote(page, "Three");
  await page.keyboard.press(`${mod}+W`);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await page.keyboard.press(`${mod}+W`);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("overview")).toBeVisible();
});

test("back and forward walk the visit history; number keys jump to tabs", async ({ page }) => {
  await openNote(page, "Inbox");
  await openNote(page, "Three");
  await openNote(page, "2026-09-09");
  await page.keyboard.press(`${mod}+BracketLeft`);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Three");
  await page.keyboard.press(`${mod}+BracketLeft`);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await page.keyboard.press(`${mod}+BracketRight`);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Three");
  await page.keyboard.press(`${mod}+3`);
  await expect(page.getByRole("tab", { selected: true })).toContainText("2026-09-09");
  await page.keyboard.press(`${mod}+Alt+ArrowRight`);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
});

test("tabs are restored when the same Folio is opened again", async ({ page }) => {
  await openNote(page, "Inbox");
  await openNote(page, "Three");
  await page.reload();
  await openFolio(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Three");
  await expect(page.getByTestId("note-editor")).toBeVisible();
});
