import { expect, type Locator, type Page, test } from "@playwright/test";
import { LINE_START, waitForEditor } from "./helpers";

/** True once the caret sits at the very start of the block whose text is `text`. */
function caretAtStartOf(page: Page, text: string): Promise<boolean> {
  return page.evaluate((want) => {
    const editor = (
      window as unknown as {
        __amlEditor?: {
          state: {
            selection: { $from: { parentOffset: number; parent: { textContent: string } } };
          };
        };
      }
    ).__amlEditor;
    if (!editor) return false;
    const { $from } = editor.state.selection;
    return $from.parentOffset === 0 && $from.parent.textContent === want;
  }, text);
}

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function mockNotes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [
        ...(
          window as unknown as { __amlMockNotes: Map<string, { text: string }> }
        ).__amlMockNotes.entries(),
      ].map(([path, note]) => [path, note.text]),
    ),
  );
}

const figure = async (el: Locator) => Number((await el.innerText()).replace(/[^\d]/g, ""));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

async function openProject(page: Page) {
  await page.getByTestId("overview-project-The Salt Road").click();
  await expect(page.getByTestId("binder")).toBeVisible();
}

/** The Binder's rows, in the order they are read. */
async function binderOrder(page: Page): Promise<string[]> {
  return page.getByTestId("binder-rows").locator("[data-testid^='binder-']").allInnerTexts();
}

test("a Project opens into its Binder, and the Browser becomes the book", async ({ page }) => {
  await openProject(page);

  // The Browser's first tab is the book now, and the Project is named in the top bar.
  await expect(page.getByTestId("left-view-folio")).toHaveText("Binder");
  await expect(page.getByTestId("project-tab")).toContainText("The Salt Road");
  await expect(page.getByTestId("project-dashboard")).toBeVisible();

  // Parts and documents, nested, in the Browser's order until the manifest says otherwise.
  expect((await binderOrder(page)).map((t) => t.split("\n")[0])).toEqual([
    "part one",
    "01 Arrival",
    "02 The road",
    "part two",
    "03 Salt",
    "Three",
  ]);
  expect(await figure(page.getByTestId("project-documents"))).toBe(4);
  expect(await figure(page.getByTestId("project-parts"))).toBe(2);

  // Leaving puts the whole Folio back.
  await page.getByTestId("binder-leave").click();
  await expect(page.getByTestId("folio-tree")).toBeVisible();
  await expect(page.getByTestId("project-tab")).toHaveCount(0);
});

test("dragging in the Binder changes the order, and the order is the manifest's", async ({
  page,
}) => {
  await openProject(page);
  const road = page.getByTestId("binder-part one/02 The road.md");
  const arrival = page.getByTestId("binder-part one/01 Arrival.md");
  // Onto the top of the row above: "put this before that".
  await road.dragTo(arrival, { targetPosition: { x: 40, y: 2 } });

  const after = ["part one", "02 The road", "01 Arrival", "part two", "03 Salt", "Three"];
  expect((await binderOrder(page)).map((t) => t.split("\n")[0])).toEqual(after);

  // Out of the Project and back in: the order came from the file, not from the screen.
  await page.getByTestId("binder-leave").click();
  await openProject(page);
  expect((await binderOrder(page)).map((t) => t.split("\n")[0])).toEqual(after);
});

test("a document can be left out of the compile without leaving the Project", async ({ page }) => {
  await openProject(page);
  const words = await figure(page.getByTestId("project-words"));
  const included = await figure(page.getByTestId("project-included"));
  expect(included).toBe(words);

  await page.getByTestId("include-part one/02 The road.md").click();
  await expect(page.getByTestId("binder-part one/02 The road.md")).toHaveAttribute("data-out", "");
  expect(await figure(page.getByTestId("project-excluded"))).toBe(1);
  // Its words are still the Project's; they are simply not the book's.
  expect(await figure(page.getByTestId("project-words"))).toBe(words);
  expect(await figure(page.getByTestId("project-included"))).toBeLessThan(included);

  // Excluding a part excludes what is under it.
  await page.getByTestId("include-part two").click();
  await expect(page.getByTestId("binder-part two/03 Salt.md")).toHaveAttribute("data-out", "");
});

test("a synopsis typed on a card is written into the note's own front matter", async ({ page }) => {
  await openProject(page);
  await page.getByTestId("open-corkboard").click();
  await expect(page.getByTestId("corkboard")).toBeVisible();

  const card = page.getByTestId("card-part one/01 Arrival.md");
  await expect(card).toContainText("She reaches the salt flats at dusk.");

  const synopsis = page.getByTestId("synopsis-part one/02 The road.md");
  await synopsis.fill("They walk east for three days.");
  await synopsis.blur();
  await page.getByTestId("status-part one/02 The road.md").fill("revised");
  await page.getByTestId("status-part one/02 The road.md").press("Enter");

  await expect
    .poll(async () => (await mockNotes(page))["The Salt Road/part one/02 The road.md"])
    .toContain("synopsis: They walk east for three days.");
  const text = (await mockNotes(page))["The Salt Road/part one/02 The road.md"] ?? "";
  // The status changed in place; the body is untouched.
  expect(text).toContain("status: revised");
  expect(text).toContain("# The road");
  expect(text).not.toContain("status: drafting");
});

test("the Project's goal lives with the Project, and the dashboard does the arithmetic", async ({
  page,
}) => {
  await openProject(page);
  await page.getByTestId("project-target").fill("1000");
  await page.getByTestId("project-target").press("Enter");
  await expect(page.getByTestId("project-goal")).toContainText("of 1,000");

  await page.getByTestId("project-title").fill("The Salt Road — draft two");
  await page.getByTestId("project-title").press("Enter");
  await expect(page.getByTestId("project-tab")).toContainText("draft two");

  // A part's words, as a share of the longest part.
  await expect(page.getByTestId("project-part-part one")).toBeVisible();
  await expect(page.getByTestId("project-statuses")).toContainText("drafting");
});

test("any folder becomes a Project, with what is already inside it", async ({ page }) => {
  await page
    .getByTestId("folio-tree")
    .getByText("journal", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Make this a Project" }).click();

  await expect(page.getByTestId("binder")).toBeVisible();
  await expect(page.getByTestId("project-tab")).toContainText("journal");
  await expect(page.getByTestId("binder-2026-09-09.md")).toBeVisible();
  await expect(page.getByTestId("overview-project-journal")).toHaveCount(0); // the screen is up
});

test("Split at Cursor puts the rest of the note in a document of its own", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");

  // The caret at the top of "## Three properties": everything from there is the new document.
  // The editor focuses itself a frame after mounting, so wait for that before clicking into it.
  await waitForEditor(page);
  await page.getByTestId("note-editor").locator("h2").first().click();
  // ProseMirror adopts a clicked caret asynchronously, so Home is pressed until it lands.
  await expect
    .poll(
      async () => {
        await page.keyboard.press(LINE_START);
        return caretAtStartOf(page, "Three properties");
      },
      { message: "caret at the heading" },
    )
    .toBe(true);
  await page.keyboard.press(`${mod}+Shift+K`);

  // The new document is named after the heading it begins with, and is the one you are in.
  await expect(page.getByRole("tab", { selected: true })).toContainText("Three properties");
  const notes = await mockNotes(page);
  expect(notes["Thesis/chapters/Three properties.md"]).toContain("## Three properties");
  expect(notes["Thesis/chapters/03 Influence networks.md"]).not.toContain("Three properties");
  // The half that moved is on disk before the half it came from is shortened.
  expect(notes["Thesis/chapters/03 Influence networks.md"]).toContain("# Influence networks");
});
