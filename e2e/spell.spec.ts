import { expect, test } from "@playwright/test";
import { clickEndOf, waitForEditor } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await waitForEditor(page);
});

test("misspelled words are underlined; a suggestion replaces the word", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.type(" I recieve teh mail.", { delay: 15 });
  const bad = editor.locator(".aml-misspelled");
  await expect(bad).toHaveCount(2);
  await expect(bad.first()).toHaveText("recieve");
  await bad.filter({ hasText: "teh" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "the", exact: true }).click();
  await expect(editor.locator("p").first()).toHaveText("Quick thoughts. I recieve the mail.");
  await expect(bad).toHaveCount(1);
});

test("add to dictionary clears the underline; the toggle turns checking off", async ({ page }) => {
  const editor = page.getByTestId("note-editor");
  await clickEndOf(page, "p");
  await page.keyboard.type(" The color scheme.", { delay: 15 });
  const bad = editor.locator(".aml-misspelled");
  await expect(bad).toHaveText(["color"]);
  await bad.first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "colour" })).toBeVisible();
  await page.getByRole("menuitem", { name: /Add .*color.* to dictionary/ }).click();
  await expect(bad).toHaveCount(0);
  await page.keyboard.type(" teh", { delay: 15 });
  await expect(bad).toHaveCount(1);
  await page.getByTestId("spell-toggle").click();
  await expect(bad).toHaveCount(0);
  await expect(page.getByTestId("spell-toggle")).toHaveText("en-AU off");
});
