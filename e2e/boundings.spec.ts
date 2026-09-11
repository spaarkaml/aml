import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

test("the Overview is the home screen: Boundings, the week and recents", async ({ page }) => {
  const overview = page.getByTestId("overview");
  await expect(overview).toContainText("Writing");
  await expect(page.getByTestId("overview-bounding-academic")).toContainText("Academic");
  await expect(page.getByTestId("overview-bounding-academic")).toContainText("2 notes");
  await expect(overview).toContainText("Stage 5"); // no Projects yet

  // The week bar reaches the same Daily notes as the Daily panel.
  const iso = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  await page.getByTestId(`overview-day-${iso}`).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText(iso);

  // Closing the note returns to the Overview, now listing what we just opened.
  await page.keyboard.press(`${mod}+w`);
  await expect(page.getByTestId("overview-recent")).toContainText(iso);
});

test("a Bounding can be created, edited, filled from the open note and deleted", async ({
  page,
}) => {
  await page.getByTestId("left-view-boundings").click();
  await expect(page.getByTestId("bounding-academic")).toContainText("Academic");

  await page.getByTestId("bounding-new").click();
  const editor = page.getByTestId("bounding-editor-draft");
  await expect(editor).toBeVisible();
  await editor.getByTestId("bounding-name").fill("Creative");
  await editor.getByTestId("bounding-icon").fill("✒");
  await editor.getByTestId("bounding-save").click();
  await expect(page.getByTestId("bounding-creative")).toContainText("Creative");
  await expect(page.getByTestId("bounding-creative")).toContainText("✒");

  // Add the open note, and see the count and the search field follow.
  await page.getByTestId("left-view-folio").click();
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await page.getByTestId("left-view-boundings").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
  await page.getByTestId("bounding-toggle-creative").click();
  await expect(page.getByTestId("bounding-creative")).toContainText("1");
  // A new Bounding is selected as it is created, so its notes are already listed.
  await expect(page.getByTestId("bounding-notes-creative")).toContainText("Inbox");

  await page.getByTestId("left-view-search").click();
  await page.getByTestId("search-input").fill("bounding:Creative");
  await expect(page.getByTestId("search-results")).toHaveAttribute(
    "data-query",
    "bounding:Creative",
  );
  await expect(page.getByTestId("search-summary")).toHaveText("1 note");
  await expect(page.getByTestId("search-results")).toContainText("Inbox");

  // Removing the note empties it again; deleting takes two clicks.
  await page.getByTestId("left-view-boundings").click();
  await page.getByTestId("bounding-toggle-creative").click();
  await expect(page.getByTestId("bounding-creative")).toContainText("0");
  await page.getByTestId("bounding-edit-creative").click();
  await page.getByTestId("bounding-delete").click();
  await expect(page.getByTestId("bounding-delete")).toHaveText("Really delete?");
  await page.getByTestId("bounding-delete").click();
  await expect(page.getByTestId("bounding-creative")).toHaveCount(0);
  await expect(page.getByTestId("bounding-academic")).toBeVisible();
});

test("renaming a note keeps it in its Boundings, and the palette can add to one", async ({
  page,
}) => {
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("04 Methods");

  await page.getByTestId("left-view-boundings").click();
  await page.getByTestId("bounding-academic").click();
  await expect(page.getByTestId("bounding-notes-academic")).toContainText("04 Methods");

  await page.keyboard.press("F2");
  const field = page.getByTestId("rename-field");
  await field.fill("04 Method work");
  await field.press("Enter");
  // This note is linked, so the rename asks about the links first.
  await page.getByTestId("rename-update").click();
  // Renaming shows the Browser, so come back to see the Bounding followed the note.
  await page.getByTestId("left-view-boundings").click();
  await expect(page.getByTestId("bounding-notes-academic")).toContainText("04 Method work");
  await expect(page.getByTestId("bounding-academic")).toContainText("2");
});

test("a note in no Bounding is offered the choice at the top of the page", async ({ page }) => {
  const tree = page.getByTestId("folio-tree");
  await tree.getByText("Inbox", { exact: true }).click();
  const prompt = page.getByTestId("bounding-prompt");
  await expect(prompt).toBeVisible();

  // Picking one files the note and the prompt has nothing left to ask.
  await page.getByTestId("bounding-prompt-academic").click();
  await expect(prompt).toHaveCount(0);

  // A note that is already in a Bounding is never asked.
  await tree.getByText("Inbox", { exact: true }).click();
  await expect(page.getByTestId("bounding-prompt")).toHaveCount(0);
});
