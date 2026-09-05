import { describe, expect, it } from "vitest";

import { PARAM_FIELDS, PARAM_KEYS, PARAM_LABELS } from "../lib/paramFields.js";
import {
  emptyParams,
  partialTechnicalParamsSchema,
  technicalParamsSchema,
} from "./technicalParams.js";

const fullParams = {
  open_time: "20-30 minutes",
  pot_life: "2-3 hours",
  adjustability_time: "10-15 minutes",
  tensile_adhesion_is: "≥ 0.5 N/mm²",
  tensile_adhesion_water: "0.45-0.55 N/mm²",
  tensile_adhesion_heat: "0.50-0.60 N/mm²",
  tensile_adhesion_freeze_thaw: "0.50-0.55 N/mm²",
  slip_resistance: "≤ 0.5 mm",
  shear_adhesion_dry: "1.0-1.2 N/mm²",
  shear_adhesion_wet: "0.9-1.1 N/mm²",
  mixing_ratio: "1 : 0.25",
  coverage: "4-5 m² per 20kg @ 3mm bed",
  setting_time: "24 hours",
  adhesive_thickness: "3-10 mm",
  mixed_density: "1.6-1.8 kg/L",
  application_temp: "5°C to 35°C",
  voc_content: "< 5 g/kg",
  shelf_life: "9-12 months",
  packaging: "20 KG bag",
  color: "Grey",
};

describe("PARAM_FIELDS", () => {
  it("holds the 20 blueprint fields in order", () => {
    expect(PARAM_FIELDS).toHaveLength(20);
    expect(PARAM_KEYS[0]).toBe("open_time");
    expect(PARAM_KEYS.at(-1)).toBe("color");
    expect(PARAM_LABELS.tensile_adhesion_is).toBe(
      "Initial Tensile Adhesion (IS)",
    );
  });
});

describe("technicalParamsSchema", () => {
  it("accepts a full valid object", () => {
    const parsed = technicalParamsSchema.parse(fullParams);
    expect(parsed).toEqual(fullParams);
    expect(Object.keys(parsed)).toHaveLength(20);
  });

  it("rejects an unknown key", () => {
    const result = technicalParamsSchema.safeParse({
      ...fullParams,
      bond_strength: "1.0 N/mm²",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("bond_strength");
  });

  it("accepts nulls for missing specs", () => {
    const parsed = technicalParamsSchema.parse({
      ...fullParams,
      voc_content: null,
      slip_resistance: null,
    });

    expect(parsed.voc_content).toBeNull();
    expect(parsed.slip_resistance).toBeNull();
    expect(technicalParamsSchema.parse(emptyParams())).toEqual(emptyParams());
  });

  it("rejects a missing key and non-string values", () => {
    const { color: _color, ...missingOne } = fullParams;

    expect(technicalParamsSchema.safeParse(missingOne).success).toBe(false);
    expect(
      technicalParamsSchema.safeParse({ ...fullParams, mixed_density: 1.7 })
        .success,
    ).toBe(false);
  });
});

describe("emptyParams", () => {
  it("returns every canonical key set to null", () => {
    const empty = emptyParams();

    expect(Object.keys(empty)).toEqual([...PARAM_KEYS]);
    expect(Object.values(empty).every((value) => value === null)).toBe(true);
  });
});

describe("partialTechnicalParamsSchema", () => {
  it("fills missing keys with null but still rejects unknown ones", () => {
    const parsed = partialTechnicalParamsSchema.parse({ color: "Grey" });

    expect(parsed.color).toBe("Grey");
    expect(parsed.open_time).toBeNull();
    expect(Object.keys(parsed)).toHaveLength(20);

    expect(
      partialTechnicalParamsSchema.safeParse({ nope: "x" }).success,
    ).toBe(false);
  });
});
