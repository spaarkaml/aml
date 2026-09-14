import { expect, type Page } from "@playwright/test";

/**
 * The keys that move the caret to the start and end of a line. On a Mac, Home and End scroll
 * the page, as they do in every Mac app, and only fall back to moving the caret when there is
 * nothing to scroll — which, with the window itself fixed in place, is no longer guaranteed.
 * ⌘← and ⌘→ are what a Mac user presses for this.
 */
export const LINE_START = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";
export const LINE_END = process.platform === "darwin" ? "Meta+ArrowRight" : "End";

/**
 * Puts the caret at the end of the first element matching `selector` inside the editor.
 * ProseMirror adopts a mouse-placed caret asynchronously (on `selectionchange`), so this
 * waits until its own selection sits at the end of that block before returning; pressing
 * keys earlier races the sync and lands them at the block start.
 */
export async function clickEndOf(page: Page, selector: string): Promise<void> {
  const el = page.getByTestId("note-editor").locator(selector).first();
  // The end of the block's *last line*: on a narrow window a paragraph wraps, and the line-end
  // key (⌘→ on a Mac) only reaches the end of the line the click landed on.
  const box = await el.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const last = rects[rects.length - 1] ?? node.getBoundingClientRect();
    return { x: last.right, y: last.top + last.height / 2 };
  });
  await page.mouse.click(box.x - 2, box.y);
  await page.keyboard.press(LINE_END);
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
