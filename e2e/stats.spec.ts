import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");
});

test("the word count opens the figures, and they follow the note", async ({ page }) => {
  const before = await page.getByTestId("word-count").textContent();
  await page.getByTestId("word-count").click();
  await expect(page.getByTestId("stats-figures")).toBeVisible();

  // The panel's word count is the status bar's: one rule, counted once (Q19).
  await expect(page.getByTestId("stat-words")).toHaveText((before ?? "").replace(/\s*words?$/, ""));
  await expect(page.getByTestId("stat-sentences")).not.toHaveText("0");
  await expect(page.getByTestId("stat-characters-bare")).not.toHaveText("0");

  // Its sections are the note's headings, with the words under each.
  await expect(page.getByTestId("stats-sections")).toContainText("Influence networks");
  await expect(page.getByTestId("stats-sections")).toContainText("Three properties");

  await page.getByTestId("stats-close").click();
  await expect(page.getByTestId("stats-figures")).toHaveCount(0);
});

test("the figures are recounted from the note as it is now, not as it was saved", async ({
  page,
}) => {
  await page.getByTestId("note-editor").locator("h1").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" one two three four five");

  await page.getByTestId("word-count").click();
  const words = Number((await page.getByTestId("stat-words").textContent())?.replace(/\D/g, ""));
  expect(words).toBeGreaterThan(35);
  // The heading grew, so its section did too.
  await expect(page.getByTestId("stats-section-0")).toContainText("one two three four five");
});

test("Statistics is in the palette, and says so when there is too little to measure", async ({
  page,
}) => {
  await page.getByTestId("folio-tree").getByText("Inbox").click();
  await page.keyboard.press(`${mod}+k`);
  await page.getByTestId("palette-input").fill("Statistics");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("stats-figures")).toBeVisible();
  // Two words is not enough for a grade level, and it says so rather than printing one.
  await expect(page.getByTestId("stats-readability")).toContainText("Too little text");
});
