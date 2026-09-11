import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

const results = (page: Page) => page.getByTestId("search-results");

/** Types a query and waits for the results that belong to it (typing is debounced). */
async function search(page: Page, query: string): Promise<void> {
  await page.getByTestId("search-input").fill(query);
  await expect(results(page)).toHaveAttribute("data-query", query);
}

test("the shortcut opens Search; a word query highlights hits and opens the note", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+Shift+f");
  await expect(page.getByTestId("search-input")).toBeFocused();

  await search(page, "manipulation");
  await expect(page.getByTestId("search-summary")).toHaveText("1 note");
  await expect(results(page)).toContainText("03 Influence networks");
  await expect(results(page).locator("mark")).toHaveText("manipulation");

  await results(page)
    .getByRole("button", { name: /persuasion and manipulation/ })
    .click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");
});

test("words match at word starts and field terms narrow the results", async ({ page }) => {
  await page.getByTestId("left-view-search").click();

  await search(page, "interview");
  await expect(page.getByTestId("search-summary")).toHaveText("2 notes");
  await expect(results(page)).toContainText("04 Methods");
  await expect(results(page)).toContainText("2026-09-09");

  await search(page, "interview -tag:journal");
  await expect(page.getByTestId("search-summary")).toHaveText("1 note");
  await expect(results(page)).toContainText("04 Methods");

  await search(page, "status:drafting");
  await expect(page.getByTestId("search-summary")).toHaveText("3 notes");
  await expect(results(page)).toContainText("03 Influence networks");
  await expect(results(page)).toContainText("01 Arrival");

  await search(page, '"needs a table"');
  await expect(results(page).locator("mark")).toHaveText("needs a table");

  await search(page, "/methodolog\\w+/");
  await expect(page.getByTestId("search-summary")).toHaveText("2 notes");
  await expect(results(page).locator("mark")).toHaveText(["methodology", "methodology"]);

  await search(page, "/(/");
  await expect(page.getByRole("alert")).toContainText("regex");
  await expect(results(page)).toBeEmpty();
});

test("replace rewrites every match in the open note", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("04 Methods");

  await page.getByTestId("left-view-search").click();
  await search(page, "interview");
  await expect(page.getByTestId("search-summary")).toHaveText("2 notes");

  await page.getByTestId("replace-input").fill("conversation");
  await page.getByTestId("replace-run").click();
  await expect(page.getByTestId("replace-count")).toHaveText("1 replaced");
  await expect(page.getByTestId("note-editor")).toContainText("conversation protocol");
});
