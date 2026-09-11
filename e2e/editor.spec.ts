import { expect, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await waitForEditor(page);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const html = await page
      .getByTestId("note-editor")
      .locator(".ProseMirror")
      .innerHTML()
      .catch(() => "<no editor>");
    process.stdout.write(`[editor html on failure] ${html.replace(/\n/g, " ").slice(0, 1500)}\n`);
  }
});

test("opens a note WYSIWYG with AML atoms rendered and a word count", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await expect(editor.locator("h1")).toHaveText("Influence networks");
  await expect(editor.locator(".aml-front-matter")).toContainText("Properties");
  await expect(editor.locator(".aml-wiki-link")).toHaveText("04 Methods");
  await expect(editor.locator(".aml-cite")).toHaveText("[@rid2020, p. 41]");
  await expect(editor.locator(".aml-tag")).toHaveText("#thesis/ch3");
  await expect(editor.locator(".aml-raw-block")).toContainText("[!note]");
  await expect(editor.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(page.getByTestId("word-count")).toContainText("words");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
});

async function writtenMarkdown(page: import("@playwright/test").Page, path: string) {
  return page.evaluate((p) => {
    const m = (window as unknown as { __amlMockNotes: Map<string, { text: string }> })
      .__amlMockNotes;
    return m.get(p)?.text ?? null;
  }, path);
}

test("typing marks the note unsaved, then autosaves canonical markdown with front matter intact", async ({
  page,
}) => {
  const h1 = page.getByTestId("note-editor").locator("h1");
  await clickEndOf(page, "h1");
  await page.keyboard.type(" revisited");
  await expect(h1).toHaveText("Influence networks revisited");
  await expect(page.getByTestId("save-state")).toHaveText("Unsaved");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  const md = await writtenMarkdown(page, "Thesis/chapters/03 Influence networks.md");
  expect(
    md?.startsWith("---\ntype: chapter\nstatus: drafting\n---\n\n# Influence networks revisited\n"),
  ).toBe(true);
  expect(md).toContain("[[04 Methods]]");
  expect(md).toContain("> [!note] Callout");
});

test("front matter cannot be deleted by editing", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  const h1 = editor.locator("h1");
  const box = await h1.boundingBox();
  if (!box) throw new Error("no h1");
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(editor.locator(".aml-front-matter")).toHaveCount(1);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type("replaced everything");
  await expect(editor.locator(".aml-front-matter")).toHaveCount(1);
  await expect(editor.locator(".ProseMirror")).toContainText("replaced everything");
});

test("markdown input rules work while typing", async ({ page }) => {
  const editor = page.getByTestId("note-editor").locator(".ProseMirror");
  await clickEndOf(page, "h1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## New section");
  await expect(editor.getByRole("heading", { level: 2, name: "New section" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("**bold** text");
  await expect(editor.locator("strong", { hasText: "bold" })).toHaveCount(1);
  // Let the debounced autosave land before continuing so its state churn is out of the way.
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  await page.keyboard.press("Enter");
  // Small per-key delay: under parallel-worker load Chromium can coalesce keystrokes into one
  // DOM mutation, which bypasses ProseMirror's input rules (not a real-typing scenario).
  await page.keyboard.type("- first item", { delay: 25 });
  await expect(editor.locator("ul:not([data-type]) li", { hasText: "first item" })).toHaveCount(1);
});
