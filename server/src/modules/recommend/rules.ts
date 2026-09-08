export type RecommendInput = {
  substrateId: string;
  tileTypeId: string;
  tileSize: string;
  area: string;
};

export const SPECIAL_SUBSTRATES = new Set([
  "plywood",
  "gypsum_boards",
  "mdf",
  "metallic",
  "glass",
  "rubber_pvc_lino",
  "tile_on_tile",
]);

export const NATURAL_STONE_TILE_TYPES = new Set([
  "marble",
  "granite",
  "stone",
  "limestone",
  "travertine",
]);

export const PORCELAIN_OR_VITRIFIED_TILE_TYPES = new Set([
  "porcelain",
  "vitrified",
]);

export const CERAMIC_TILE_TYPES = new Set([
  "ceramic",
  "mosaic",
  "glass_tile",
  "cement_tile",
  "terracotta",
  "quarry",
  "vinyl",
]);

export const SPECIAL_SUBSTRATE_KX_MM = 1000;
export const OUTDOOR_KX_MM = 800;
export const NATURAL_STONE_K90_MM = 1000;
export const PORCELAIN_KX_MM = 1200;
export const PORCELAIN_K90_MM = 800;
export const PORCELAIN_K80_MM = 600;
export const CERAMIC_K80_MM = 600;

type RecommendationRule =
  | "special_substrate"
  | "pool_or_industrial"
  | "outdoor_or_elevation"
  | "natural_stone"
  | "porcelain_or_vitrified"
  | "ceramic"
  | "default";

type Recommendation = { code: string; rule: RecommendationRule };

/** Applies the source priority order to an already parsed longest dimension. */
export function recommendForLongestMm(
  { substrateId, tileTypeId, area }: RecommendInput,
  longestMm: number,
): Recommendation {
  if (SPECIAL_SUBSTRATES.has(substrateId)) {
    return {
      code: longestMm >= SPECIAL_SUBSTRATE_KX_MM ? "KX" : "K90",
      rule: "special_substrate",
    };
  }

  if (area === "Swimming Pool" || area === "Industrial Floor") {
    return { code: "KX", rule: "pool_or_industrial" };
  }

  if (area === "Outdoor / Facade" || area === "Elevation") {
    return {
      code: longestMm >= OUTDOOR_KX_MM ? "KX" : "K90",
      rule: "outdoor_or_elevation",
    };
  }

  if (NATURAL_STONE_TILE_TYPES.has(tileTypeId)) {
    return {
      code: longestMm >= NATURAL_STONE_K90_MM ? "K90" : "K80",
      rule: "natural_stone",
    };
  }

  if (PORCELAIN_OR_VITRIFIED_TILE_TYPES.has(tileTypeId)) {
    if (longestMm >= PORCELAIN_KX_MM) {
      return { code: "KX", rule: "porcelain_or_vitrified" };
    }
    if (longestMm >= PORCELAIN_K90_MM) {
      return { code: "K90", rule: "porcelain_or_vitrified" };
    }
    if (longestMm >= PORCELAIN_K80_MM) {
      return { code: "K80", rule: "porcelain_or_vitrified" };
    }
    return { code: "K60", rule: "porcelain_or_vitrified" };
  }

  if (CERAMIC_TILE_TYPES.has(tileTypeId)) {
    return {
      code: longestMm >= CERAMIC_K80_MM ? "K80" : "K50",
      rule: "ceramic",
    };
  }

  return { code: "K60", rule: "default" };
}

/** Pure port of the original recommend_kamdhenu function. */
export function recommendKamdhenuCode(input: RecommendInput): string {
  const dimensions = (input.tileSize.match(/\d+/g) ?? []).map(Number);
  const longestIn = dimensions.length > 0 ? Math.max(...dimensions) : 12;

  return recommendForLongestMm(input, longestIn * 25.4).code;
}

export function recommendKamdhenu(input: RecommendInput): Recommendation & {
  reasons: string[];
} {
  const dimensions = (input.tileSize.match(/\d+/g) ?? []).map(Number);
  const longestIn = dimensions.length > 0 ? Math.max(...dimensions) : 12;
  const longestMm = longestIn * 25.4;
  const recommendation = recommendForLongestMm(input, longestMm);

  return {
    ...recommendation,
    reasons: reasonsFor(recommendation.rule, longestMm),
  };
}

function reasonsFor(rule: RecommendationRule, longestMm: number): string[] {
  switch (rule) {
    case "special_substrate":
      return [
        longestMm >= SPECIAL_SUBSTRATE_KX_MM
          ? "Special substrate with a 1000mm or larger tile needs a highly deformable adhesive"
          : "Special substrate needs a deformable adhesive",
      ];
    case "pool_or_industrial":
      return ["Swimming pool or industrial floor requires KX"];
    case "outdoor_or_elevation":
      return [
        longestMm >= OUTDOOR_KX_MM
          ? "Outdoor or elevation installation with an 800mm or larger tile needs KX"
          : "Outdoor or elevation installation needs K90",
      ];
    case "natural_stone":
      return [
        longestMm >= NATURAL_STONE_K90_MM
          ? "Natural stone at 1000mm or larger needs K90"
          : "Natural stone needs K80",
      ];
    case "porcelain_or_vitrified":
      if (longestMm >= PORCELAIN_KX_MM) {
        return [
          "Large-format porcelain or vitrified tile (>=1200mm) needs a highly deformable adhesive",
        ];
      }
      if (longestMm >= PORCELAIN_K90_MM) {
        return ["Porcelain or vitrified tile (>=800mm) needs K90"];
      }
      if (longestMm >= PORCELAIN_K80_MM) {
        return ["Porcelain or vitrified tile (>=600mm) needs K80"];
      }
      return ["Small porcelain or vitrified tile needs K60"];
    case "ceramic":
      return [
        longestMm >= CERAMIC_K80_MM
          ? "Ceramic-type tile at 600mm or larger needs K80"
          : "Small ceramic-type tile needs K50",
      ];
    case "default":
      return ["No specific rule matched, so K60 is recommended"];
  }
}
