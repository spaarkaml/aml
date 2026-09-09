import { coerce, display, parseFields, removeField, setField, toYaml } from "./frontmatter";

describe("front matter fields", () => {
  const yaml =
    "title: A note\ntype: chapter\ntarget_words: 4000\ndraft: true\ntags:\n  - alpha\n  - beta\ncreated: 2026-09-09";

  it("parses kinds", () => {
    const f = parseFields(yaml);
    expect(f.map((x) => [x.key, x.kind])).toEqual([
      ["title", "text"],
      ["type", "text"],
      ["target_words", "number"],
      ["draft", "boolean"],
      ["tags", "list"],
      ["created", "date"],
    ]);
    expect(display(f[4] as never)).toBe("alpha, beta");
    expect(display(f[5] as never)).toBe("2026-09-09");
  });

  it("round-trips through toYaml preserving order", () => {
    const f = parseFields(yaml);
    expect(parseFields(toYaml(f))).toEqual(f);
  });

  it("sets, adds and removes fields with coercion", () => {
    let f = parseFields(yaml);
    f = setField(f, "target_words", coerce("number", "5000"));
    f = setField(f, "status", "drafting");
    f = removeField(f, "draft");
    expect(toYaml(f)).toContain("target_words: 5000");
    expect(toYaml(f)).toContain("status: drafting");
    expect(toYaml(f)).not.toContain("draft:");
    expect(coerce("list", "a, b ,c")).toEqual(["a", "b", "c"]);
    expect(coerce("boolean", "false")).toBe(false);
    expect(coerce("text", "4000")).toBe(4000);
    expect(coerce("text", "true")).toBe(true);
    expect(coerce("text", "4000 words")).toBe("4000 words");
  });

  it("handles empty and invalid yaml", () => {
    expect(parseFields("")).toEqual([]);
    expect(parseFields(": : :")).toEqual([]);
    expect(toYaml([])).toBe("");
  });
});
