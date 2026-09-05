import { describe, expect, it } from "vitest";

import {
  areComparable,
  normalizeUnit,
  parseMeasurement,
} from "./units.js";

describe("parseMeasurement", () => {
  it("parses a plain number with a unit", () => {
    expect(parseMeasurement("24 hours")).toMatchObject({
      value: 24,
      rangeMax: null,
      comparator: null,
      unit: "hours",
      canonicalUnit: "min",
      canonicalValue: 1440,
    });
  });

  it("parses a leading comparator", () => {
    expect(parseMeasurement("≥ 0.5 N/mm²")).toMatchObject({
      value: 0.5,
      comparator: "≥",
      unit: "N/mm²",
      canonicalUnit: "n/mm2",
    });
    expect(parseMeasurement("< 5 g/kg")).toMatchObject({
      value: 5,
      comparator: "<",
      canonicalUnit: "g/kg",
    });
    expect(parseMeasurement("≤ 0.5 mm")?.comparator).toBe("≤");
    expect(parseMeasurement(">= 1.0 N/mm²")?.comparator).toBe("≥");
  });

  it("takes the lower bound of a range and keeps the upper bound", () => {
    expect(parseMeasurement("0.45-0.55 N/mm²")).toMatchObject({
      value: 0.45,
      rangeMax: 0.55,
      canonicalUnit: "n/mm2",
    });
    expect(parseMeasurement("20-30 minutes")).toMatchObject({
      value: 20,
      rangeMax: 30,
      canonicalUnit: "min",
    });
    expect(parseMeasurement("9-12 months")).toMatchObject({
      value: 9,
      rangeMax: 12,
      canonicalUnit: "month",
    });
  });

  it("handles en/em dashes and decimal commas", () => {
    expect(parseMeasurement("1,6-1,8 kg/L")).toMatchObject({
      value: 1.6,
      rangeMax: 1.8,
      canonicalUnit: "kg/l",
    });
    expect(parseMeasurement("3–10 mm")?.rangeMax).toBe(10);
  });

  it("returns null for text-only and empty values", () => {
    expect(parseMeasurement("Grey")).toBeNull();
    expect(parseMeasurement("Grey / White")).toBeNull();
    expect(parseMeasurement(null)).toBeNull();
    expect(parseMeasurement("")).toBeNull();
    expect(parseMeasurement("N/A")).toBeNull();
  });

  it("parses values with trailing prose", () => {
    expect(parseMeasurement("4-5 m² per 20kg @ 3mm bed")).toMatchObject({
      value: 4,
      rangeMax: 5,
    });
    expect(parseMeasurement("20 KG bag")?.value).toBe(20);
  });

  it("converts time units to minutes so hours and minutes compare", () => {
    const twoHours = parseMeasurement("2 hours");
    const ninetyMinutes = parseMeasurement("90 minutes");

    expect(twoHours?.canonicalValue).toBe(120);
    expect(ninetyMinutes?.canonicalValue).toBe(90);
    expect(areComparable(twoHours!, ninetyMinutes!)).toBe(true);
    expect(twoHours!.canonicalValue).toBeGreaterThan(
      ninetyMinutes!.canonicalValue,
    );
  });

  it("treats MPa and N/mm² as the same unit", () => {
    const mpa = parseMeasurement("1.2 MPa");
    const nmm2 = parseMeasurement("1.0 N/mm2");

    expect(mpa?.canonicalUnit).toBe("n/mm2");
    expect(areComparable(mpa!, nmm2!)).toBe(true);
  });

  it("records a missing unit as an empty canonical unit", () => {
    expect(parseMeasurement("42")).toMatchObject({
      value: 42,
      unit: null,
      canonicalUnit: "",
    });
  });
});

describe("normalizeUnit", () => {
  it("folds case, spacing and superscripts", () => {
    expect(normalizeUnit("N/mm²")).toBe("n/mm2");
    expect(normalizeUnit(" N / mm2 ")).toBe("n/mm2");
    expect(normalizeUnit("m²")).toBe("m2");
  });
});

describe("areComparable", () => {
  it("rejects mismatched units", () => {
    const nmm2 = parseMeasurement("1.0 N/mm²");
    const mm = parseMeasurement("1.0 mm");
    const bare = parseMeasurement("1.0");

    expect(areComparable(nmm2!, mm!)).toBe(false);
    expect(areComparable(nmm2!, bare!)).toBe(false);
    expect(areComparable(nmm2!, parseMeasurement("2.0 N/mm²")!)).toBe(true);
  });
});
