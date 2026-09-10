import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { useEditorStore } from "@/features/editor/store";
import { useFolioStore } from "@/features/folio/store";
import { linkKey, resolveLinks, useLinkStore } from "@/features/links/store";
import { openNoteAt } from "@/features/quickopen/store";
import type { LinkQuery } from "@/ipc";
import { baseName, parentDir } from "@/lib/paths";

type Resolved = Map<string, string | null>;
const KEY = new PluginKey<Resolved>("amlLinks");
const RESOLVE_DELAY = 250;

function isNoteHref(href: string): boolean {
  return /\.md(#.*)?$/i.test(href) && !/^[a-z]+:/i.test(href) && !href.startsWith("/");
}

function splitHref(href: string): { target: string; heading: string | null } {
  const i = href.indexOf("#");
  const target = decodeURIComponent(i === -1 ? href : href.slice(0, i));
  return { target, heading: i === -1 ? null : decodeURIComponent(href.slice(i + 1)) };
}

/** Every note reference in the document, deduplicated. */
function collect(doc: PmNode): LinkQuery[] {
  const seen = new Set<string>();
  const out: LinkQuery[] = [];
  const add = (q: LinkQuery) => {
    const k = linkKey(q);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(q);
    }
  };
  doc.descendants((node) => {
    if (node.type.name === "wikiLink") add({ target: String(node.attrs.target), kind: "wiki" });
    else if (node.type.name === "wikiEmbed")
      add({ target: String(node.attrs.target), kind: "embed" });
    else if (node.isText) {
      for (const m of node.marks) {
        if (m.type.name !== "link") continue;
        const href = String(m.attrs.href ?? "");
        if (isNoteHref(href)) add({ target: splitHref(href).target, kind: "md" });
      }
    }
    return true;
  });
  return out;
}

function decorate(doc: PmNode, resolved: Resolved): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "wikiLink" || node.type.name === "wikiEmbed") {
      const kind = node.type.name === "wikiLink" ? "wiki" : "embed";
      if (resolved.get(`${kind}:${String(node.attrs.target)}`) === null)
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "aml-link-missing" }));
    } else if (node.isText) {
      for (const m of node.marks) {
        if (m.type.name !== "link") continue;
        const href = String(m.attrs.href ?? "");
        if (isNoteHref(href) && resolved.get(`md:${splitHref(href).target}`) === null)
          decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: "aml-link-missing" }));
      }
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

/** Opens the note a link points at, creating it when it does not exist. */
export async function followLink(q: LinkQuery, heading: string | null): Promise<void> {
  const from = useEditorStore.getState().path;
  if (!from) return;
  const resolved = (await resolveLinks(from, [q])).get(linkKey(q)) ?? null;
  if (resolved) {
    openNoteAt(resolved, heading);
    return;
  }
  if (q.kind === "md") return;
  const target = q.target.replace(/\.md$/i, "");
  const dir = target.includes("/") ? parentDir(target) : parentDir(from);
  const created = await useFolioStore.getState().createNote(dir, baseName(target));
  if (created) useLinkStore.getState().invalidate();
}

/**
 * Note links in the editor: click (or ⌘-click) a `[[wiki link]]` or a `[text](note.md)` link
 * to open it — or create it when it does not exist — and mark links that point nowhere.
 * Resolution is Rust's (`link_resolve`), fetched in one batch per document change.
 */
export const NoteLinks = Extension.create({
  name: "noteLinks",

  addProseMirrorPlugins() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const schedule = (view: EditorView) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const from = useEditorStore.getState().path;
        if (!from) return;
        const doc = view.state.doc;
        void resolveLinks(from, collect(doc)).then((map) => {
          if (view.isDestroyed || view.state.doc !== doc) return schedule(view);
          view.dispatch(view.state.tr.setMeta(KEY, map));
        });
      }, RESOLVE_DELAY);
    };

    return [
      new Plugin<Resolved>({
        key: KEY,
        state: {
          init: () => new Map(),
          apply(tr, prev) {
            const next = tr.getMeta(KEY) as Resolved | undefined;
            return next ?? prev;
          },
        },
        view(view) {
          schedule(view);
          let version = useLinkStore.getState().version;
          unsubscribe = useLinkStore.subscribe((s) => {
            if (s.version !== version) {
              version = s.version;
              schedule(view);
            }
          });
          return {
            update(v, prevState) {
              if (v.state.doc !== prevState.doc) schedule(v);
            },
            destroy() {
              if (timer) clearTimeout(timer);
              unsubscribe?.();
            },
          };
        },
        props: {
          decorations(state) {
            return decorate(state.doc, KEY.getState(state) ?? new Map());
          },
          handleClickOn(_view, _pos, node) {
            if (node.type.name !== "wikiLink") return false;
            void followLink(
              { target: String(node.attrs.target), kind: "wiki" },
              (node.attrs.heading as string | null) ?? null,
            );
            return true;
          },
          handleClick(view, pos) {
            const $pos = view.state.doc.resolve(pos);
            const mark = $pos.marks().find((m) => m.type.name === "link");
            if (!mark) return false;
            const href = String(mark.attrs.href ?? "");
            if (!isNoteHref(href)) return false;
            const { target, heading } = splitHref(href);
            void followLink({ target, kind: "md" }, heading);
            return true;
          },
        },
      }),
    ];
  },
});
