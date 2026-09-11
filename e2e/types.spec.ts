import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

async function openChapter(page: import("@playwright/test").Page) {
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("03 Influence networks");
}

test("a note's type is picked from the ones the Folio knows, and its own fields offered", async ({
  page,
}) => {
  await openChapter(page);
  await page.keyboard.press(`${mod}+Shift+i`);

  // The type came from the note's own front matter, and the picker found it in the registry.
  await expect(page.getByTestId("type-select")).toHaveValue("chapter");
  await expect(page.getByTestId("type-row").getByTestId("type-badge-chapter")).toBeVisible();

  // `pov` is declared by the Chapter template and missing here, so it is offered.
  await page.getByTestId("type-field-pov").click();
  await expect(page.getByTestId("properties-panel")).toContainText("pov");
  // Nothing left to offer once it is there.
  await expect(page.getByTestId("type-fields")).toHaveCount(0);

  // Changing the type rewrites the note's own `type:` — it is front matter, not a database.
  await page.getByTestId("type-select").selectOption("scene");
  await expect(page.getByTestId("type-row").getByTestId("type-badge-scene")).toBeVisible();
  await page.keyboard.press(`${mod}+s`);
  await page.getByTestId("properties-raw").click();
  await expect(page.getByLabel("Front matter YAML")).toHaveValue(/type: scene/);
});

test("a note with no type is left that way, and one can be given", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("Inbox").click();
  await page.keyboard.press(`${mod}+Shift+i`);
  // An untyped note is the ordinary case: no badge, and the picker says so.
  await expect(page.getByTestId("type-select")).toHaveValue("");
  await expect(page.getByTestId("type-fields")).toHaveCount(0);

  await page.getByTestId("type-select").selectOption("daily");
  await expect(page.getByTestId("type-row").getByTestId("type-badge-daily")).toBeVisible();
  // Choosing "No type" takes the property back out rather than writing an empty one.
  await page.getByTestId("type-select").selectOption("");
  await page.getByTestId("properties-raw").click();
  await expect(page.getByLabel("Front matter YAML")).toHaveValue("");
});

test("Settings lists every type with its notes, and a colour or icon sticks", async ({ page }) => {
  await page.keyboard.press(`${mod}+,`);
  const chapter = page.getByTestId("type-chapter");
  // Found from the template that declares it and the note that carries it.
  await expect(chapter).toContainText("Chapter");
  await expect(chapter).toContainText("New Chapter Note");
  await expect(chapter).toContainText("status, pov");
  await expect(chapter).toContainText("1 note");

  await page.getByTestId("type-icon-chapter").fill("📖");
  await expect(chapter.getByTestId("type-badge-chapter")).toContainText("📖");
  // The list moves with the field; the file is written once the typing stops.
  await page.waitForTimeout(500);

  // The icon is saved in the Folio, so it is still there next launch — and it reaches the
  // Browser, where it stands in for the page icon.
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await expect(page.getByTestId("folio-tree").getByTestId("type-badge-chapter")).toContainText(
    "📖",
  );
});
