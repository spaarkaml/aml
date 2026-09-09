import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const NOTE = "Thesis/chapters/03 Influence networks.md";

async function openNote(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters").click();
  await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
  await page.getByTestId("note-editor").locator("h1").waitFor();
}

async function written(page: Page) {
  return page.evaluate((p) => {
    const m = (window as unknown as { __amlMockNotes: Map<string, { text: string }> })
      .__amlMockNotes;
    return m.get(p)?.text ?? null;
  }, NOTE);
}

async function runCommand(page: Page, title: string) {
  await page.keyboard.press(`${mod}+K`);
  await page.getByTestId("palette-input").fill(title);
  await page.keyboard.press("Enter");
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const html = await page
      .getByTestId("note-editor")
      .locator(".ProseMirror")
      .innerHTML()
      .catch(() => "<no editor>");
    process.stdout.write(`[editor html on failure] ${html.replace(/\n/g, " ").slice(0, 1500)}\n`);
  }
});

test("properties panel edits front matter and the saved YAML follows", async ({ page }) => {
  await openNote(page);
  await page.keyboard.press(`${mod}+Shift+I`);
  const panel = page.getByTestId("properties-panel");
  await expect(panel.getByLabel("type", { exact: true })).toHaveValue("chapter");
  await panel.getByLabel("status", { exact: true }).fill("final");
  await panel.getByLabel("status", { exact: true }).press("Enter");
  await expect(page.getByTestId("note-editor").locator(".aml-front-matter")).toContainText(
    "2 fields",
  );
  await panel.getByLabel("New property name").fill("target_words");
  await panel.getByRole("button", { name: "Add" }).click();
  await panel.getByLabel("target_words", { exact: true }).fill("4000");
  await panel.getByLabel("target_words", { exact: true }).press("Enter");
  await expect(page.getByTestId("note-editor").locator(".aml-front-matter")).toContainText(
    "3 fields",
  );
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  const md = await written(page);
  expect(md, md ?? "").toMatch(/^---\ntype: chapter\nstatus: final\ntarget_words: 4000\n---\n/);
});

test("insert table from the palette, edit it with the table menu, save canonical markdown", async ({
  page,
}) => {
  await openNote(page);
  const editor = page.getByTestId("note-editor");
  const h1 = editor.locator("h1");
  const box = (await h1.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await runCommand(page, "insert table");
  await expect(editor.locator("table")).toHaveCount(1);
  await expect(page.getByTestId("table-menu")).toBeVisible();
  await editor.locator("th").first().click();
  await page.keyboard.type("Head");
  await expect(editor.locator("th").first()).toHaveText("Head");
  await page.getByTestId("table-menu").getByRole("button", { name: "Row ↓" }).click();
  await expect(editor.locator("table tr")).toHaveCount(4);
  await expect(page.getByTestId("save-state")).toHaveText("● Unsaved");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  const md = await written(page);
  expect(md).toContain("| Head |");
  expect(md).toMatch(/\| -+ \|/);
});

test("insert footnote adds a reference and a definition", async ({ page }) => {
  await openNote(page);
  const editor = page.getByTestId("note-editor");
  const h1 = editor.locator("h1");
  const box = (await h1.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);
  await runCommand(page, "insert footnote");
  await expect(editor.locator(".aml-footnote-ref")).toHaveText("1");
  await expect(editor.locator(".aml-footnote-def")).toHaveCount(1);
  await page.keyboard.type("The source.");
  await expect(editor.locator(".aml-footnote-def")).toContainText("The source.");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  const md = await written(page);
  expect(md).toContain("# Influence networks[^1]");
  expect(md).toContain("[^1]: The source.");
});
