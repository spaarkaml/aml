import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

test("Tags view nests tags with counts; selecting a tag lists and opens its notes", async ({
  page,
}) => {
  // Tags live under Search now: one click to the tab, and they are at the foot of it.
  await page.getByTestId("left-view-search").click();
  const tree = page.getByTestId("tags-tree");
  await expect(tree.getByTestId("tag-thesis")).toContainText("#thesis");
  await expect(tree.getByTestId("tag-thesis")).toContainText("2");
  await expect(tree.getByTestId("tag-journal")).toContainText("1");
  await expect(tree.getByTestId("tag-thesis/ch3")).toHaveCount(0);
  await tree.getByRole("button", { name: "Expand thesis" }).click();
  await expect(tree.getByTestId("tag-thesis/ch3")).toContainText("1");

  await tree.getByTestId("tag-thesis").click();
  const notes = page.getByTestId("tag-notes");
  await expect(notes).toContainText("#thesis · 2 notes");
  await expect(notes).toContainText("03 Influence networks");
  await expect(notes).toContainText("2026-09-09");
  await notes.getByRole("button", { name: /03 Influence networks/ }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");

  // The view choice survives a reload (the mock Folio must be reopened; real AML restores it).
  await page.reload();
  await expect(page.getByTestId("tags-panel")).toBeVisible();
});

test("clicking a #tag chip in a note opens the Tags view on that tag", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks", { exact: true }).click();
  const chip = page.getByTestId("note-editor").locator(".aml-tag");
  await expect(chip).toHaveText("#thesis/ch3");
  await chip.click();
  const notes = page.getByTestId("tag-notes");
  await expect(notes).toContainText("#thesis/ch3 · 1 note");
  await expect(page.getByTestId("tags-tree").getByTestId("tag-thesis/ch3")).toBeVisible();
});
