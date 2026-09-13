import { expect, type Page, test } from "@playwright/test";

const COPY = "Thesis/chapters/04 Methods.sync-conflict-20260913-101112-ZZZ9ZZZ.md";

/** Pretends Syncthing set aside an older edit of 04 Methods that added a closing paragraph. */
async function seedConflict(page: Page): Promise<{ original: string; path: string }> {
  return page.evaluate((copyPath) => {
    const w = window as unknown as {
      __amlMockNotes: Map<string, { text: string }>;
      __amlMockConflicts: unknown[];
    };
    const path = [...w.__amlMockNotes.keys()].find((k) => k.endsWith("04 Methods.md")) ?? "";
    const original = w.__amlMockNotes.get(path)?.text ?? "";
    w.__amlMockConflicts.push({
      conflict: {
        path: copyPath,
        original: path,
        originalExists: true,
        kind: "note",
        stamp: "2026-09-13 10:11:12",
        device: "ZZZ9ZZZ",
        mtime: Date.now(),
        originalMtime: 1,
      },
      originalText: original,
      copyText: `${original.trimEnd()}\n\nWritten on the other computer.\n`,
    });
    return { original, path };
  }, COPY);
}

async function noteText(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (p) =>
      (window as unknown as { __amlMockNotes: Map<string, { text: string }> }).__amlMockNotes.get(p)
        ?.text ?? "",
    path,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("a copy sync set aside is a conflict to resolve, not a note in the Browser", async ({
  page,
}) => {
  const { original, path } = await seedConflict(page);
  await page.getByRole("button", { name: "Open Folio…" }).click();

  const chip = page.getByTestId("conflicts-chip");
  await expect(chip).toHaveText("1 conflict");
  await chip.click();

  const screen = page.getByTestId("conflicts-screen");
  await screen.getByRole("button", { name: /04 Methods/ }).click();
  await expect(page.getByTestId("conflict-summary")).toContainText("set aside");
  await expect(page.getByTestId("conflict-compare")).toContainText(
    "Written on the other computer.",
  );

  // Keep both sides of every difference, then save: nothing either computer wrote is lost.
  await screen.locator("[class*=bulk]").getByRole("button", { name: "Both" }).click();
  await page.getByTestId("conflict-save").click();

  await expect(page.getByTestId("conflicts-empty")).toBeVisible();
  await expect(chip).toHaveCount(0);
  const merged = await noteText(page, path);
  expect(merged).toContain(original.trim().split("\n").pop() ?? "");
  expect(merged).toContain("Written on the other computer.");
});

test("keeping what is in place leaves the note exactly as it was", async ({ page }) => {
  const { original, path } = await seedConflict(page);
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("conflicts-chip").click();
  await page
    .getByTestId("conflicts-screen")
    .getByRole("button", { name: /04 Methods/ })
    .click();
  await page.getByRole("button", { name: "Keep in place" }).click();

  await expect(page.getByTestId("conflicts-empty")).toBeVisible();
  expect(await noteText(page, path)).toBe(original);
});

test("a note with a copy set aside says so, and Compare opens it", async ({ page }) => {
  await seedConflict(page);
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();

  const banner = page.getByTestId("note-conflict-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByTestId("conflict-compare")).toBeVisible();
  // Escape steps back to the list before it closes, so a stray key does not lose your place.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("conflicts-list")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("conflicts-screen")).toHaveCount(0);
});
