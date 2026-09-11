import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

test("Settings sends new Daily notes to the folder you name, and keeps it after a reload", async ({
  page,
}) => {
  await page.keyboard.press(`${mod}+,`);
  await expect(page.getByTestId("daily-folder")).toBeVisible();
  // Empty means AML's own; the placeholder says which that is.
  await expect(page.getByTestId("daily-folder")).toHaveValue("");
  await expect(page.getByTestId("daily-folder")).toHaveAttribute("placeholder", "journal");
  await expect(page.getByTestId("daily-example")).toContainText("journal/");

  await page.getByTestId("daily-folder").fill("Notes/Days");
  await page.getByTestId("settings-close").click();

  await page.getByTestId("daily-today").click();
  // The note landed in the folder Settings named, year folder and all.
  await expect(page.getByTestId("breadcrumb")).toHaveText(
    /^Writing\s*Notes\s*Days\s*\d{4}\s*\d{4}-\d{2}-\d{2}$/,
  );

  // Settings live in the Folio, so they are still there next launch.
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.keyboard.press(`${mod}+,`);
  await expect(page.getByTestId("daily-folder")).toHaveValue("Notes/Days");
});

test("a folder that would leave the Folio is refused, and said so", async ({ page }) => {
  await page.keyboard.press(`${mod}+,`);
  await page.getByTestId("daily-folder").fill("../elsewhere");
  await page.getByTestId("daily-folder").press("Enter");
  await expect(page.getByTestId("settings-error")).toContainText("not a folder inside the Folio");
  // The typed value stays on screen to be corrected rather than being silently replaced.
  await expect(page.getByTestId("daily-folder")).toHaveValue("../elsewhere");

  await page.getByTestId("daily-folder").fill("Days");
  await page.getByTestId("daily-folder").press("Enter");
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect(page.getByTestId("settings-error")).toHaveCount(0);
});

test("Settings opens from the toolbar and hands off to Appearance", async ({ page }) => {
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-where")).toContainText("Writing");
  await page.getByTestId("settings-appearance").click();
  await expect(page.getByTestId("tokens")).toBeVisible();
  await expect(page.getByTestId("daily-folder")).toHaveCount(0);
});
