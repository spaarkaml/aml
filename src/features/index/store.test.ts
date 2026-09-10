import { describe, expect, it } from "vitest";
import { describeIndex } from "./store";

const base = { notes: 10, building: false, done: 0, total: 0, lastBuilt: 0, lastDurationMs: 0 };

describe("describeIndex", () => {
  it("is silent when idle or unknown", () => {
    expect(describeIndex(null)).toBeNull();
    expect(describeIndex(base)).toBeNull();
  });
  it("shows progress while building", () => {
    expect(describeIndex({ ...base, building: true })).toBe("Indexing…");
    expect(describeIndex({ ...base, building: true, done: 120, total: 5000 })).toBe(
      "Indexing 120 / 5,000",
    );
  });
});
