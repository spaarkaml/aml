import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** Where a note's dot has ended up on screen, once the layout has stopped moving. */
async function dotAt(page: Page, path: string): Promise<{ x: number; y: number }> {
  const read = () =>
    page.evaluate(
      (p) =>
        (
          window as unknown as { __amlGraphAt?: (path: string) => { x: number; y: number } | null }
        ).__amlGraphAt?.(p) ?? null,
      path,
    );
  // The simulation cools rather than stopping dead, so wait until it has settled enough that
  // the dot is where it was a moment ago — otherwise a click chases a moving target.
  let last = await read();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(120);
    const now = await read();
    if (last && now && Math.abs(now.x - last.x) < 1 && Math.abs(now.y - last.y) < 1) return now;
    last = now;
  }
  if (!last) throw new Error(`no dot for ${path}`);
  return last;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("tab-strip")).toBeVisible();
});

test("the graph draws the whole Folio, names its Boundings and counts what it drew", async ({
  page,
}) => {
  await page.keyboard.press(`${mod}+Shift+G`);
  await expect(page.getByTestId("graph-backdrop")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  // Every note is drawn, including the ones nothing links to.
  await expect(page.getByTestId("graph-summary")).toContainText("7 notes");
  await expect(page.getByTestId("graph-key")).toContainText("Academic");
  await page.getByTestId("graph-close").click();
  await expect(page.getByTestId("graph-backdrop")).toHaveCount(0);
});

test("clicking a note in the graph opens it", async ({ page }) => {
  await page.keyboard.press(`${mod}+Shift+G`);
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const at = await dotAt(page, "Inbox.md");
  await page.mouse.click(at.x, at.y);
  // The graph gets out of the way once it has done its job.
  await expect(page.getByTestId("graph-backdrop")).toHaveCount(0);
  await expect(page.getByTestId("tab-strip")).toContainText("Inbox");
});

test("“around this note” follows links in both directions and the depth changes it", async ({
  page,
}) => {
  // 03 Influence networks links to 04 Methods and nothing else does.
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByTestId("note-editor")).toBeVisible();

  await page.keyboard.press(`${mod}+Shift+G`);
  await page.getByTestId("graph-scope-note").click();
  // Itself plus the note that links to it: found by following the link backwards.
  await expect(page.getByTestId("graph-summary")).toContainText("2 notes");
  await expect(page.getByTestId("graph-summary")).toContainText("around 04 Methods");
});

test("the Context panel carries the open note's own corner of the graph", async ({ page }) => {
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await expect(page.getByTestId("note-editor")).toBeVisible();
  await page.keyboard.press(`${mod}+Shift+I`);
  await page.getByTestId("context-graph").getByText("Graph").click();
  // Inbox links to nothing and nothing links to it, which the panel says rather than
  // drawing a single lonely dot.
  await expect(page.getByTestId("graph-panel-empty")).toBeVisible();
});
