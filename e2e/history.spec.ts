import { expect, type Page, test } from "@playwright/test";
import { clickEndOf } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const METHODS = "Thesis/chapters/04 Methods.md";

async function openMethods(page: Page): Promise<string> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await page.getByTestId("folio-tree").getByText("chapters", { exact: true }).click();
  await page.getByTestId("folio-tree").getByText("04 Methods", { exact: true }).click();
  await expect(page.getByTestId("note-editor").locator("h1")).toHaveText("Methods");
  return noteText(page);
}

async function noteText(page: Page): Promise<string> {
  return page.evaluate(
    (p) =>
      (window as unknown as { __amlMockNotes: Map<string, { text: string }> }).__amlMockNotes.get(p)
        ?.text ?? "",
    METHODS,
  );
}

test("the first edit keeps the note as it was, and restoring puts those exact bytes back", async ({
  page,
}) => {
  const original = await openMethods(page);
  await clickEndOf(page, "p");
  await page.keyboard.type(" A sentence written today.");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 4000 });
  expect(await noteText(page)).toContain("A sentence written today.");

  // The quiet way in: the word that says your work is safe.
  await page.getByTestId("save-state").click();
  const screen = page.getByTestId("history-screen");
  await expect(screen).toBeVisible();
  await expect(page.getByTestId("history-list").getByRole("button")).toHaveCount(1);
  await expect(page.getByTestId("history-summary")).toContainText("1 change");
  await expect(page.getByTestId("history-detail")).toContainText("A sentence written today.");

  await page.getByTestId("history-restore").click();
  await expect(screen).toHaveCount(0);
  await expect(page.getByTestId("note-editor")).not.toContainText("A sentence written today.");
  expect(await noteText(page)).toBe(original);

  // What the restore replaced is itself a snapshot, so the restore can be taken back.
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("history-list").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("history-list")).toContainText("Before restoring");
  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
});

test("Take Snapshot… keeps a labelled one; right-click opens History; Settings says how much", async ({
  page,
}) => {
  await openMethods(page);
  await page.keyboard.press(`${mod}+k`);
  await page.getByTestId("palette-input").fill("Take Snapshot");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("history-empty")).toBeVisible();
  await page.getByTestId("snapshot-label").fill("Sent to supervisor");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("history-list")).toContainText("Sent to supervisor");
  await expect(page.getByTestId("history-summary")).toHaveText("The same as the note now.");
  await expect(page.getByTestId("history-restore")).toBeDisabled();
  await page.keyboard.press("Escape");

  const box = await page.getByTestId("note-editor").locator("p").first().boundingBox();
  if (!box) throw new Error("no paragraph");
  await page.mouse.click(box.x + 8, box.y + box.height / 2, { button: "right" });
  await page.getByRole("menuitem", { name: "Note History…" }).click();
  await expect(page.getByTestId("history-list").getByRole("button")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.keyboard.press(`${mod}+,`);
  await expect(page.getByTestId("settings-snapshots")).toContainText("1 snapshot");
});
