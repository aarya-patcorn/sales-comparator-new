import { describe, expect, it } from "vitest";

import {
  MM_PER_INCH,
  SIZE_THRESHOLDS,
  parseTileSize,
  recommendForSizeMm,
  recommendKamdhenu,
  type RecommendInput,
} from "./rules.js";

/** A neutral baseline: indoor, non-difficult substrate, plain ceramic. */
const BASE: RecommendInput = {
  substrateId: "concrete",
  tileTypeId: "ceramic_floor",
  tileSize: "12 x 12 in",
  area: "living_room",
};

function rec(overrides: Partial<RecommendInput> = {}) {
  return recommendKamdhenu({ ...BASE, ...overrides });
}

/** Drives the ladder at an exact millimetre value, bypassing inch rounding. */
function atMm(mm: number, overrides: Partial<RecommendInput> = {}) {
  return recommendForSizeMm({ ...BASE, ...overrides }, mm, []);
}

describe("parseTileSize", () => {
  it("takes the largest integer as inches and converts to mm", () => {
    expect(parseTileSize("24 x 48 in")).toEqual({
      dimensionsIn: [24, 48],
      largestIn: 48,
      sizeMm: 48 * MM_PER_INCH,
    });
  });

  it("ignores trailing words and picks the max regardless of order", () => {
    expect(parseTileSize("12 x 12 in sheet").largestIn).toBe(12);
    expect(parseTileSize("63 x 126 in").largestIn).toBe(126);
    expect(parseTileSize("8 x 12 in").largestIn).toBe(12);
  });

  it("returns nulls when the label has no digits", () => {
    expect(parseTileSize("Slab")).toEqual({
      dimensionsIn: [],
      largestIn: null,
      sizeMm: null,
    });
    expect(parseTileSize("Random").sizeMm).toBeNull();
  });
});

describe("rule 1: difficult / flexible substrates", () => {
  it("recommends K90 below the KX threshold", () => {
    const result = rec({ substrateId: "plywood" });

    expect(result.code).toBe("K90");
    expect(result.rule).toBe("difficult_substrate");
    expect(result.reasons.join(" ")).toContain("flexible or difficult");
  });

  it("steps up to KX at the threshold", () => {
    const { DIFFICULT_SUBSTRATE_KX } = SIZE_THRESHOLDS;

    expect(atMm(DIFFICULT_SUBSTRATE_KX - 1, { substrateId: "plywood" }).code).toBe("K90");
    expect(atMm(DIFFICULT_SUBSTRATE_KX, { substrateId: "plywood" }).code).toBe("KX");
    expect(atMm(DIFFICULT_SUBSTRATE_KX + 1, { substrateId: "plywood" }).code).toBe("KX");
  });

  it("outranks every later rule", () => {
    // Would otherwise be a pool (KX), outdoor (K90) or stone (K80) match.
    expect(rec({ substrateId: "metal", area: "swimming_pool" }).rule).toBe(
      "difficult_substrate",
    );
    expect(
      rec({ substrateId: "glass", tileTypeId: "marble", area: "terrace" }).rule,
    ).toBe("difficult_substrate");
  });

  it("covers each configured difficult substrate", () => {
    for (const substrateId of [
      "plywood",
      "metal",
      "glass",
      "gypsum_board",
      "gypsum_plaster",
      "cement_board",
      "existing_tile",
      "waterproofing_membrane",
    ]) {
      expect(rec({ substrateId }).rule).toBe("difficult_substrate");
    }
  });
});

describe("rule 2: pools and industrial", () => {
  it("always recommends KX, regardless of size", () => {
    expect(rec({ area: "swimming_pool" }).code).toBe("KX");
    expect(rec({ area: "industrial" }).code).toBe("KX");
    expect(rec({ substrateId: "swimming_pool_shell" }).code).toBe("KX");
    expect(atMm(1, { area: "swimming_pool" }).code).toBe("KX");
  });

  it("outranks outdoor, stone and vitrified rules", () => {
    const result = rec({
      area: "swimming_pool",
      tileTypeId: "glass_mosaic",
      tileSize: "12 x 12 in",
    });

    expect(result.rule).toBe("pool_or_industrial");
    expect(result.code).toBe("KX");
  });
});

