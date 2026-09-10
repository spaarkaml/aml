import { expect, type Page, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

async function mockNote(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (p) =>
      (window as unknown as { __amlMockNotes: Map<string, { text: string }> }).__amlMockNotes.get(p)
        ?.text ?? "",
    path,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("p").first()).toHaveText("Quick thoughts.");
  await waitForEditor(page);
});

test("[[ opens the note picker; Enter inserts the link; clicking it opens the note", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.type(" [[meth", { delay: 20 });
  const menu = page.getByTestId("link-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option").first()).toContainText("04 Methods");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  const link = editor.locator(".aml-wiki-link");
  await expect(link).toHaveText("04 Methods");
  await expect(link).not.toHaveClass(/aml-link-missing/);
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  expect(await mockNote(page, "Inbox.md")).toContain("[[04 Methods]]");

  await link.click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("04 Methods");
  await expect(editor.locator("h1")).toHaveText("Methods");
});

test("a link to a note that does not exist is dashed; clicking it creates the note", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.type(" [[Brand New", { delay: 20 });
  const menu = page.getByTestId("link-menu");
  await expect(menu.getByRole("option").first()).toContainText("Link to new note");
  await page.keyboard.press("Enter");
  const link = editor.locator(".aml-wiki-link");
  await expect(link).toHaveText("Brand New");
  await expect(link).toHaveClass(/aml-link-missing/);
  await link.click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Brand New");
  await expect(
    page.getByTestId("folio-tree").getByText("Brand New", { exact: true }),
  ).toBeVisible();
});

test("renaming a linked note previews and rewrites the links that point at it", async ({
  page,
}) => {
  const tree = page.getByTestId("folio-tree");
  await tree.getByText("chapters", { exact: true }).click();
  await tree.getByText("04 Methods", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const field = page.getByTestId("rename-field");
  await field.fill("Research Methods");
  await field.press("Enter");

  const dialog = page.getByTestId("rename-links");
  await expect(dialog).toContainText("Update 1 link in 1 note?");
  await expect(dialog).toContainText("[[Research Methods]]");
  await page.getByTestId("rename-update").click();
  await expect(dialog).toHaveCount(0);
  await expect(tree.getByText("Research Methods", { exact: true })).toBeVisible();
  expect(await mockNote(page, "Thesis/chapters/03 Influence networks.md")).toContain(
    "[[Research Methods]]",
  );

  // Undo puts the name and every link back.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByPlaceholder("Type a command…").fill("Undo Last Rename");
  await page.keyboard.press("Enter");
  await expect(tree.getByText("04 Methods", { exact: true })).toBeVisible();
  expect(await mockNote(page, "Thesis/chapters/03 Influence networks.md")).toContain(
    "[[04 Methods]]",
  );
});
