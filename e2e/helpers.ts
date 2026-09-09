import { expect, type Page } from "@playwright/test";

/**
 * Puts the caret at the end of the first element matching `selector` inside the editor.
 * ProseMirror adopts a mouse-placed caret asynchronously (on `selectionchange`), so this
 * waits until its own selection sits at the end of that block before returning; pressing
 * keys earlier races the sync and lands them at the block start.
 */
export async function clickEndOf(page: Page, selector: string): Promise<void> {
  const el = page.getByTestId("note-editor").locator(selector).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.press("End");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const e = (
            window as unknown as {
              __amlEditor?: {
                state: {
                  selection: {
                    $from: { parentOffset: number; parent: { content: { size: number } } };
                  };
                };
              };
            }
          ).__amlEditor;
          if (!e) return false;
          const { $from } = e.state.selection;
          return $from.parentOffset === $from.parent.content.size;
        }),
      { message: "caret at end of block" },
    )
    .toBe(true);
}

/** Waits for the editor to have focused itself after mounting (one frame after render). */
export async function waitForEditor(page: Page): Promise<void> {
  await expect(page.getByTestId("note-editor").locator(".ProseMirror")).toBeFocused();
}
