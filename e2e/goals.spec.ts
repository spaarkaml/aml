import { expect, type Page, test } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

async function openInbox(page: Page) {
  await page.getByTestId("folio-tree").getByText("Inbox").click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");
}

/** The Context panel is a slide-over in the Desk layout, and its backdrop eats clicks on the
 *  page — so anything that types opens it after, not before. */
async function openGoals(page: Page) {
  await page.keyboard.press(`${mod}+Shift+i`);
  await expect(page.getByTestId("goals-panel")).toBeVisible();
}

test("today's tally counts what you write, not what you open", async ({ page }) => {
  await page.keyboard.press(`${mod}+,`);
  await page.getByTestId("daily-goal").fill("50");
  await page.getByTestId("settings-close").click();
  // Nothing written yet, and the ring says so rather than saying nothing.
  await expect(page.getByTestId("goal-chip")).toContainText("0 / 50");

  await openInbox(page);
  // Opening a note that already has words in it is not writing them.
  await expect(page.getByTestId("goal-chip")).toContainText("0 / 50");

  await page.getByTestId("note-editor").getByText("Quick thoughts.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" one two three four five");
  await expect(page.getByTestId("goal-chip")).toContainText("5 / 50");

  // Deleting is not writing either, so the tally goes back down.
  for (let i = 0; i < 10; i++) await page.keyboard.press("Backspace");
  await expect(page.getByTestId("goal-chip")).toContainText("3 / 50");
  await openGoals(page);
  await expect(page.getByTestId("goals-today-count")).toHaveText("3 of 50");

  // It is this device's tally, so it survives a reload — the goal came from the Folio.
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await expect(page.getByTestId("goal-chip")).toContainText("3 / 50");
});

test("a note's target is one of its properties, and the deadline gives a pace", async ({
  page,
}) => {
  await openInbox(page);
  await openGoals(page);
  // No target yet: nothing but the field that sets one.
  await expect(page.getByTestId("goals-note-count")).toHaveCount(0);
  await expect(page.getByTestId("goal-deadline")).toHaveCount(0);

  await page.getByTestId("goal-target").fill("100");
  await page.getByTestId("goal-target").press("Enter");
  await expect(page.getByTestId("goals-note-count")).toHaveText("2 of 100 words");
  // It is front matter, and the Properties panel shows it as the ordinary property it is.
  await expect(page.getByTestId("properties-panel")).toContainText("target_words");

  // A deadline turns what is left into words a day. Tomorrow leaves today and tomorrow.
  // The app's day is the device's, not UTC's — a deadline built in UTC can land on today.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const tomorrow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  await page.getByTestId("goal-deadline").fill(tomorrow);
  await expect(page.getByTestId("goals-pace")).toHaveText("49 words a day for 2 days");

  // Clearing the target takes the property out rather than writing a zero.
  await page.getByTestId("goal-target").fill("");
  await page.getByTestId("goal-target").press("Enter");
  await expect(page.getByTestId("goals-note-count")).toHaveCount(0);
  await expect(page.getByTestId("properties-panel")).not.toContainText("target_words");
});

test("no daily goal is the default, and says where to set one", async ({ page }) => {
  await openInbox(page);
  await openGoals(page);
  await expect(page.getByTestId("goal-chip")).toHaveCount(0);
  await expect(page.getByTestId("goals-no-daily")).toContainText("No daily goal");

  await page.getByTestId("goals-no-daily").getByRole("button").click();
  await expect(page.getByTestId("daily-goal")).toBeVisible();
});