describe("rule 3: outdoor and facade", () => {
  it("recommends K90 below the threshold and KX at or above it", () => {
    const { OUTDOOR_KX } = SIZE_THRESHOLDS;

    expect(atMm(OUTDOOR_KX - 1, { area: "exterior_facade" }).code).toBe("K90");
    expect(atMm(OUTDOOR_KX, { area: "exterior_facade" }).code).toBe("KX");
    expect(atMm(OUTDOOR_KX + 1, { area: "exterior_facade" }).code).toBe("KX");
  });

  it("applies to every outdoor area", () => {
    for (const area of ["exterior_facade", "terrace", "balcony"]) {
      const result = rec({ area, tileSize: "12 x 12 in" });

      expect(result.rule).toBe("outdoor_or_facade");
      expect(result.code).toBe("K90");
    }
  });

  it("outranks the natural stone and vitrified rules", () => {
    expect(rec({ area: "terrace", tileTypeId: "marble" }).rule).toBe(
      "outdoor_or_facade",
    );
    expect(rec({ area: "terrace", tileTypeId: "vitrified" }).rule).toBe(
      "outdoor_or_facade",
    );
  });
});

describe("rule 4: natural stone", () => {
  it("recommends K80 below the threshold and K90 at or above it", () => {
    const { NATURAL_STONE_K90 } = SIZE_THRESHOLDS;

    expect(atMm(NATURAL_STONE_K90 - 1, { tileTypeId: "marble" }).code).toBe("K80");
    expect(atMm(NATURAL_STONE_K90, { tileTypeId: "marble" }).code).toBe("K90");
    expect(atMm(NATURAL_STONE_K90 + 1, { tileTypeId: "marble" }).code).toBe("K90");
  });

  it("applies to every stone tile type", () => {
    for (const tileTypeId of ["marble", "granite", "natural_stone"]) {
      expect(rec({ tileTypeId }).rule).toBe("natural_stone");
    }
  });
});

describe("rule 5: porcelain / vitrified ladder", () => {
  it("walks K60 -> K80 -> K90 -> KX at 600 / 800 / 1200 mm", () => {
    const { VITRIFIED_K80, VITRIFIED_K90, VITRIFIED_KX } = SIZE_THRESHOLDS;
    const vitrified = { tileTypeId: "vitrified" };

    expect(atMm(VITRIFIED_K80 - 1, vitrified).code).toBe("K60");
    expect(atMm(VITRIFIED_K80, vitrified).code).toBe("K80");
    expect(atMm(VITRIFIED_K90 - 1, vitrified).code).toBe("K80");
    expect(atMm(VITRIFIED_K90, vitrified).code).toBe("K90");
    expect(atMm(VITRIFIED_KX - 1, vitrified).code).toBe("K90");
    expect(atMm(VITRIFIED_KX, vitrified).code).toBe("KX");
  });

  it("maps realistic tile sizes through the ladder", () => {
    // 12 in = 304.8 mm, 24 in = 609.6 mm, 32 in = 812.8 mm, 48 in = 1219.2 mm
    expect(rec({ tileTypeId: "vitrified", tileSize: "12 x 12 in" }).code).toBe("K60");
    expect(rec({ tileTypeId: "vitrified", tileSize: "24 x 24 in" }).code).toBe("K80");
    expect(rec({ tileTypeId: "vitrified", tileSize: "32 x 32 in" }).code).toBe("K90");
    expect(rec({ tileTypeId: "vitrified", tileSize: "24 x 48 in" }).code).toBe("KX");
  });

  it("applies to every low-porosity tile type", () => {
    for (const tileTypeId of [
      "vitrified",
      "double_charge_vitrified",
      "full_body_vitrified",
      "glazed_vitrified",
      "porcelain",
      "large_format_slab",
    ]) {
      expect(rec({ tileTypeId }).rule).toBe("vitrified_or_porcelain");
    }
  });
});

