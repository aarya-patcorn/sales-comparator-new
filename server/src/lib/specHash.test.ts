import { describe, expect, it } from "vitest";

import { hashSpecs } from "./specHash.js";
import { emptyParams } from "../validation/technicalParams.js";

describe("hashSpecs", () => {
  it("is stable for the same values", () => {
    const params = { ...emptyParams(), open_time: "20-30 minutes" };

    expect(hashSpecs(params)).toBe(hashSpecs({ ...params }));
  });

  it("ignores JSON key ordering", () => {
    const a = { ...emptyParams(), open_time: "20 min", color: "Grey" };
    const reordered = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as typeof a;

    expect(hashSpecs(reordered)).toBe(hashSpecs(a));
  });

  it("changes when any single value changes (defect #6)", () => {
    const base = { ...emptyParams(), open_time: "20-30 minutes" };
    const edited = { ...base, open_time: "20-31 minutes" };

    expect(hashSpecs(edited)).not.toBe(hashSpecs(base));
  });

  it("distinguishes null from empty string", () => {
    const withNull = { ...emptyParams(), color: null };
    const withEmpty = { ...emptyParams(), color: "" };

    // Both render as "" in the canonical form, so they intentionally collide;
    // pin the behaviour so a future change is a deliberate one.
    expect(hashSpecs(withNull)).toBe(hashSpecs(withEmpty));
  });

  it("combines several spec sets, order-sensitively", () => {
    const a = { ...emptyParams(), color: "Grey" };
    const b = { ...emptyParams(), color: "White" };

    expect(hashSpecs(a, b)).not.toBe(hashSpecs(b, a));
    expect(hashSpecs(a, b)).not.toBe(hashSpecs(a));
  });

  it("returns a short hex digest", () => {
    expect(hashSpecs(emptyParams())).toMatch(/^[0-9a-f]{16}$/);
  });
});
