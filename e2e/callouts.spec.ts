import { expect, type Page, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

const CHAPTER = "Thesis/chapters/03 Influence networks.md";

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
});

test("a callout in a file is a callout on screen, and its body is editable text", async ({
  page,
}) => {
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await waitForEditor(page);

  const callout = page.getByTestId("note-editor").locator(".aml-callout");
  await expect(callout).toHaveAttribute("data-callout", "note");
  await expect(callout.locator(".aml-callout-title")).toHaveText("Callout");
  // Not a monospace Raw chip any more: the body is prose you can type into.
  await expect(page.getByTestId("note-editor").locator(".aml-raw-block")).toHaveCount(0);

  await clickEndOf(page, ".aml-callout p");
  await page.keyboard.type(" Edited.", { delay: 20 });
  const md = await savedMarkdown(page, CHAPTER);
  expect(md).toContain("> [!note] Callout\n> Held verbatim. Edited.\n");
});

test("the title is editable, and what is typed there lands on the callout's first line", async ({
  page,
}) => {
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await waitForEditor(page);

  await clickEndOf(page, ".aml-callout-title");
  await page.keyboard.type(" of note", { delay: 20 });
  const md = await savedMarkdown(page, CHAPTER);
  expect(md).toContain("> [!note] Callout of note\n> Held verbatim.\n");
});

test("/callout inserts one, and it is written as Obsidian's own syntax", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("p").first()).toHaveText("Quick thoughts.");
  await waitForEditor(page);

  await clickEndOf(page, "p");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/call", { delay: 20 });
  const menu = page.getByTestId("slash-menu");
  await expect(menu.getByRole("option").first()).toContainText("Callout");
  await page.keyboard.press("Enter");

  const callout = page.getByTestId("note-editor").locator(".aml-callout");
  await expect(callout).toBeVisible();
  // A callout with no title of its own still says what kind it is.
  await expect(callout.locator(".aml-callout-title")).toHaveText("");
  await expect(callout).toHaveAttribute("data-tone", "info");

  await callout.locator(".aml-callout-title").click();
  await page.keyboard.type("Remember", { delay: 20 });
  const md = await savedMarkdown(page, "Inbox.md");
  expect(md).toContain("> [!note] Remember");
});
