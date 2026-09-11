import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/**
 * Puts the caret in the note's prose paragraph and waits for ProseMirror to adopt it — a
 * mouse-placed caret is taken up asynchronously, so reading the selection straight after a
 * click reports the one the editor started with.
 */
async function caretInProse(page: Page): Promise<void> {
  const paragraph = page
    .getByTestId("note-editor")
    .locator("p")
    .filter({ hasText: "The distinction" })
    .first();
  // Near the start of the line: the middle of this paragraph is a link.
  await paragraph.click({ position: { x: 8, y: 8 } });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __amlEditor?: {
                state: { selection: { $head: { parent: { type: { name: string } } } } };
              };
            }
          ).__amlEditor?.state.selection.$head.parent.type.name,
      ),
    )
    .toBe("paragraph");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Influence networks");
});

test("Focus Mode dims the rest of the note, then all but the sentence", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  // By text, not position: the front-matter chip renders paragraphs of its own.
  const paragraph = editor.locator("p").filter({ hasText: "The distinction" }).first();
  await caretInProse(page);

  await expect(editor.locator(".aml-dim")).toHaveCount(0);
  await page.keyboard.press(`${mod}+Alt+d`);
  await expect(page.getByTestId("focus-chip")).toHaveText("Focus: Paragraph");

  // The block holding the caret stays lit; the heading above it does not.
  await expect(editor.locator("h1.aml-dim")).toHaveCount(1);
  // Other paragraphs dim; the one holding the caret does not.
  await expect(paragraph).not.toHaveClass(/aml-dim/);

  await page.keyboard.press(`${mod}+Alt+d`);
  await expect(page.getByTestId("focus-chip")).toHaveText("Focus: Sentence");
  // Inside the caret's paragraph, the sentences around it are dimmed too.
  const dimmedInside = paragraph.locator(".aml-dim");
  await expect(dimmedInside.first()).toBeVisible();
  await expect(paragraph).toContainText("rarely visible");

  await page.keyboard.press(`${mod}+Alt+d`);
  await expect(page.getByTestId("focus-chip")).toHaveCount(0);
  await expect(editor.locator(".aml-dim")).toHaveCount(0);
});

test("the Focus chip cycles and the mode is remembered per device", async ({ page }) => {
  await page.keyboard.press(`${mod}+Alt+d`);
  await expect(page.getByTestId("focus-chip")).toHaveText("Focus: Paragraph");
  await page.getByTestId("focus-chip").click();
  await expect(page.getByTestId("focus-chip")).toHaveText("Focus: Sentence");

  await page.reload();
  await expect(page.getByTestId("focus-chip")).toHaveText("Focus: Sentence");
});

test("Typewriter Mode keeps the caret line in place as the note grows", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await page.keyboard.press(`${mod}+Alt+t`);
  await expect(page.getByTestId("typewriter-chip")).toBeVisible();

  // The page gains room below the last line so it can rise to the middle.
  const padding = await editor.evaluate((el) => getComputedStyle(el).paddingBottom);
  expect(padding).not.toBe("0px");

  await caretInProse(page);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  for (let i = 0; i < 12; i++) await page.keyboard.type(`Line ${i} of a long draft. `);

  // The caret ends up near the fixed line rather than at the bottom of the page.
  const offset = await editor.evaluate((el) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const caret = selection.getRangeAt(0).getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return (caret.top - box.top) / box.height;
  });
  expect(offset).not.toBeNull();
  expect(offset as number).toBeGreaterThan(0.2);
  expect(offset as number).toBeLessThan(0.65);

  await page.getByTestId("typewriter-chip").click();
  await expect(page.getByTestId("typewriter-chip")).toHaveCount(0);
});

test("Zen hides everything but the page, and Escape brings it back", async ({ page }) => {
  await page.keyboard.press(`${mod}+Alt+z`);
  await expect(page.getByTestId("note-editor")).toBeVisible();
  await expect(page.getByTestId("layout-toggle")).toHaveCount(0);
  await expect(page.getByTestId("word-count")).toHaveCount(0);
  await expect(page.getByTestId("panel-left")).toHaveCount(0);
  await expect(page.getByTestId("zen-hint")).toContainText("Escape");

  // The palette still works, because it is how you reach anything in Zen.
  await page.keyboard.press(`${mod}+k`);
  await expect(page.getByTestId("palette-input")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await expect(page.getByTestId("note-editor")).toBeVisible();
});
