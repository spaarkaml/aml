import { expect, test } from "@playwright/test";

const NAS_ID = "NNNNNNN-OOOOOOO-PPPPPPP-QQQQQQQ-RRRRRRR-SSSSSSS-TTTTTTT-UUUUUUU";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("pairing: turn on, add the NAS, accept its folder, open it as a Folio", async ({ page }) => {
  await page.getByTestId("welcome-sync").click();
  const screen = page.getByTestId("sync-screen");
  await expect(screen.getByTestId("sync-engine-state")).toHaveText("Off");
  await screen.getByTestId("sync-enable").click();
  await expect(screen.getByTestId("sync-engine-state")).toContainText("Running");
  await expect(screen.getByTestId("my-device-id")).toContainText("AAAAAAA-BBBBBBB");

  await screen.getByTestId("nas-device-id").fill("too-short");
  await screen.getByTestId("nas-add").click();
  await expect(screen.getByRole("alert")).toContainText("Device ID");

  await screen.getByTestId("nas-device-id").fill(NAS_ID);
  await screen.getByTestId("nas-address").fill("192.168.1.20");
  await screen.getByTestId("nas-add").click();
  await expect(screen.getByTestId("nas-state")).toContainText("connected");
  await expect(screen.getByTestId("pending-folders")).toContainText("Folio");

  await screen.getByRole("button", { name: /Accept/ }).click();
  await expect(screen.getByTestId("synced-folders")).toContainText("/mock/Writing");
  await screen.getByRole("button", { name: "Open as Folio" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await expect(page.getByTestId("sync-state")).toHaveText("NAS · up to date");
});

test("an open Folio can be shared with the NAS; status bar shows progress", async ({ page }) => {
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await expect(page.getByTestId("sync-state")).toHaveCount(0);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByTestId("palette-input").fill("nas sync");
  await page.keyboard.press("Enter");
  const screen = page.getByTestId("sync-screen");
  await screen.getByTestId("sync-enable").click();
  await screen.getByTestId("nas-device-id").fill(NAS_ID);
  await screen.getByTestId("nas-add").click();
  await screen.getByTestId("share-folio").click();
  await expect(screen.getByTestId("synced-folders")).toContainText("Writing");
  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  await expect(page.getByTestId("sync-state")).toHaveText("Syncing 42%");
});
