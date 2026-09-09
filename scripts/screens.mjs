import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:1420");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText("Hello Folio.").waitFor();
const btn = page.getByTitle(/Appearance/);
await btn.click(); // Paper
await page.keyboard.press("Meta+Shift+I");
await page.getByTestId("panel-right").getByRole("button", { name: "Pin" }).click();
await page.screenshot({ path: "docs/qa/screens/stage-0-paper-desk.png" });
await page.keyboard.press("Meta+K");
await page.getByTestId("palette-input").fill("tog");
await page.screenshot({ path: "docs/qa/screens/stage-0-paper-palette.png" });
await page.keyboard.press("Escape");
await btn.click(); // Ink
await page.screenshot({ path: "docs/qa/screens/stage-0-ink-desk.png" });
await browser.close();
