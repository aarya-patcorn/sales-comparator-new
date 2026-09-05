import { describe, expect, it } from "vitest";

import { PARAM_KEYS } from "../../lib/paramFields.js";
import { PARAM_DIRECTION, detectAdvantage } from "./advantage.js";

describe("PARAM_DIRECTION", () => {
  it("covers every canonical parameter exactly once", () => {
    expect(Object.keys(PARAM_DIRECTION).sort()).toEqual([...PARAM_KEYS].sort());
  });

  it("uses the documented directions", () => {
    expect(PARAM_DIRECTION.tensile_adhesion_is).toBe("higher");
    expect(PARAM_DIRECTION.shear_adhesion_wet).toBe("higher");
    expect(PARAM_DIRECTION.coverage).toBe("higher");
    expect(PARAM_DIRECTION.shelf_life).toBe("higher");
    expect(PARAM_DIRECTION.voc_content).toBe("lower");
    expect(PARAM_DIRECTION.slip_resistance).toBe("lower");
    expect(PARAM_DIRECTION.open_time).toBe("neutral");
    expect(PARAM_DIRECTION.color).toBe("neutral");
  });
});

describe("detectAdvantage — higher is better", () => {
  it("claims an advantage when Kamdhenu is strictly higher", () => {
    const result = detectAdvantage("tensile_adhesion_is", "≥ 1.2 N/mm²", [
      "≥ 1.0 N/mm²",
      "0.9-1.0 N/mm²",
    ]);

    expect(result).toEqual({
      direction: "higher",
      kamdhenuAdvantage: true,
      comparedCount: 2,
    });
  });

  it("claims nothing when a single competitor matches or beats it", () => {
    expect(
      detectAdvantage("tensile_adhesion_is", "≥ 1.0 N/mm²", [
        "≥ 0.5 N/mm²",
        "≥ 1.5 N/mm²",
      ]).kamdhenuAdvantage,
    ).toBe(false);

    // Equal is not better.
    expect(
      detectAdvantage("tensile_adhesion_is", "≥ 1.0 N/mm²", ["≥ 1.0 N/mm²"])
        .kamdhenuAdvantage,
    ).toBe(false);
  });
});

describe("detectAdvantage — lower is better", () => {
  it("claims an advantage when Kamdhenu is strictly lower", () => {
    expect(
      detectAdvantage("voc_content", "< 5 g/kg", ["< 30 g/kg", "10 g/kg"]),
    ).toEqual({ direction: "lower", kamdhenuAdvantage: true, comparedCount: 2 });

    expect(
      detectAdvantage("slip_resistance", "≤ 0.2 mm", ["≤ 0.5 mm"])
        .kamdhenuAdvantage,
    ).toBe(true);
  });

  it("claims nothing when Kamdhenu is higher", () => {
    expect(
      detectAdvantage("voc_content", "< 30 g/kg", ["< 5 g/kg"])
        .kamdhenuAdvantage,
    ).toBe(false);
  });
});

describe("detectAdvantage — neutral parameters", () => {
  it("never claims an advantage, even with a bigger number", () => {
    for (const key of ["open_time", "pot_life", "color", "packaging"] as const) {
      expect(detectAdvantage(key, "999 minutes", ["1 minutes"])).toEqual({
        direction: "neutral",
        kamdhenuAdvantage: false,
        comparedCount: 0,
      });
    }
  });
});

describe("detectAdvantage — nulls and unparseable values", () => {
  it("claims nothing when the Kamdhenu value is missing or text", () => {
    expect(
      detectAdvantage("tensile_adhesion_is", null, ["≥ 1.0 N/mm²"]),
    ).toEqual({ direction: "higher", kamdhenuAdvantage: false, comparedCount: 0 });

    expect(
      detectAdvantage("tensile_adhesion_is", "Not declared", ["≥ 1.0 N/mm²"])
        .kamdhenuAdvantage,
    ).toBe(false);
  });

  it("skips competitor values that are missing or text", () => {
    const result = detectAdvantage("tensile_adhesion_is", "≥ 1.2 N/mm²", [
      null,
      "Not declared",
      "≥ 1.0 N/mm²",
    ]);

    expect(result.comparedCount).toBe(1);
    expect(result.kamdhenuAdvantage).toBe(true);
  });

  it("claims nothing when no competitor value is comparable", () => {
    expect(
      detectAdvantage("tensile_adhesion_is", "≥ 1.2 N/mm²", [null, "n/a"]),
    ).toEqual({ direction: "higher", kamdhenuAdvantage: false, comparedCount: 0 });
  });
});

describe("detectAdvantage — units", () => {
  it("ignores values whose units are not comparable (defect #8)", () => {
    // 0.5 N/mm² vs 5 kg/cm²: the bare numbers would wrongly favour the latter.
    const result = detectAdvantage("tensile_adhesion_is", "≥ 1.0 N/mm²", [
      "≥ 5 kg/cm²",
    ]);

    expect(result.comparedCount).toBe(0);
    expect(result.kamdhenuAdvantage).toBe(false);
  });

  it("compares MPa against N/mm² correctly", () => {
    expect(
      detectAdvantage("tensile_adhesion_is", "1.5 N/mm²", ["1.2 MPa"])
        .kamdhenuAdvantage,
    ).toBe(true);
  });

  it("compares hours against minutes correctly", () => {
    // shelf_life is higher-better; 2 years vs 18 months are different units and
    // must not be compared numerically.
    expect(
      detectAdvantage("shelf_life", "2 years", ["18 months"]).comparedCount,
    ).toBe(0);

    expect(
      detectAdvantage("shelf_life", "24 months", ["18 months"])
        .kamdhenuAdvantage,
    ).toBe(true);
  });

  it("uses the lower bound of a range consistently on both sides", () => {
    // 1.0-1.2 vs 0.9-1.5 -> compares 1.0 against 0.9.
    expect(
      detectAdvantage("shear_adhesion_dry", "1.0-1.2 N/mm²", [
        "0.9-1.5 N/mm²",
      ]).kamdhenuAdvantage,
    ).toBe(true);
  });
});
