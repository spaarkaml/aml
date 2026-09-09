import { escapeText } from "./escape";
import { parseMarkdown } from "./mdast";

/** The parser is the judge: escaping a string must give back exactly one text node with that value. */
function roundTrip(s: string): string {
  const escaped = escapeText(s, { before: "", after: "", inTable: false });
  const tree = parseMarkdown(escaped);
  expect(tree.children, escaped).toHaveLength(1);
  const p = tree.children[0];
  expect(p?.type, escaped).toBe("paragraph");
  const kids = p && "children" in p ? p.children : [];
  expect(
    kids.map((k) => k.type),
    escaped,
  ).toEqual(["text"]);
  const t = kids[0];
  return t && "value" in t ? t.value : "";
}

const CASES = [
  "snake_case_word and a_b",
  "2*3*4 = 24",
  "5 * 3 = 15",
  "*not italic*",
  "_not italic_",
  "**not bold**",
  "~~not struck~~",
  "`not code`",
  "[not a link](x)",
  "![not an image](x)",
  "[not a ref][r]",
  "# not a heading",
  "number #1 only (numeric is not a tag)",
  "> not a quote",
  "- not a list",
  "+ not a list",
  "* not a list",
  "1. not a list",
  "12) not a list",
  "| not | a table |",
  "```not a fence",
  "~~~not a fence",
  "<div>not html</div>",
  "<b>bold?</b>",
  "a < b and b > c",
  "&amp; entity and &copy; and & alone",
  "$not math$",
  "back\\slash and C:\\Users\\x",
  "trailing backslash \\",
  "escaped \\* star",
  "---",
  "===",
  "    four leading spaces",
  "日本語 と **太字**",
  "emoji 🐍 and 🇦🇺",
  "a  b   c (multiple inner spaces)",
  "(parens) [brackets] {braces}",
  "1.5 metres and 3. of them",
  "C# and F# languages",
  "10% and 100%%",
  "==highlight== and ^caret^",
  "%%comment%% here",
  "a_b_c_d",
  "__init__ and __dunder__",
  "***",
  "* * *",
  "___",
  "- - -",
];

describe("escapeText", () => {
  it.each(CASES)("round-trips %j", (s) => {
    expect(roundTrip(s)).toBe(s);
  });

  it("leaves intraword underscores and safe characters alone", () => {
    const ctx = { before: "", after: "", inTable: false };
    expect(escapeText("snake_case_word", ctx)).toBe("snake_case_word");
    expect(escapeText("5 * 3", ctx)).toBe("5 * 3");
    expect(escapeText("colour, organise; centre.", ctx)).toBe("colour, organise; centre.");
  });

  it("escapes pipes only inside tables", () => {
    expect(escapeText("a | b", { before: "", after: "", inTable: false })).toBe("a | b");
    expect(escapeText("a | b", { before: "", after: "", inTable: true })).toBe("a \\| b");
  });

  it("escapes block starters only at line start", () => {
    const ctx = { before: "", after: "", inTable: false };
    expect(escapeText("# heading", ctx)).toBe("\\# heading");
    expect(escapeText("not # heading", ctx)).toBe("not # heading");
    expect(escapeText("line\n- item", ctx)).toBe("line\n\\- item");
  });
});
