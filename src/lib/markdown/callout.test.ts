import { calloutToSource, parseCalloutSource, stripQuote } from "./callout";

describe("reading a callout", () => {
  it("takes the kind, the fold marker and the title from the first line", () => {
    expect(parseCalloutSource("> [!warning]- Read this first\n> The body.")).toEqual({
      kind: "warning",
      fold: "-",
      title: "Read this first",
      body: "The body.",
    });
  });

  it("copes with no title, no body and no fold", () => {
    expect(parseCalloutSource("> [!note]")).toEqual({
      kind: "note",
      fold: null,
      title: "",
      body: "",
    });
  });

  it("keeps a kind AML has never heard of", () => {
    // Nothing is lost because the parser does not recognise it (ADR-003 rule 2).
    expect(parseCalloutSource("> [!bryces-own] Title")?.kind).toBe("bryces-own");
  });

  it("keeps an Obsidian layout hint in the kind rather than letting the block escape", () => {
    // Unrecognised, this was an ordinary quotation whose `[` the serialiser escaped — which
    // rewrote the user's file on the first save.
    expect(parseCalloutSource("> [!note|left] Title\n> Body.")?.kind).toBe("note|left");
  });

  it("is not fooled by an ordinary quote", () => {
    expect(parseCalloutSource("> Just a quotation.")).toBeNull();
    expect(parseCalloutSource("> [not a callout] really")).toBeNull();
  });

  it("strips one level of quoting, so a nested callout stays a callout", () => {
    const parsed = parseCalloutSource("> [!note] Outer\n> > [!tip] Inner\n> > Body");
    expect(parsed?.body).toBe("> [!tip] Inner\n> Body");
  });
});

describe("writing a callout", () => {
  it("puts the body on the lines straight after the head", () => {
    expect(calloutToSource({ kind: "note", fold: null, title: "Title", body: "Body." })).toBe(
      "> [!note] Title\n> Body.",
    );
  });

  it("quotes a blank line as a bare marker, so two paragraphs stay two", () => {
    expect(calloutToSource({ kind: "tip", fold: "+", title: "", body: "One\n\nTwo" })).toBe(
      "> [!tip]+\n> One\n>\n> Two",
    );
  });

  it("round-trips whatever it writes", () => {
    for (const callout of [
      { kind: "note", fold: null, title: "Title", body: "Body." },
      { kind: "warning", fold: "-" as const, title: "", body: "One\n\nTwo" },
      { kind: "quote", fold: "+" as const, title: "A title", body: "" },
    ]) {
      expect(parseCalloutSource(calloutToSource(callout))).toEqual(callout);
    }
  });
});

describe("stripQuote", () => {
  it("takes `> ` off every line and leaves a lazy continuation alone", () => {
    expect(stripQuote("> one\n> two")).toBe("one\ntwo");
    expect(stripQuote("> one\ntwo")).toBe("one\ntwo");
    expect(stripQuote(">")).toBe("");
  });
});
