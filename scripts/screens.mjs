// Captures reference screenshots for docs/qa/screens. Needs `pnpm dev` running on :1420.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:1420");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: "Open Folio…" }).waitFor();
const mode = page.getByTitle(/Appearance/);
await mode.click(); // Paper
await page.screenshot({ path: "docs/qa/screens/stage-1-welcome.png" });
await page.getByRole("button", { name: "Open Folio…" }).click();
await page.getByTestId("folio-tree").getByText("chapters").click();
await page.getByTestId("folio-tree").getByText("03 Influence networks").click();
await page.getByTestId("note-editor").locator("h1").waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/qa/screens/stage-1-editor-paper.png" });
await mode.click(); // Ink
await page.waitForTimeout(200);
await page.screenshot({ path: "docs/qa/screens/stage-1-editor-ink.png" });
await browser.close();
