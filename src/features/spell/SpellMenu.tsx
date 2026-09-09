import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { forgetAll, forgetWord, recheck } from "@/features/editor/extensions/spell";
import { ContextMenu, type MenuItem } from "@/features/folio/ContextMenu";
import { commands } from "@/ipc";
import { useSpellStore } from "./store";

/** Right-click menu on a misspelled word: suggestions, add to dictionary, ignore. */
export function SpellMenu({ editor }: { editor: Editor }) {
  const menu = useSpellStore((s) => s.menu);
  const close = useSpellStore((s) => s.closeMenu);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!menu) {
      setSuggestions(null);
      return;
    }
    let live = true;
    commands.spellSuggest(menu.word).then((r) => {
      if (live) setSuggestions(r.status === "ok" ? r.data : []);
    });
    return () => {
      live = false;
    };
  }, [menu]);

  if (!menu || suggestions === null) return null;

  const items: MenuItem[] = [
    ...suggestions.map((s) => ({
      label: s,
      run: () => {
        editor.chain().focus().insertContentAt({ from: menu.from, to: menu.to }, s).run();
      },
    })),
    ...(suggestions.length === 0 ? [{ label: "No suggestions", run: () => undefined }] : []),
    {
      label: `Add “${menu.word}” to dictionary`,
      run: () => {
        void commands.spellAdd(menu.word).then(() => {
          forgetAll();
          recheck(editor.view);
          editor.commands.focus();
        });
      },
    },
    {
      label: "Ignore for this session",
      run: () => {
        void commands.spellIgnore(menu.word).then(() => {
          forgetWord(menu.word);
          recheck(editor.view);
          editor.commands.focus();
        });
      },
    },
  ];

  return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} />;
}
