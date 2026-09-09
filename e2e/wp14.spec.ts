import { expect, type Page, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

async function savedMarkdown(page: Page, path: string): Promise<string> {
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
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

test("brackets auto-pair, closers skip over, Backspace removes an empty pair, [[ ]] becomes a link", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.press("Enter");
  await page.keyboard.type("(", { delay: 20 });
  await expect(editor.locator("p").nth(1)).toHaveText("()");
  await page.keyboard.type("a)", { delay: 20 });
  await expect(editor.locator("p").nth(1)).toHaveText("(a)");
  await page.keyboard.type(" {", { delay: 20 });
  await expect(editor.locator("p").nth(1)).toHaveText("(a) {}");
  await page.keyboard.press("Backspace");
  await expect(editor.locator("p").nth(1)).toHaveText("(a) ");
  await page.keyboard.type("[[04 Meth]]", { delay: 20 });
  await expect(editor.locator(".aml-wiki-link")).toHaveText("04 Meth");
  const md = await savedMarkdown(page, "Inbox.md");
  expect(md).toContain("(a) [[04 Meth]]");
});

test("typing / opens the block menu; filtering + Enter converts the paragraph; Escape keeps the slash", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/", { delay: 20 });
  const menu = page.getByTestId("slash-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option").first()).toContainText("Heading 1");
  await page.keyboard.type("quo", { delay: 20 });
  await expect(menu.getByRole("option").first()).toContainText("Quote");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type("Said so.", { delay: 20 });
  await expect(editor.locator("blockquote p")).toHaveText("Said so.");
  const md = await savedMarkdown(page, "Inbox.md");
  expect(md).toContain("> Said so.");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/", { delay: 20 });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editor.locator("p", { hasText: "/" })).toHaveCount(1);
});

test("selecting text shows the formatting toolbar; bold and link apply and save", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  const box = await editor.locator("p").first().boundingBox();
  if (!box) throw new Error("no paragraph");
  await page.mouse.dblclick(box.x + 10, box.y + box.height / 2);
  const bar = page.getByTestId("selection-toolbar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Bold" }).click();
  await expect(editor.locator("strong")).toHaveText("Quick");
  await expect(bar.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Add link" }).click();
  await page.getByTestId("link-url").fill("https://example.org");
  await page.keyboard.press("Enter");
  await expect(editor.locator("a[href='https://example.org']")).toHaveText("Quick");
  const md = await savedMarkdown(page, "Inbox.md");
  expect(md).toContain("[**Quick**](https://example.org)");
});
