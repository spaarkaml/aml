import { expect, type Page, test } from "@playwright/test";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

/** Turns AML's shortcut grammar into the key string Playwright presses. */
function playwrightKey(shortcut: string): string {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const mods = parts.map((m) => {
    if (m === "mod") return mod;
    if (m === "ctrl") return "Control";
    if (m === "alt") return "Alt";
    if (m === "shift") return "Shift";
    if (m === "meta") return "Meta";
    return m;
  });
  const named = key.startsWith("arrow")
    ? `Arrow${key.slice(5, 6).toUpperCase()}${key.slice(6)}`
    : /^f\d{1,2}$/.test(key)
      ? key.toUpperCase()
      : key.length === 1
        ? key.toUpperCase()
        : key.slice(0, 1).toUpperCase() + key.slice(1);
  return [...mods, named].join("+");
}

async function bound(page: Page): Promise<Array<{ id: string; shortcut: string }>> {
  return page.evaluate(() => {
    const registry = (
      window as unknown as {
        __amlCommands: {
          all: () => Array<{ id: string }>;
          shortcutOf: (c: { id: string }) => string | undefined;
        };
      }
    ).__amlCommands;
    return registry
      .all()
      .map((c) => ({ id: c.id, shortcut: registry.shortcutOf(c) ?? "" }))
      .filter((c) => c.shortcut !== "");
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.getByRole("button", { name: "Open Folio…" }).click();
  await expect(page.getByTestId("breadcrumb")).toHaveText("Writing");
});

test("every bound shortcut reaches its command", async ({ page }) => {
  const commands = await bound(page);
  // Sanity: the keymap is not empty and covers the shell, notes and the editor.
  expect(commands.length).toBeGreaterThan(20);
  expect(commands.map((c) => c.id)).toContain("palette.open");

  // Open a note so the note-scoped shortcuts have something to act on.
  await page.getByTestId("folio-tree").getByText("Inbox", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Inbox");

  for (const { id, shortcut } of commands) {
    await page.evaluate(() => {
      (window as unknown as { __amlLastCommand?: string | undefined }).__amlLastCommand = undefined;
    });
    await page.keyboard.press(playwrightKey(shortcut));
    const ran = await page.evaluate(
      () => (window as unknown as { __amlLastCommand?: string | undefined }).__amlLastCommand,
    );
    expect(ran, `${shortcut} should run ${id}`).toBe(id);
    // Whatever the command opened (palette, Quick Open, a rename field) gets out of the way.
    await page.keyboard.press("Escape");
  }
});

test("a shortcut can be rebound, clashes are refused, and the change survives a reload", async ({
  page,
}) => {
  await page.keyboard.press(`${mod}+/`);
  await expect(page.getByTestId("shortcuts-list")).toBeVisible();
  await page.getByTestId("shortcuts-filter").fill("Toggle Browser");

  const key = page.getByTestId("shortcut-key-panel.left.toggle");
  await expect(key).toHaveText(mac ? "⇧⌘E" : "Ctrl+Shift+E");

  // A key another command already holds is refused, with the culprit named.
  await key.click();
  await page.keyboard.press(`${mod}+K`);
  await expect(page.getByTestId("shortcuts-error")).toContainText("Show All Commands");
  await expect(key).toHaveText("Press keys…");

  await page.keyboard.press(`${mod}+Alt+B`);
  await expect(key).toHaveText(mac ? "⌥⌘B" : "Ctrl+Alt+B");
  await page.getByTestId("shortcuts-close").click();

  // The new key works and the old one no longer does.
  await expect(page.getByTestId("panel-left")).toBeVisible();
  await page.keyboard.press(`${mod}+Alt+B`);
  await expect(page.getByTestId("panel-left")).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByTestId("panel-left")).toHaveCount(0);

  // It is per device, so it survives a reload…
  await page.reload();
  await expect(page.getByTestId("layout-toggle")).toBeVisible();
  await page.keyboard.press(`${mod}+Alt+B`);
  await expect(page.getByTestId("panel-left")).toBeVisible();

  // …until it is reset, and then the default is back.
  await page.keyboard.press(`${mod}+/`);
  await page.getByTestId("shortcuts-filter").fill("Toggle Browser");
  await page.getByTestId("shortcut-reset-panel.left.toggle").click();
  await expect(page.getByTestId("shortcut-key-panel.left.toggle")).toHaveText(
    mac ? "⇧⌘E" : "Ctrl+Shift+E",
  );
  await page.getByTestId("shortcuts-close").click();
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByTestId("panel-left")).toHaveCount(0);
});

test("the palette lists every command, including the block formats", async ({ page }) => {
  await page.keyboard.press(`${mod}+K`);
  const input = page.getByTestId("palette-input");
  await input.fill("Heading 2");
  await expect(page.getByRole("option").first()).toContainText("Heading 2");
  await input.fill("Keyboard Shortcuts");
  await expect(page.getByRole("option").first()).toContainText("Keyboard Shortcuts");
  await input.fill("Add to Bounding");
  await expect(page.getByRole("option").first()).toContainText("Academic");
});
