/**
 * Kamdhenu recommendation engine (blueprint §4).
 *
 * A pure, deterministic function: same input -> same code and same reason
 * strings, with no database or I/O. Product resolution happens in the
 * controller, which reads the DB — there is no static product fallback here
 * (blueprint §10, defect #5).
 *
 * =============================================================================
 * TODO — CONFIRM AGAINST THE ORIGINAL `seed_data.py`
 * -----------------------------------------------------------------------------
 * The priority order and the mm thresholds below are ported exactly as
 * specified. What could NOT be sourced is the *membership* of each category —
 * the original docs were not available in this repo. The id sets below are
 * derived from the placeholder catalog in src/db/seed.ts and must be reconciled
 * with the source app together with the catalog slugs:
 *   1. DIFFICULT_SUBSTRATES   (flexible / deforming substrates)
 *   2. POOL_SUBSTRATES / POOL_AREAS
 *   3. OUTDOOR_AREAS
 *   4. NATURAL_STONE_TILE_TYPES
 *   5. VITRIFIED_TILE_TYPES
 * Everything else falls through to the ceramic/mosaic branch, so a missing id
 * degrades to a weaker adhesive — worth double-checking.
 * =============================================================================
 */

// ------------------------------------------------------------------ constants

export const MM_PER_INCH = 25.4;

/** Size thresholds, in millimetres, from the source rule set. */
export const SIZE_THRESHOLDS = Object.freeze({
  /** Difficult substrate: at or above this, step up from K90 to KX. */
  DIFFICULT_SUBSTRATE_KX: 1000,
  /** Outdoor / facade: at or above this, step up from K90 to KX. */
  OUTDOOR_KX: 800,
  /** Natural stone: at or above this, step up from K80 to K90. */
  NATURAL_STONE_K90: 1000,
  /** Porcelain / vitrified ladder. */
  VITRIFIED_K80: 600,
  VITRIFIED_K90: 800,
  VITRIFIED_KX: 1200,
  /** Ceramic / mosaic / glass: below this K50, otherwise K80. */
  CERAMIC_K80: 600,
});

export const PRODUCT_CODES = ["K50", "K60", "K80", "K90", "KX"] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];

/** TODO: confirm — flexible or otherwise deforming substrates. */
export const DIFFICULT_SUBSTRATES: ReadonlySet<string> = new Set([
  "plywood",
  "metal",
  "glass",
  "gypsum_board",
  "gypsum_plaster",
  "cement_board",
  "existing_tile",
  "waterproofing_membrane",
]);

/** TODO: confirm — permanently immersed / industrial duty. */
export const POOL_SUBSTRATES: ReadonlySet<string> = new Set([
  "swimming_pool_shell",
]);
export const POOL_AREAS: ReadonlySet<string> = new Set([
  "swimming_pool",
  "industrial",
]);

/** TODO: confirm — exposed to weather. */
export const OUTDOOR_AREAS: ReadonlySet<string> = new Set([
  "exterior_facade",
  "terrace",
  "balcony",
]);

/** TODO: confirm — natural stone is moisture sensitive. */
export const NATURAL_STONE_TILE_TYPES: ReadonlySet<string> = new Set([
  "marble",
  "granite",
  "natural_stone",
]);

/** TODO: confirm — low-porosity bodies needing a stronger bond. */
export const VITRIFIED_TILE_TYPES: ReadonlySet<string> = new Set([
  "vitrified",
  "double_charge_vitrified",
  "full_body_vitrified",
  "glazed_vitrified",
  "porcelain",
  "large_format_slab",
]);

// ---------------------------------------------------------------------- types

export type RecommendationRule =
  | "difficult_substrate"
  | "pool_or_industrial"
  | "outdoor_or_facade"
  | "natural_stone"
  | "vitrified_or_porcelain"
  | "ceramic_or_mosaic"
  | "default";

export type RecommendInput = {
  substrateId: string;
  tileTypeId: string;
  tileSize: string;
  area: string;
};

export type Recommendation = {
  code: ProductCode;
  rule: RecommendationRule;
  /** Largest parsed dimension in millimetres; null when the label has no digits. */
  sizeMm: number | null;
  reasons: string[];
};

// -------------------------------------------------------------- size parsing

export type ParsedSize = {
  /** Every integer found in the label, in order. */
  dimensionsIn: number[];
  largestIn: number | null;
  sizeMm: number | null;
};

/**
 * Parses a size label such as "24 x 48 in" or "12 x 12 in sheet".
 *
 * Per the source rule: take every integer in the string, treat the largest as
 * inches, and convert to millimetres.
 */
export function parseTileSize(label: string): ParsedSize {
  const dimensionsIn = (label.match(/\d+/g) ?? []).map(Number);

  if (dimensionsIn.length === 0) {
    return { dimensionsIn, largestIn: null, sizeMm: null };
  }

  const largestIn = Math.max(...dimensionsIn);
  return {
    dimensionsIn,
    largestIn,
    sizeMm: largestIn * MM_PER_INCH,
  };
}

/**
 * Non-numeric labels ("Slab", "Random") carry no dimension to threshold on.
 *
 * They are treated as large-format — the worst case — because under-speccing an
 * adhesive makes tiles fail, while over-speccing only costs money. The decision
 * is always surfaced in `reasons` so the RM can see it.
 */
const UNPARSEABLE_SIZE_MM = Number.POSITIVE_INFINITY;

// ------------------------------------------------------------------- engine

function atLeast(sizeMm: number, threshold: number): boolean {
  return sizeMm >= threshold;
}

/**
 * The threshold ladder, split out so tests can probe exact millimetre
 * boundaries that no whole-inch tile size can land on.
 */
