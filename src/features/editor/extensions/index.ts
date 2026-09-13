import type { Extensions } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { BulletList, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import {
  Callout,
  CalloutTitle,
  Cite,
  FootnoteDef,
  FootnoteRef,
  FrontMatter,
  RawBlock,
  RawInline,
  Tag,
  WikiEmbed,
  WikiLink,
} from "./aml-nodes";
import { AutoPair } from "./autopair";
import { AmlContextMenu } from "./context";
import { AmlImage } from "./image";
import { LinkMenu } from "./linkmenu";
import { NoteLinks } from "./links";
import { Outline } from "./outline";
import { SlashMenu } from "./slash";
import { SpellCheck } from "./spell";
import { TagClicks } from "./tags";
import { WritingModes } from "./writing";

/**
 * The AML editor schema. Node names and attrs must match src/lib/markdown/pm.ts.
 * Lists carry `spread` (loose/tight), code blocks carry `meta` (info-string rest),
 * tables carry `align` — all needed for a faithful markdown round trip.
 */
export function amlExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      bulletList: false,
      orderedList: false,
      codeBlock: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      dropcursor: { color: "var(--aml-primary)", width: 2 },
    }),
    BulletList.extend({
      addAttributes() {
        return { ...this.parent?.(), spread: { default: false } };
      },
    }),
    OrderedList.extend({
      addAttributes() {
        return { ...this.parent?.(), spread: { default: false } };
      },
    }),
    TaskList.extend({
      addAttributes() {
        return { ...this.parent?.(), spread: { default: false } };
      },
    }),
    TaskItem.configure({ nested: true }),
    CodeBlock.extend({
      addAttributes() {
        return { ...this.parent?.(), meta: { default: null } };
      },
    }).configure({ defaultLanguage: null, exitOnTripleEnter: true }),
    Table.extend({
      addAttributes() {
        return { ...this.parent?.(), align: { default: [] } };
      },
    }).configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    AmlImage,
    FrontMatter,
    Callout,
    CalloutTitle,
    RawBlock,
    RawInline,
    WikiLink,
    WikiEmbed,
    Tag,
    Cite,
    FootnoteRef,
    FootnoteDef,
    AutoPair,
    SlashMenu,
    LinkMenu,
    NoteLinks,
    Outline,
    TagClicks,
    WritingModes,
    SpellCheck,
    // After SpellCheck: a right-click on a misspelled word belongs to the suggestions.
    AmlContextMenu,
  ];
}
