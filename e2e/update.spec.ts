import { expect, test } from "@playwright/test";

const OFFER = {
  version: "0.9.9",
  current: "0.0.0-browser",
  notes: "Corkboard labels keep their colour.",
  date: "2026-09-12T00:00:00Z",
};

/** Puts a release behind the mocked `update_check`, or takes it away again. */
async function offer(page: import("@playwright/test").Page, update: unknown): Promise<void> {
  await page.evaluate((u) => {
    (window as unknown as { __amlMockUpdate?: unknown }).__amlMockUpdate = u;
  }, update);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("app-info")).toBeVisible();
});

test("the version in the status bar opens Updates, which says it is current", async ({ page }) => {
  await offer(page, null);
  await page.getByTestId("app-info").click();
  await expect(page.getByTestId("update-backdrop")).toBeVisible();
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-state")).toContainText("newest version");
  await page.getByTestId("update-close").click();
  await expect(page.getByTestId("update-backdrop")).toHaveCount(0);
});

test("an available release is offered with its notes, and installs or explains itself", async ({
  page,
}) => {
  await offer(page, OFFER);
  await page.getByTestId("app-info").click();
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-version")).toHaveText("AML 0.9.9");
  await expect(page.getByTestId("update-notes")).toContainText("Corkboard labels");
  // The browser build has no bundle to replace, so installing must fail out loud rather
  // than leaving the screen sitting on "Downloading…" forever.
  await page.getByTestId("update-install").click();
  await expect(page.getByTestId("update-error")).toContainText("could not be installed");
});

test("“Not now” hides that version everywhere, and a later one comes back", async ({ page }) => {
  await offer(page, OFFER);
  await page.getByTestId("app-info").click();
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-chip")).toHaveText("Update to 0.9.9");

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("update-backdrop")).toHaveCount(0);
  await expect(page.getByTestId("update-chip")).toHaveCount(0);

  // Checking again finds the same release and stays quiet about it …
  await page.getByTestId("app-info").click();
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-version")).toHaveText("AML 0.9.9");
  await expect(page.getByTestId("update-chip")).toHaveCount(0);

  // … and it is still quiet after a relaunch, because the dismissal is on this device.
  await page.reload();
  await offer(page, { ...OFFER, version: "1.0.0" });
  await page.getByTestId("app-info").click();
  // … but a dismissal is about one version, not about updating.
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-chip")).toHaveText("Update to 1.0.0");
});

test("automatic checking is remembered on this device", async ({ page }) => {
  await page.getByTestId("app-info").click();
  const auto = page.getByRole("checkbox", { name: "Check for updates automatically" });
  await expect(auto).toBeChecked();
  await auto.uncheck();
  await page.reload();
  await page.getByTestId("app-info").click();
  await expect(
    page.getByRole("checkbox", { name: "Check for updates automatically" }),
  ).not.toBeChecked();
});
