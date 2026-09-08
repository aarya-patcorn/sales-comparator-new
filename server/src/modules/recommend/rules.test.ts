import { describe, expect, it } from "vitest";

import {
  recommendForLongestMm,
  recommendKamdhenuCode,
  type RecommendInput,
} from "./rules.js";

const baseInput: RecommendInput = {
  substrateId: "concrete",
  tileTypeId: "ceramic",
  tileSize: "12 x 12 in",
  area: "Living Room",
};

function atMm(longestMm: number, overrides: Partial<RecommendInput> = {}) {
  return recommendForLongestMm({ ...baseInput, ...overrides }, longestMm).code;
}

describe("recommendKamdhenuCode", () => {
  it("uses the longest integer dimension in inches", () => {
    expect(recommendKamdhenuCode({ ...baseInput, tileTypeId: "vitrified", tileSize: "24 x 48 in" })).toBe("KX");
  });

  it("uses 12 inches when tileSize has no digits", () => {
    expect(recommendKamdhenuCode({ ...baseInput, tileSize: "Slab" })).toBe("K50");
  });

  it("uses K90 below and KX at the special substrate threshold", () => {
    expect(atMm(999, { substrateId: "plywood" })).toBe("K90");
    expect(atMm(1000, { substrateId: "plywood" })).toBe("KX");
  });

  it("always uses KX for swimming pools and industrial floors", () => {
    expect(atMm(1, { area: "Swimming Pool" })).toBe("KX");
    expect(atMm(1, { area: "Industrial Floor" })).toBe("KX");
  });

  it("uses K90 at 799mm and KX at 800mm outdoors", () => {
    expect(atMm(799, { area: "Outdoor / Facade" })).toBe("K90");
    expect(atMm(800, { area: "Outdoor / Facade" })).toBe("KX");
  });

  it("uses K80 at 999mm and K90 at 1000mm for natural stone", () => {
    expect(atMm(999, { tileTypeId: "marble" })).toBe("K80");
    expect(atMm(1000, { tileTypeId: "marble" })).toBe("K90");
  });

  it("uses the porcelain and vitrified threshold ladder", () => {
    for (const tileTypeId of ["porcelain", "vitrified"]) {
      expect(atMm(599, { tileTypeId })).toBe("K60");
      expect(atMm(600, { tileTypeId })).toBe("K80");
      expect(atMm(799, { tileTypeId })).toBe("K80");
      expect(atMm(800, { tileTypeId })).toBe("K90");
      expect(atMm(1199, { tileTypeId })).toBe("K90");
      expect(atMm(1200, { tileTypeId })).toBe("KX");
    }
  });

  it("uses K50 at 599mm and K80 at 600mm for ceramic-type tiles", () => {
    expect(atMm(599)).toBe("K50");
    expect(atMm(600)).toBe("K80");
  });

  it("uses K60 when no rule matches", () => {
    expect(atMm(1, { tileTypeId: "unknown" })).toBe("K60");
  });
});
