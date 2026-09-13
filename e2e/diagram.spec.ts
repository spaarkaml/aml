import { expect, type Page, test } from "@playwright/test";

/** Where a shape is on screen, so a drag can start on one of its handles. */
async function shapeAt(page: Page, id: string) {
  const box = await page.evaluate(
    (n) =>
      (
        window as unknown as {
          __amlDiagramAt?: (id: string) => { x: number; y: number; w: number; h: number } | null;
        }
      ).__amlDiagramAt?.(n) ?? null,
    id,
  );
  if (!box) throw new Error(`no shape ${id}`);
  return box;
}

async function openNote(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Methods");
}

/** Right-click in the prose, which is how a diagram is started (WP-7.1). */
async function rightClickEditor(page: Page): Promise<void> {
  const box = await page.getByTestId("note-editor").locator("p").first().boundingBox();
  if (!box) throw new Error("no paragraph");
  await page.mouse.click(box.x + 8, box.y + box.height / 2, { button: "right" });
}

test("a diagram is drawn from the right-click menu and inserted into the note", async ({
  page,
}) => {
  await openNote(page);
  await rightClickEditor(page);
  await page.getByRole("menuitem", { name: "Insert diagram" }).click();
  await expect(page.getByTestId("diagram-backdrop")).toBeVisible();

  const stage = page.getByTestId("diagram-stage");
  const area = await stage.boundingBox();
  if (!area) throw new Error("no stage");

  // Place a person on the left and an event on the right.
  await page.getByTestId("diagram-tool-person").click();
  await page.mouse.click(area.x + area.width * 0.3, area.y + area.height * 0.45);
  await page.getByTestId("diagram-tool-event").click();
  await page.mouse.click(area.x + area.width * 0.7, area.y + area.height * 0.45);
  await expect(page.getByTestId("diagram-backdrop")).toContainText("2 shapes");

  // Join them: select the first, then drag from its east handle onto the second.
  const person = await shapeAt(page, "n1");
  await page.mouse.click(person.x + person.w / 2, person.y + person.h / 2);
  const handle = { x: person.x + person.w, y: person.y + person.h / 2 };
  const event = await shapeAt(page, "n2");
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(event.x + event.w / 2, event.y + event.h / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("diagram-backdrop")).toContainText("1 link");

  // The link's meaning is chosen, not inferred: this one suppresses rather than causes.
  await page.locator("#diagram-edge-kind").selectOption("inhibits");

  await page.getByTestId("diagram-save").click();
  await expect(page.getByTestId("diagram-backdrop")).toHaveCount(0);

  // What lands in the note is an ordinary image, so the note stays plain markdown.
  const image = page.getByTestId("note-editor").locator("img.aml-image");
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("data-src", /assets\/.*\.svg$/);
});

test("a diagram in a note can be opened again and still knows what it means", async ({ page }) => {
  await openNote(page);
  await rightClickEditor(page);
  await page.getByRole("menuitem", { name: "Insert diagram" }).click();

  const stage = page.getByTestId("diagram-stage");
  const area = await stage.boundingBox();
  if (!area) throw new Error("no stage");
  await page.getByTestId("diagram-tool-belief").click();
  await page.mouse.click(area.x + area.width * 0.4, area.y + area.height * 0.4);
  await page.locator("#diagram-text").fill("I will be judged");
  await page.getByTestId("diagram-save").click();
  await expect(page.getByTestId("diagram-backdrop")).toHaveCount(0);

  // Right-clicking the drawing offers to edit it, and the model comes back out of the file.
  const image = page.getByTestId("note-editor").locator("img.aml-image").first();
  await image.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit diagram" }).click();
  await expect(page.getByTestId("diagram-backdrop")).toBeVisible();
  await expect(page.getByTestId("diagram-backdrop")).toContainText("1 shape");
  await page.getByTestId("diagram-stage").click({ position: { x: 10, y: 10 } });
  const person = await shapeAt(page, "n1");
  await page.mouse.click(person.x + person.w / 2, person.y + person.h / 2);
  await expect(page.locator("#diagram-text")).toHaveValue("I will be judged");
  await expect(page.locator("#diagram-kind")).toHaveValue("belief");
});

test("shapes can be undone, and Escape leaves without touching the note", async ({ page }) => {
  await openNote(page);
  await rightClickEditor(page);
  await page.getByRole("menuitem", { name: "Insert diagram" }).click();

  const area = await page.getByTestId("diagram-stage").boundingBox();
  if (!area) throw new Error("no stage");
  await page.getByTestId("diagram-tool-person").click();
  await page.mouse.click(area.x + area.width * 0.5, area.y + area.height * 0.5);
  await expect(page.getByTestId("diagram-backdrop")).toContainText("1 shape");

  await page.keyboard.press("Meta+z");
  await expect(page.getByTestId("diagram-backdrop")).toContainText("0 shapes");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("diagram-backdrop")).toHaveCount(0);
  await expect(page.getByTestId("note-editor").locator("img.aml-image")).toHaveCount(0);
});