describe("rule 6: ceramic / mosaic / glass and other bodies", () => {
  it("recommends K50 below 600 mm and K80 at or above it", () => {
    const { CERAMIC_K80 } = SIZE_THRESHOLDS;

    expect(atMm(CERAMIC_K80 - 1).code).toBe("K50");
    expect(atMm(CERAMIC_K80).code).toBe("K80");
    expect(atMm(CERAMIC_K80 + 1).code).toBe("K80");
  });

  it("handles ceramic, mosaic, glass mosaic and terracotta", () => {
    for (const tileTypeId of [
      "ceramic_wall",
      "ceramic_floor",
      "mosaic",
      "glass_mosaic",
      "terracotta",
    ]) {
      const small = rec({ tileTypeId, tileSize: "12 x 12 in" });
      const large = rec({ tileTypeId, tileSize: "24 x 24 in" });

      expect(small.code).toBe("K50");
      expect(large.code).toBe("K80");
      expect(small.rule).toBe("ceramic_or_mosaic");
    }
  });

  it("treats an unknown tile type as a standard body", () => {
    expect(rec({ tileTypeId: "something_new" }).rule).toBe("ceramic_or_mosaic");
  });
});

describe("rule 7: default", () => {
  it("falls back to K60 when there is no tile type at all", () => {
    const result = rec({ tileTypeId: "" });

    expect(result.code).toBe("K60");
    expect(result.rule).toBe("default");
  });
});

describe("unparseable sizes", () => {
  it("treats them as large format and says so", () => {
    const slab = rec({ tileTypeId: "marble", tileSize: "Slab" });

    expect(slab.code).toBe("K90"); // stone + large format
    expect(slab.sizeMm).toBeNull();
    expect(slab.reasons[0]).toContain("no numeric dimension");
    expect(slab.reasons[0]).toContain("worst case");
  });

  it("does not upgrade rules that ignore size", () => {
    expect(rec({ area: "swimming_pool", tileSize: "Random" }).code).toBe("KX");
  });
});

describe("determinism and reasons", () => {
  it("returns identical output for identical input", () => {
    const input = { tileTypeId: "vitrified", tileSize: "24 x 48 in" };

    expect(rec(input)).toEqual(rec(input));
  });

  it("always explains the size and the chosen product", () => {
    const result = rec({ tileTypeId: "vitrified", tileSize: "24 x 48 in" });

    expect(result.reasons[0]).toBe(
      "Largest dimension of '24 x 48 in' is 48 in (1219 mm).",
    );
    expect(result.reasons.at(-1)).toBe("Recommended product: KX.");
    expect(result.sizeMm).toBeCloseTo(1219.2, 5);
  });

  it("never returns a code outside the seeded product set", () => {
    const codes = new Set(
      ["concrete", "plywood", "swimming_pool_shell", "aac_block"].flatMap(
        (substrateId) =>
          ["vitrified", "marble", "mosaic", "unknown"].flatMap((tileTypeId) =>
            ["12 x 12 in", "24 x 48 in", "Slab"].flatMap((tileSize) =>
              ["living_room", "terrace", "swimming_pool"].map(
                (area) =>
                  recommendKamdhenu({ substrateId, tileTypeId, tileSize, area })
                    .code,
              ),
            ),
          ),
      ),
    );

    expect([...codes].sort()).toEqual(
      expect.arrayContaining(["K50", "K80", "K90", "KX"]),
    );
    for (const code of codes) {
      expect(["K50", "K60", "K80", "K90", "KX"]).toContain(code);
    }
  });
});
