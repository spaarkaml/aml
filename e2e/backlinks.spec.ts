import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Methods");
});

test("the Context panel lists linked and unlinked mentions; Link turns a mention into a link", async ({
  page,
}) => {
  await page.keyboard.press(`${mod}+Shift+I`);
  const panel = page.getByTestId("backlinks-panel");
  await expect(panel).toContainText("Linked mentions · 1");
  const linked = page.getByTestId("backlinks-list");
  await expect(linked).toContainText("03 Influence networks");
  await expect(linked).toContainText("Influence networks"); // section heading
  await expect(linked).toContainText("See [[04 Methods]]");

  await expect(panel).toContainText("Unlinked mentions · 1");
  const mentions = page.getByTestId("mentions-list");
  await expect(mentions).toContainText("2026-09-09");
  await expect(mentions).toContainText("Tuesday");
  await mentions.getByRole("button", { name: "Link" }).click();
  await expect(panel).toContainText("Unlinked mentions · 0");
  await expect(panel).toContainText("Linked mentions · 2");
  const journal = await page.evaluate(
    () =>
      (window as unknown as { __amlMockNotes: Map<string, { text: string }> }).__amlMockNotes.get(
        "journal/2026-09-09.md",
      )?.text ?? "",
  );
  expect(journal).toContain("section of [[04 Methods]];");

  // Clicking a backlink opens the source note at its section.
  await linked.getByRole("button").first().click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");
});

test("Show Backlinks from the palette opens the Context panel", async ({ page }) => {
  await page.keyboard.press(`${mod}+K`);
  await page.getByPlaceholder("Type a command…").fill("Show Backlinks");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("context-backlinks")).toBeVisible();
  await expect(page.getByTestId("context-properties")).toBeVisible();
});
