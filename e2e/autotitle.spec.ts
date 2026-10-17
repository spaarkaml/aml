import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** The settle (2 s) plus the save debounce (1 s), with room for the rename to land. */
const RENAMED = { timeout: 8000 };

/** A new note from ⌘N, with the Browser's inline rename dismissed as Escape dismisses it. */
async function newNote(page: Page): Promise<void> {
  await page.keyboard.press(`${mod}+N`);
  await expect(page.getByTestId("rename-field")).toBeVisible();
}

async function typeInEditor(page: Page, text: string): Promise<void> {
  await page.getByTestId("note-editor").locator(".ProseMirror").click();
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("folio-tree")).toBeVisible();
});

test("an Untitled note takes its name from the title written at the top of it", async ({
  page,
}) => {
  await newNote(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Untitled");

  await typeInEditor(page, "# Thesis outline");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Thesis outline", RENAMED);
  await expect(page.getByTestId("breadcrumb")).toContainText("Thesis outline");
  await expect(page.getByTestId("folio-tree")).toContainText("Thesis outline");

  // And it is the file that moved, not just the label on the tab.
  const paths = await page.evaluate(() => {
    const m = (window as unknown as { __amlMockNotes: Map<string, unknown> }).__amlMockNotes;
    return [...m.keys()];
  });
  expect(paths).toContain("Thesis outline.md");
  expect(paths).not.toContain("Untitled.md");
});

test("a note the user has already named keeps that name, whatever its heading says", async ({
  page,
}) => {
  await newNote(page);
  await page.getByTestId("rename-field").fill("My own name");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { selected: true })).toContainText("My own name");

  await typeInEditor(page, "# A different title");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  await page.waitForTimeout(3000);
  await expect(page.getByRole("tab", { selected: true })).toContainText("My own name");
});

test("a title that is nothing but punctuation leaves the note Untitled", async ({ page }) => {
  await newNote(page);
  await page.keyboard.press("Escape");
  await typeInEditor(page, "# ///");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  await page.waitForTimeout(3000);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Untitled");
});
