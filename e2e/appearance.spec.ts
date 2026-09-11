import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const token = (page: Page, name: string) =>
  page.evaluate(
    (t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim(),
    `--aml-${name}`,
  );

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await page.keyboard.press(`${mod}+,`);
  await expect(page.getByTestId("tokens")).toBeVisible();
});

test("a colour is previewed as it changes, saved to the Folio, and resettable", async ({
  page,
}) => {
  await page.getByTestId("appearance-where").filter({ hasText: "Writing" }).waitFor();
  await page.getByTestId("mode-ink").click();
  await page.getByTestId("edit-ink").click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "ink");

  // Editing a token paints it immediately…
  await page.getByTestId("colour-ink-bg").fill("#101820");
  expect(await token(page, "bg")).toBe("#101820");

  // …and is written to the Folio, so it is still there after a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  expect(await token(page, "bg")).toBe("#101820");

  // Reset puts AML's own colour back by removing the override entirely.
  await page.keyboard.press(`${mod}+,`);
  await page.getByTestId("edit-ink").click();
  await page.getByTestId("reset-ink-bg").click();
  // Removing the override lets tokens.css win again — ADR-010's own Ink background.
  expect(await token(page, "bg")).toBe("#17262b");
});

test("contrast is scored as you edit, and a poor choice is called out", async ({ page }) => {
  await page.getByTestId("edit-paper").click();
  await expect(page.getByTestId("contrast-paper-text")).toContainText("AAA");

  await page.getByTestId("colour-paper-text").fill("#cfcfcf");
  await expect(page.getByTestId("contrast-paper-text")).toContainText("too low");
});

test("type settings apply to the page and the device override keeps them local", async ({
  page,
}) => {
  await page.getByTestId("measure").fill("55");
  expect(await token(page, "measure")).toBe("55ch");
  await page.getByTestId("editor-font").selectOption("Literata");
  expect(await token(page, "font-editor")).toContain("Literata");

  // With the override on, edits stop going to the Folio and stay on this machine.
  await page.getByTestId("use-device").check();
  await expect(page.getByTestId("appearance-where")).toContainText("this device only");
  await page.getByTestId("measure").fill("90");
  expect(await token(page, "measure")).toBe("90ch");

  await page.getByTestId("use-device").uncheck();
  // The Folio's own setting is untouched by what the device chose.
  expect(await token(page, "measure")).toBe("55ch");
});