export function recommendForSizeMm(
  input: RecommendInput,
  sizeMm: number,
  reasons: string[],
): { code: ProductCode; rule: RecommendationRule } {
  const { substrateId, tileTypeId, area } = input;

  // 1. Difficult / flexible substrates.
  if (DIFFICULT_SUBSTRATES.has(substrateId)) {
    reasons.push(
      `Substrate '${substrateId}' is flexible or difficult, so a deformable adhesive is required.`,
    );

    if (atLeast(sizeMm, SIZE_THRESHOLDS.DIFFICULT_SUBSTRATE_KX)) {
      reasons.push(
        `Tile is at least ${SIZE_THRESHOLDS.DIFFICULT_SUBSTRATE_KX} mm on a difficult substrate, which needs the highly deformable grade.`,
      );
      return { code: "KX", rule: "difficult_substrate" };
    }
    return { code: "K90", rule: "difficult_substrate" };
  }

  // 2. Swimming pools and industrial duty.
  if (POOL_SUBSTRATES.has(substrateId) || POOL_AREAS.has(area)) {
    reasons.push(
      "Permanently wet or industrial duty requires the highest performance grade.",
    );
    return { code: "KX", rule: "pool_or_industrial" };
  }

  // 3. Outdoor and facade.
  if (OUTDOOR_AREAS.has(area)) {
    reasons.push(
      `Area '${area}' is exposed to weather and thermal movement.`,
    );

    if (atLeast(sizeMm, SIZE_THRESHOLDS.OUTDOOR_KX)) {
      reasons.push(
        `Tile is at least ${SIZE_THRESHOLDS.OUTDOOR_KX} mm outdoors, which needs the highly deformable grade.`,
      );
      return { code: "KX", rule: "outdoor_or_facade" };
    }
    return { code: "K90", rule: "outdoor_or_facade" };
  }

  // 4. Natural stone.
  if (NATURAL_STONE_TILE_TYPES.has(tileTypeId)) {
    reasons.push(
      `Tile type '${tileTypeId}' is natural stone and is sensitive to moisture and movement.`,
    );

    if (atLeast(sizeMm, SIZE_THRESHOLDS.NATURAL_STONE_K90)) {
      reasons.push(
        `Tile is at least ${SIZE_THRESHOLDS.NATURAL_STONE_K90} mm, which needs the deformable grade.`,
      );
      return { code: "K90", rule: "natural_stone" };
    }
    return { code: "K80", rule: "natural_stone" };
  }

  // 5. Porcelain / vitrified ladder.
  if (VITRIFIED_TILE_TYPES.has(tileTypeId)) {
    reasons.push(
      `Tile type '${tileTypeId}' has low porosity and needs a stronger bond.`,
    );

    if (atLeast(sizeMm, SIZE_THRESHOLDS.VITRIFIED_KX)) {
      reasons.push(
        `Tile is at least ${SIZE_THRESHOLDS.VITRIFIED_KX} mm, which is large format.`,
      );
      return { code: "KX", rule: "vitrified_or_porcelain" };
    }
    if (atLeast(sizeMm, SIZE_THRESHOLDS.VITRIFIED_K90)) {
      reasons.push(`Tile is at least ${SIZE_THRESHOLDS.VITRIFIED_K90} mm.`);
      return { code: "K90", rule: "vitrified_or_porcelain" };
    }
    if (atLeast(sizeMm, SIZE_THRESHOLDS.VITRIFIED_K80)) {
      reasons.push(`Tile is at least ${SIZE_THRESHOLDS.VITRIFIED_K80} mm.`);
      return { code: "K80", rule: "vitrified_or_porcelain" };
    }
    reasons.push(`Tile is under ${SIZE_THRESHOLDS.VITRIFIED_K80} mm.`);
    return { code: "K60", rule: "vitrified_or_porcelain" };
  }

  // 6. Ceramic, mosaic, glass mosaic, terracotta and anything else known.
  if (tileTypeId.length > 0) {
    if (atLeast(sizeMm, SIZE_THRESHOLDS.CERAMIC_K80)) {
      reasons.push(
        `Tile is at least ${SIZE_THRESHOLDS.CERAMIC_K80} mm for a standard tile body.`,
      );
      return { code: "K80", rule: "ceramic_or_mosaic" };
    }
    reasons.push(
      `Standard tile body under ${SIZE_THRESHOLDS.CERAMIC_K80} mm.`,
    );
    return { code: "K50", rule: "ceramic_or_mosaic" };
  }

  // 7. Nothing matched.
  reasons.push("No specific rule matched; using the general-purpose grade.");
  return { code: "K60", rule: "default" };
}

/**
 * Resolves a product CODE (not a product row) plus the reasoning behind it.
 * The caller must look the code up in the database.
 */
export function recommendKamdhenu(input: RecommendInput): Recommendation {
  const parsed = parseTileSize(input.tileSize);
  const reasons: string[] = [];

  if (parsed.sizeMm === null) {
    reasons.push(
      `Tile size '${input.tileSize}' contains no numeric dimension, so it is treated as large format (worst case).`,
    );
  } else {
    reasons.push(
      `Largest dimension of '${input.tileSize}' is ${parsed.largestIn} in (${Math.round(parsed.sizeMm)} mm).`,
    );
  }

  const effectiveSizeMm = parsed.sizeMm ?? UNPARSEABLE_SIZE_MM;
  const { code, rule } = recommendForSizeMm(input, effectiveSizeMm, reasons);

  reasons.push(`Recommended product: ${code}.`);

  return { code, rule, sizeMm: parsed.sizeMm, reasons };
}
