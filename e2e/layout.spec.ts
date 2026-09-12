import { expect, type Page, test } from "@playwright/test";

const ROOT = "/mock/Writing";

/** Opens the mock Folio and waits for the shell to settle. */
async function openFolio(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("tab-strip")).toBeVisible();
}

/** Widths of the parts of the shell that a layout bug shows up in. */
function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const { left, right, width } = el.getBoundingClientRect();
      return { left: Math.round(left), right: Math.round(right), width: Math.round(width) };
    };
    return {
      window: window.innerWidth,
      page: box(document.querySelector("main")),
      left: box(document.querySelector('[data-testid="panel-left"]')),
      right: box(document.querySelector('[data-testid="panel-right"]')),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("the page stays inside the window however many notes are open", async ({ page }) => {
  // Enough tabs that their minimum widths add up to more than the window: the shape of the
  // bug was that the shell grew to fit them and the centred text drifted right with it.
  await page.evaluate((root) => {
    const tabs = Array.from({ length: 16 }, (_, i) => `Thesis/chapters/Chapter ${i + 1}.md`);
    localStorage.setItem(
      "aml.tabs",
      JSON.stringify({
        state: { byFolio: { [root]: { tabs, active: tabs[0], recents: [] } } },
        version: 1,
      }),
    );
  }, ROOT);
  await page.reload();
  await openFolio(page);

  const g = await geometry(page);
  expect(g.page?.right).toBeLessThanOrEqual(g.window);
  expect(g.page?.left).toBeGreaterThanOrEqual(0);
  // The strip is what gives instead: it scrolls rather than pushing the window wider.
  const scrolls = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tab-strip"]') as HTMLElement;
    return el.scrollWidth > el.clientWidth;
  });
  expect(scrolls).toBe(true);
});

test("a pinned panel is the same floating card, and the page makes room for it", async ({
  page,
}) => {
  await page.reload();
  await openFolio(page);
  const panel = page.getByTestId("panel-left");
  await expect(panel).toHaveAttribute("data-pinned", "true");

  const pinned = await geometry(page);
  // Floating, not welded to the window: it is inset on its own side …
  expect(pinned.left?.left).toBeGreaterThan(0);
  // … and nothing is ever read underneath it.
  expect(pinned.page?.left).toBeGreaterThanOrEqual(pinned.left?.right ?? 0);

  await page.getByRole("button", { name: "Pinned" }).click();
  await expect(panel).toHaveAttribute("data-pinned", "false");

  const floating = await geometry(page);
  expect(floating.page?.left).toBe(0);
  // Unpinning changes nothing about the panel itself — only that the page no longer moves.
  // A pixel of rounding is not the panel being redrawn; a panel that changed shape would
  // move by its own width.
  expect(Math.abs((floating.left?.left ?? 0) - (pinned.left?.left ?? 0))).toBeLessThan(2);
  expect(Math.abs((floating.left?.width ?? 0) - (pinned.left?.width ?? 0))).toBeLessThan(2);
});
