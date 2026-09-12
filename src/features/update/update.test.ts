import { describe, expect, it } from "vitest";
import type { UpdateInfo } from "@/ipc";
import {
  compareVersions,
  describeUpdateError,
  formatDate,
  formatMb,
  percentOf,
  shouldOffer,
} from "./update";

const release = (version: string): UpdateInfo => ({
  version,
  current: "0.1.0",
  notes: "",
  date: null,
});

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("v0.3.0", "0.3.0")).toBe(0);
  });

  it("treats a missing part as zero", () => {
    expect(compareVersions("0.2", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.1", "0.2")).toBe(1);
  });

  it("puts a release ahead of its own candidates", () => {
    expect(compareVersions("0.2.0", "0.2.0-rc.1")).toBe(1);
    expect(compareVersions("0.2.0-rc.2", "0.2.0-rc.1")).toBe(1);
  });
});

describe("shouldOffer", () => {
  it("says nothing when there is nothing", () => {
    expect(shouldOffer(null, null)).toBe(false);
  });

  it("stays quiet about the version that was waved away", () => {
    expect(shouldOffer(release("0.2.0"), "0.2.0")).toBe(false);
  });

  it("speaks up again for a later one — a dismissal is not an opt-out", () => {
    expect(shouldOffer(release("0.3.0"), "0.2.0")).toBe(true);
  });
});

describe("progress", () => {
  it("is null until the server says how big the download is", () => {
    expect(percentOf(1_000_000, null)).toBeNull();
    expect(percentOf(1_000_000, 0)).toBeNull();
  });

  it("never reads over 100 per cent", () => {
    expect(percentOf(6_000_000, 12_000_000)).toBe(50);
    expect(percentOf(13_000_000, 12_000_000)).toBe(100);
  });

  it("shows megabytes the way a download does", () => {
    expect(formatMb(12_300_000)).toBe("12.3 MB");
  });
});

describe("dates and errors", () => {
  it("leaves a date it cannot read alone", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
    expect(formatDate("2026-09-12T00:00:00Z")).toContain("2026");
  });

  it("tells a refused signature apart from a network problem", () => {
    expect(describeUpdateError({ kind: "notTrusted", detail: "bad" })).toContain("discarded");
    expect(describeUpdateError({ kind: "unreachable", detail: "dns" })).toContain("reach");
    expect(describeUpdateError({ kind: "notConfigured" })).toContain("cannot update itself");
  });
});
