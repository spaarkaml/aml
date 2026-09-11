/**
 * Refreshes docs/qa/screens/ from the dev server, so the QA scripts and the CHANGELOG show
 * what the app actually looks like rather than what it looked like three stages ago.
 *
 *   pnpm dev            # in one terminal
 *   node scripts/screens.mjs
 *
 * Uses the same browser and the same dev mocks as the e2e suite, at a fixed 1440×900, so two
 * runs of it differ only where the app does.
 */

/* biome-ignore-all lint/suspicious/noConsole: build script talks through stdout */
import { chromium } from "@playwright/test";

const URL = "http://localhost:1420";
const DIR = "docs/qa/screens";
const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openFolio(page) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("breadcrumb").waitFor();
}

async function shoot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  console.log(`${DIR}/${name}.png`);
}

for (const mode of ["paper", "ink"]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: mode === "ink" ? "dark" : "light",
    deviceScaleFactor: 2,
  });

  await page.goto(URL);
  await shoot(page, `stage-3-welcome-${mode}`);

  await openFolio(page);
  await shoot(page, `stage-3-overview-${mode}`);

  await page.getByTestId("folio-tree").getByText("2026-09-09", { exact: true }).click();
  await page.getByTestId("note-editor").waitFor();
  await shoot(page, `stage-3-editor-${mode}`);

  await page.keyboard.press(`${MOD}+Comma`);
  await page.getByTestId("tokens").waitFor();
  await shoot(page, `stage-3-appearance-${mode}`);

  await browser.close();
}
