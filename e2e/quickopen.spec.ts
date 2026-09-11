import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function quickOpen(page: Page) {
  await page.keyboard.press(`${mod}+O`);
  await expect(page.getByTestId("quickopen-input")).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("folio-tree")).toBeVisible();
});

test("empty query lists recents first; typing filters by title and Enter opens", async ({
  page,
}) => {
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await quickOpen(page);
  const options = page.getByRole("option");
  await expect(options.first()).toContainText("Inbox");
  await expect(options.first()).toContainText("recent");
  await page.getByTestId("quickopen-input").fill("meth");
  await expect(options.first()).toContainText("04 Methods");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("quickopen-input")).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toContainText("04 Methods");
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Methods");
});

test("alias and heading matches are labelled; a heading match places the caret there", async ({
  page,
}) => {
  await quickOpen(page);
  await page.getByTestId("quickopen-input").fill("methodology");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("04 Methods");
  await expect(first).toContainText("alias");
  await page.getByTestId("quickopen-input").fill("interview prot");
  await expect(first).toContainText("heading");
  await expect(first).toContainText("Interview protocol");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { selected: true })).toContainText("04 Methods");
  const editor = page.getByTestId("note-editor");
  await expect(editor.locator("h2")).toHaveText("Interview protocol");
  // The caret sits in the heading: typing lands there.
  await page.keyboard.type("Draft ");
  await expect(editor.locator("h2")).toHaveText("Draft Interview protocol");
});

test("an unmatched query offers to create the note", async ({ page }) => {
  await quickOpen(page);
  await page.getByTestId("quickopen-input").fill("Reading list");
  await expect(page.getByTestId("quickopen-create")).toContainText("Create note “Reading list”");
  await page.getByTestId("quickopen-create").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Reading list");
  await expect(
    page.getByTestId("folio-tree").getByText("Reading list", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("rename-field")).toHaveCount(0);
});

test("Escape and backdrop close it; it does nothing without a Folio", async ({ page }) => {
  await quickOpen(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("quickopen-input")).toHaveCount(0);
  await quickOpen(page);
  // Near the edge, not the middle: a long result list reaches the centre of the viewport.
  await page
    .getByTestId("quickopen-backdrop")
    .getByRole("button", { name: "Close Quick Open" })
    .click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("quickopen-input")).toHaveCount(0);
});
