import { expect, type Page, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** Select a word at a time: ⌥⇧← on a Mac, Ctrl+Shift+← elsewhere. */
const word = process.platform === "darwin" ? "Alt" : "Control";
const NOTE = "Thesis/chapters/03 Influence networks.md";

/**
 * Selects `count` words to the left of the caret. ProseMirror adopts a keyboard-moved
 * selection on `selectionchange`, which is a tick later than the key press — so this waits
 * until the editor's own state has a selection before the test acts on it.
 */
async function selectWordsLeft(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) await page.keyboard.press(`${word}+Shift+ArrowLeft`);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const e = (
            window as unknown as { __amlEditor?: { state: { selection: { empty: boolean } } } }
          ).__amlEditor;
          return e ? !e.state.selection.empty : false;
        }),
      { message: "something is selected" },
    )
    .toBe(true);
}

/** What the mock Folio has on disk for a note — the canonical markdown AML wrote. */
async function writtenMarkdown(page: Page, path: string) {
  return page.evaluate((p) => {
    const m = (window as unknown as { __amlMockNotes: Map<string, { text: string }> })
      .__amlMockNotes;
    return m.get(p)?.text ?? null;
  }, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await waitForEditor(page);
});

test("the toolbar marks a phrase, and the file gets ==fences==", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "h1");
  await page.keyboard.type(" and a marked phrase");
  await selectWordsLeft(page, 4);

  await page.getByTestId("highlight").click();
  await page.getByTestId("highlight-yellow").click();
  await expect(editor.locator("mark")).toHaveText("and a marked phrase");
  await expect(editor.locator("mark")).toHaveAttribute("data-colour", "yellow");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  expect(await writtenMarkdown(page, NOTE)).toContain(
    "# Influence networks ==and a marked phrase==",
  );
});

test("a colour is written as its own fence, and reopens in that colour", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "h1");
  await page.keyboard.type(" green");
  await selectWordsLeft(page, 1);
  await page.getByTestId("highlight").click();
  await page.getByTestId("highlight-green").click();
  await expect(editor.locator("mark")).toHaveAttribute("data-colour", "green");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  expect(await writtenMarkdown(page, NOTE)).toContain("# Influence networks ==green=={green}");

  // Away and back: the colour came from the file, not from the editor's memory.
  await page.getByTestId("folio-tree").getByText("04 Methods").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await waitForEditor(page);
  await expect(editor.locator("mark")).toHaveAttribute("data-colour", "green");
});

test("the shortcut toggles a highlight off again, leaving the text alone", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "h1");
  await page.keyboard.type(" word");
  await selectWordsLeft(page, 1);
  await page.keyboard.press(`${mod}+Shift+y`);
  await expect(editor.locator("mark")).toHaveCount(1);
  await page.keyboard.press(`${mod}+Shift+y`);
  await expect(editor.locator("mark")).toHaveCount(0);
  await expect(editor.locator("h1")).toHaveText("Influence networks word");
});
