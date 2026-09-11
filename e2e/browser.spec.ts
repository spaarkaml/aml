import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function mockNotePaths(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...(window as unknown as { __amlMockNotes: Map<string, unknown> }).__amlMockNotes.keys(),
    ].sort(),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("folio-tree")).toBeVisible();
});

test("+ Note creates an untitled note, opens it and renames it inline", async ({ page }) => {
  await page.getByRole("button", { name: "+ Note" }).click();
  const field = page.getByTestId("rename-field");
  await expect(field).toHaveValue("Untitled");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Untitled");
  await field.fill("Ideas");
  await field.press("Enter");
  await expect(page.getByTestId("folio-tree").getByText("Ideas", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Ideas");
  await expect(page.getByTestId("breadcrumb")).toHaveText(/^Writing\s*Ideas$/);
  expect(await mockNotePaths(page)).toContain("Ideas.md");
  expect(await mockNotePaths(page)).not.toContain("Untitled.md");
});

test("New Note shortcut creates the note beside the active one", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("Three", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Three");
  await page.keyboard.press(`${mod}+N`);
  await page.getByTestId("rename-field").press("Escape");
  expect(await mockNotePaths(page)).toContain("The Salt Road/Untitled.md");
});

test("folder context menu creates a note inside that folder", async ({ page }) => {
  await page
    .getByTestId("folio-tree")
    .getByText("journal", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "New Note" }).click();
  await page.getByTestId("rename-field").press("Escape");
  await expect(
    page.getByTestId("folio-tree").locator('[data-path="journal/Untitled.md"]'),
  ).toBeVisible();
});

test("rename and trash from the context menu update tabs and the tree", async ({ page }) => {
  const tree = page.getByTestId("folio-tree");
  await tree.getByText("Inbox", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await tree.getByText("Inbox", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const field = page.getByTestId("rename-field");
  await field.fill("Outbox");
  await field.press("Enter");
  await expect(tree.getByText("Outbox", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Outbox");
  expect(await mockNotePaths(page)).toContain("Outbox.md");

  await tree.getByText("Outbox", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Trash…" }).click();
  await expect(tree.getByText("Outbox", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(await mockNotePaths(page)).not.toContain("Outbox.md");
});

test("dragging a note onto a folder moves it and its tab follows", async ({ page }) => {
  const tree = page.getByTestId("folio-tree");
  await tree.getByText("Inbox", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await tree.getByText("Inbox", { exact: true }).dragTo(tree.getByText("journal", { exact: true }));
  await expect(tree.locator('[data-path="journal/Inbox.md"]')).toBeVisible();
  await expect(page.getByTestId("breadcrumb")).toHaveText(/^Writing\s*journal\s*Inbox$/);
  expect(await mockNotePaths(page)).toContain("journal/Inbox.md");
});

test("expanded folders persist across reload; breadcrumb reveals folders", async ({ page }) => {
  const tree = page.getByTestId("folio-tree");
  await tree.getByText("chapters", { exact: true }).click();
  await expect(tree.getByText("04 Methods")).toBeVisible();
  await tree.getByText("Thesis", { exact: true }).click();
  await expect(tree.getByText("chapters", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(tree.getByText("Inbox", { exact: true })).toBeVisible();
  await expect(tree.getByText("chapters", { exact: true })).toHaveCount(0);
  await tree.getByText("Thesis", { exact: true }).click();
  await expect(tree.getByText("04 Methods")).toBeVisible();
});
