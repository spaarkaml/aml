import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const ALLOW_FRONT_MATTER_REMOVAL = "aml:allowFrontMatterRemoval";

function hasFrontMatter(doc: { firstChild: { type: { name: string } } | null }): boolean {
  return doc.firstChild?.type.name === "frontMatter";
}

/**
 * Tiptap nodes for the AML dialect. Names and attrs must match src/lib/markdown/pm.ts.
 * All are atoms for now (WP-1.2); editing affordances arrive in WP-1.3 / Stage 2.
 */

export const FrontMatter = Node.create({
  name: "frontMatter",
  group: "block",
  atom: true,
  // Never selectable and never removable by ordinary editing: losing front matter is data loss.
  // The properties panel (WP-1.3) edits it through a transaction carrying ALLOW_FRONT_MATTER_REMOVAL.
  selectable: false,
  draggable: false,
  addAttributes() {
    return { yaml: { default: "" } };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("amlFrontMatterGuard"),
        // If an edit (backspace, select-all + type, cut…) removed the front matter, put it back
        // at the top with the same YAML. The user's edit itself is kept.
        appendTransaction(trs, oldState, newState) {
          if (trs.some((tr) => tr.getMeta(ALLOW_FRONT_MATTER_REMOVAL))) return null;
          if (!hasFrontMatter(oldState.doc) || hasFrontMatter(newState.doc)) return null;
          const node = oldState.doc.firstChild;
          if (!node) return null;
          return newState.tr.insert(0, node.type.create(node.attrs));
        },
      }),
    ];
  },
  parseHTML() {
    return [{ tag: "div[data-front-matter]" }];
  },
  renderHTML({ node }) {
    const yaml = String(node.attrs.yaml ?? "");
    const lines = yaml.split("\n").filter(Boolean).length;
    return [
      "div",
      mergeAttributes({ "data-front-matter": "", class: "aml-front-matter", title: yaml }),
      `Properties · ${lines} ${lines === 1 ? "field" : "fields"}`,
    ];
  },
});

export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { markdown: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "pre[data-raw-block]" }];
  },
  renderHTML({ node }) {
    return [
      "pre",
      mergeAttributes({ "data-raw-block": "", class: "aml-raw-block" }),
      String(node.attrs.markdown ?? ""),
    ];
  },
});

export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { markdown: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "code[data-raw-inline]" }];
  },
  renderHTML({ node }) {
    return [
      "code",
      mergeAttributes({ "data-raw-inline": "", class: "aml-raw-inline" }),
      String(node.attrs.markdown ?? ""),
    ];
  },
});

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      target: { default: "" },
      heading: { default: null },
      alias: { default: null },
      raw: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-wiki-link]" }];
  },
  renderHTML({ node }) {
    const label = String(node.attrs.alias ?? node.attrs.target ?? "");
    const heading = node.attrs.heading ? ` › ${node.attrs.heading}` : "";
    return [
      "a",
      mergeAttributes({
        "data-wiki-link": "",
        class: "aml-wiki-link",
        href: "#",
        title: String(node.attrs.raw ?? ""),
      }),
      node.attrs.alias ? label : `${label}${heading}`,
    ];
  },
});

export const WikiEmbed = Node.create({
  name: "wikiEmbed",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { target: { default: "" }, alias: { default: null }, raw: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-embed]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({
        "data-wiki-embed": "",
        class: "aml-wiki-embed",
        title: String(node.attrs.raw ?? ""),
      }),
      `⧉ ${String(node.attrs.target ?? "")}`,
    ];
  },
});

export const Tag = Node.create({
  name: "tag",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { name: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-tag]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({ "data-tag": "", class: "aml-tag" }),
      `#${String(node.attrs.name ?? "")}`,
    ];
  },
});

export const Cite = Node.create({
  name: "cite",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { raw: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-cite]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({ "data-cite": "", class: "aml-cite" }),
      String(node.attrs.raw ?? ""),
    ];
  },
});

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: "" }, label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]" }];
  },
  renderHTML({ node }) {
    return [
      "sup",
      mergeAttributes({ "data-footnote-ref": "", class: "aml-footnote-ref" }),
      String(node.attrs.label ?? ""),
    ];
  },
});

export const FootnoteDef = Node.create({
  name: "footnoteDef",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { id: { default: "" }, label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "section[data-footnote-def]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-def": "",
        class: "aml-footnote-def",
        "data-label": String(node.attrs.label ?? ""),
      }),
      0,
    ];
  },
});
