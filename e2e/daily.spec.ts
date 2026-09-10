import { expect, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Today as the app sees it: the device's own day, computed the same way the panel does. */
function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    heading: `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
  await page.getByTestId("left-view-daily").click();
});

test("the calendar strip starts today's Daily from the template and marks the day", async ({
  page,
}) => {
  const { iso, heading } = today();
  await expect(page.getByTestId("daily-label")).toHaveText("This week");
  await expect(page.getByTestId(`day-${iso}`)).toHaveAttribute("aria-current", "date");
  await expect(page.getByTestId(`day-${iso}`)).not.toHaveAttribute("data-has", "");
  // The Folio already has one Daily, written on a fixed date in the mock.
  await expect(page.getByTestId("daily-recent")).toContainText("9 September 2026");

  await page.getByTestId("daily-today").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText(iso);
  // The template's {{date:dddd D MMMM YYYY}} placeholder was expanded on the way in.
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText(heading);
  await expect(page.getByTestId("note-editor")).toContainText("Yesterday:");
  await expect(page.getByTestId(`day-${iso}`)).toHaveAttribute("data-has", "");
  await expect(page.getByTestId("daily-today")).toHaveText("Open today");

  // Asking again opens the same note rather than writing over it.
  await page.getByTestId("note-editor").locator("h1").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" — kept");
  await page.keyboard.press(`${mod}+Shift+d`);
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText(`${heading} — kept`);
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("the strip pages by week and templates are palette commands", async ({ page }) => {
  await page.getByTestId("daily-prev").click();
  await expect(page.getByTestId("daily-label")).toHaveText("Last week");
  await page.getByTestId("daily-next").click();
  await page.getByTestId("daily-next").click();
  await expect(page.getByTestId("daily-label")).toHaveText("Next week");

  await page.keyboard.press(`${mod}+k`);
  await page.getByTestId("palette-input").fill("New Scene");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Scene");
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Scene");
  await expect(page.getByTestId("note-editor")).toContainText("Written ");
});
