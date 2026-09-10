import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Influence networks");
  await page.keyboard.press(`${mod}+Shift+I`);
  await expect(page.getByTestId("outline-panel")).toBeVisible();
});

test("the outline lists headings, follows edits, and jumping moves the highlight", async ({
  page,
}) => {
  const list = page.getByTestId("outline-list");
  await expect(list.getByRole("listitem")).toHaveText([
    "H1Influence networks",
    "H2Three properties",
  ]);

  // The caret starts at the top of the note, so the first section is the current one.
  await expect(page.getByTestId("outline-item-0")).toHaveAttribute("aria-current", "true");
  await page.getByTestId("outline-item-1").click();
  await expect(page.getByTestId("outline-item-1")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("outline-item-0")).not.toHaveAttribute("aria-current", "true");

  // The outline is built from the live document, not the index: editing a heading shows now.
  // Jumping leaves the caret in that heading, so End + typing extends it.
  await page.getByTestId("outline-item-0").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" revised");
  await expect(page.getByTestId("outline-item-0")).toContainText("Influence networks revised");
});

test("a section can be reordered by dragging it, and put back from the palette", async ({
  page,
}) => {
  const editor = page.getByTestId("note-editor");
  const headings = editor.locator("h1, h2");
  await expect(headings).toHaveText(["Influence networks", "Three properties"]);

  await page.getByTestId("outline-item-1").dragTo(page.getByTestId("outline-item-0"));
  await expect(page.getByTestId("outline-list").getByRole("listitem")).toHaveText([
    "H2Three properties",
    "H1Influence networks",
  ]);
  // The document moved with it: the whole section travelled, list items included.
  await expect(headings).toHaveText(["Three properties", "Influence networks"]);
  await expect(editor.locator("li").first()).toContainText("repetition without attribution");

  // The caret stays in the section that moved, so the palette can put it back.
  await page.keyboard.press(`${mod}+k`);
  await page.getByTestId("palette-input").fill("Move Section Down");
  await page.keyboard.press("Enter");
  await expect(headings).toHaveText(["Influence networks", "Three properties"]);
});
