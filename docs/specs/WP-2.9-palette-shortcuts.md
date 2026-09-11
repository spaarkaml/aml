# WP-2.9 — Command Palette complete and rebindable
**Stage:** 2 · **Depends on:** every Stage 1–2 WP · **ADRs:** 004 · **Sessions:** 1

## Goal
Everything AML can do is reachable from one search field, and every key it answers to can be changed.

## Design
- **One list of blocks.** The `/` menu's items moved to `features/editor/blocks.ts`, and each is registered as a `Format` palette command. The slash menu and the palette now offer the same things because they read the same array.
- **Rebinding lives beside the registry.** `CommandRegistry` gained `setOverrides` and `shortcutOf`: a command's *effective* shortcut is its rebinding if it has one, its default otherwise, and nothing at all when it has been deliberately unbound. `forEvent`, the palette and the top bar all ask for the effective shortcut, so there is one answer to "what runs this key".
- **The keymap is per device** (ADR-004: it is a preference, not part of the work), persisted as `aml.keymap` and pushed into the registry on rehydrate — before any key press can arrive.
- **Recording** (`keymap.ts`): a key press becomes `mod+shift+e` — `mod` being ⌘ on macOS and Ctrl elsewhere, so a rebinding means the same thing on both of your machines. A bare letter is refused (it would swallow typing); F-keys and the navigation block are allowed alone. Escape cancels, Backspace unbinds.
- **Clashes are refused, not silently won.** `forEvent` returns the first match, so two commands on one key would be a coin toss; the dialog names the command already holding it and keeps recording. A unit test asserts the shipped keymap has no duplicate.
- **The dialog** (`ShortcutsDialog.tsx`, `⌘/`): every command with its key, click to record, ↺ to restore the default (disabled unless rebound), *Reset all*, and a filter. A collapsed **Editor keys** section lists ⌘B, ⌘I, ⌘E, ⌘Z, ⌘⇧Z as what they are — Tiptap's, the same on every machine, not rebindable yet.
- **Why the editor's keys are not rebindable here:** ProseMirror handles a key press on the editor element before it bubbles to the window listener, so registering `mod+b` in the registry would toggle bold twice. Taking them over means dropping Tiptap's own keymap and moving the global listener to the capture phase — a change to every shortcut in the app, which does not belong in the same work package as the dialog that would configure it. The formatting commands are in the palette; only their keys still belong to the editor.
- **Dependencies:** none added.

## Acceptance criteria
- [x] `shortcutFromEvent` writes `mod` for the platform's own key, refuses a lone modifier and a bare letter, allows F-keys; `sameShortcut` ignores modifier order (unit tests `features/commands/keymap.test.ts`).
- [x] The shipped keymap binds no key to two commands, and every command has a title and a body (unit test, over the whole registry including hidden commands).
- [x] Overrides resolve, unbind and reset, and conflicts are found against effective shortcuts rather than defaults (unit test).
- [x] **E2E presses every bound shortcut** and asserts the command that ran is the one that owns it — the plan's acceptance for this WP (`e2e/shortcuts.spec.ts`).
- [x] E2E: a shortcut can be rebound, a clash is refused by name, the new key works, the old one does not, it survives a reload, and ↺ restores the default.
- [x] E2E: the palette finds a block format, the shortcuts dialog and a Bounding command.
- [ ] On your Folio: rebind two shortcuts you actually want, restart, and check they held (`docs/qa/stage-2.md` §21).

## Lessons recorded
- Pressing every shortcut found a real one: **Insert Footnote** was not marked `global`, so `⌘⌥F` did nothing while the caret was in the editor — the only place it is useful. Any command that acts on the editor has to be global, because the editor is a text field.
- Exposing the registry and the last command that ran (`__amlCommands`, `__amlLastCommand`, dev builds only) is what let the suite press every key rather than a chosen few. Worth doing wherever coverage should be exhaustive rather than representative.

## Not in this work package
- Rebinding the editor's own formatting keys (see above).
- Chorded shortcuts (`g` then `t`), and per-Folio keymaps: the keymap is per device by decision.
