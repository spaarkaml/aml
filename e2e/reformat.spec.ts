import { expect, type Page, test } from "@playwright/test";
import { waitForEditor } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const NOTE = "Inbox.md";
const PASTED = "## Pasted heading\n\n- one\n- two\n\n> and a quote";

/** Pastes plain text the way the clipboard would, which is how markdown arrives as text. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((payload) => {
    const pm = document.querySelector(".ProseMirror");
    if (!(pm instanceof HTMLElement)) throw new Error("no editor");
    pm.focus();
    const data = new DataTransfer();
    data.setData("text/plain", payload);
    pm.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

async function writtenMarkdown(page: Page, path: string) {
  return page.evaluate((p) => {
    const m = (window as unknown as { __amlMockNotes: Map<string, { text: string }> })
      .__amlMockNotes;
    return m.get(p)?.text ?? null;
  }, path);
}

async function runReformat(page: Page): Promise<void> {
  await page.keyboard.press(`${mod}+K`);
  await page.getByTestId("palette-input").fill("Reformat Note");
  await page.keyboard.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("Inbox").click();
  await waitForEditor(page);
});

test("pasted markdown stays plain text until the note is reformatted", async ({ page }) => {
  const editor = page.getByTestId("note-editor").locator(".ProseMirror");
  await pasteText(page, PASTED);

  // The premise: a plain-text paste is text, and no amount of it is a heading.
  await expect(editor).toContainText("## Pasted heading");
  await expect(editor.locator("h2")).toHaveCount(0);

  await runReformat(page);
  await expect(editor.locator("h2")).toHaveText("Pasted heading");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("blockquote")).toContainText("and a quote");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  const text = await writtenMarkdown(page, NOTE);
  expect(text).toContain("## Pasted heading");
  expect(text).toContain("- one");
  expect(text).toContain("> and a quote");
});

test("reformatting leaves a note that holds no pasted markdown exactly as it was", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor").locator(".ProseMirror");
  const before = await editor.innerText();
  await runReformat(page);
  await expect(editor).toHaveText(before);
  await expect(page.getByTestId("save-state")).not.toHaveText("Unsaved");
});

test("the reformat can be undone in one step", async ({ page }) => {
  const editor = page.getByTestId("note-editor").locator(".ProseMirror");
  await pasteText(page, PASTED);
  // Far enough apart that ProseMirror's history keeps them as two steps, as they would be.
  await page.waitForTimeout(700);
  await runReformat(page);
  await expect(editor.locator("h2")).toHaveCount(1);

  await editor.click();
  await page.keyboard.press(`${mod}+z`);
  await expect(editor.locator("h2")).toHaveCount(0);
  await expect(editor).toContainText("## Pasted heading");
});
