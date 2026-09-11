import { applyAppearance, current, EMPTY, resolveMode, useAppearanceStore } from "./store";
import { contrastRatio, contrastVerdict, DEFAULTS, EDITOR_FONTS, fontStack } from "./tokens";

describe("appearance", () => {
  it("resolves system to the OS preference", () => {
    expect(resolveMode("system", true)).toBe("ink");
    expect(resolveMode("system", false)).toBe("paper");
    expect(resolveMode("ink", false)).toBe("ink");
  });
  it("cycles system → paper → ink → system", () => {
    const s = useAppearanceStore.getState;
    s().setSetting("system");
    s().cycle();
    expect(current(s()).mode).toBe("paper");
    s().cycle();
    expect(current(s()).mode).toBe("ink");
    s().cycle();
    expect(current(s()).mode).toBe("system");
  });

  it("edits the Folio's settings, or this device's while the override is on", () => {
    const s = useAppearanceStore.getState;
    useAppearanceStore.setState({ folio: EMPTY, device: EMPTY, useDevice: false });
    s().setToken("ink", "bg", "#101820");
    expect(s().folio.ink.bg).toBe("#101820");
    expect(s().device.ink.bg).toBeUndefined();

    s().setUseDevice(true);
    s().setToken("ink", "bg", "#000000");
    expect(current(s()).ink.bg).toBe("#000000");
    // The Folio's own setting is untouched by a device override.
    expect(s().folio.ink.bg).toBe("#101820");

    // Clearing a token removes it, so the stylesheet's default applies again.
    s().setToken("ink", "bg", null);
    expect(current(s()).ink.bg).toBeUndefined();
    s().setUseDevice(false);
  });

  it("writes only what is set onto the root, and removes what is not", () => {
    applyAppearance({ ...EMPTY, ink: { bg: "#101820" }, measure: 60 }, "ink");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--aml-bg")).toBe("#101820");
    expect(root.style.getPropertyValue("--aml-measure")).toBe("60ch");
    expect(root.style.getPropertyValue("--aml-text")).toBe("");

    applyAppearance(EMPTY, "ink");
    expect(root.style.getPropertyValue("--aml-bg")).toBe("");
    expect(root.style.getPropertyValue("--aml-measure")).toBe("");
  });
});

describe("contrast", () => {
  it("scores AML's own tokens the way the report does", () => {
    const paper = contrastRatio(DEFAULTS.paper.text as string, DEFAULTS.paper.bg as string);
    expect(paper).toBeGreaterThan(12);
    expect(contrastVerdict(paper).ok).toBe(true);

    // The same number docs/qa/contrast-report.md reports for this pair (ADR-010 rounds it to 2.0).
    const muted = contrastRatio(DEFAULTS.paper.muted as string, DEFAULTS.paper.bg as string);
    expect(muted).toBeCloseTo(1.91, 2);
    expect(contrastVerdict(muted)).toEqual({ label: "1.9:1 too low", ok: false });
    expect(contrastVerdict(contrastRatio("#767676", "#ffffff")).label).toContain("AA");
  });

  it("returns 0 rather than guessing at anything that is not a hex colour", () => {
    expect(contrastRatio("red", "#ffffff")).toBe(0);
    expect(contrastRatio("#fff", "#000000")).toBe(0);
  });
});

describe("fonts", () => {
  it("maps a chosen face to its stack, and quotes one it has never heard of", () => {
    expect(fontStack(EDITOR_FONTS, "Literata")).toContain("Literata");
    expect(fontStack(EDITOR_FONTS, null)).toBeNull();
    expect(fontStack(EDITOR_FONTS, "Brioni")).toBe('"Brioni", serif');
  });
});
