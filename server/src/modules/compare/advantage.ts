import type { ParamKey } from "../../lib/paramFields.js";
import {
  areComparable,
  parseMeasurement,
  type Measurement,
} from "../../lib/units.js";

/**
 * Which direction is "better" for each canonical parameter.
 *
 * ============================ IMPORTANT ============================
 * This is a PRESENTATION HINT, not a standards calculation.
 *
 * A green tick here means "this printed number is larger/smaller than the
 * competitor's printed number in the same unit". It does NOT mean the product
 * conforms to, or outperforms another product under, EN 12004 / IS 15477:
 *   - datasheet figures are typically minimum declared values, not measured
 *     results, and are obtained under each manufacturer's own conditions;
 *   - "≥ 1.0" and "1.0-1.2" are not the same claim;
 *   - many parameters are trade-offs, not scales (see the neutral entries).
 * Anything customer-facing must be framed as a datasheet comparison.
 *
 * TODO: confirm every direction below with the technical team. The safe default
 * for a genuinely ambiguous parameter is "neutral" — a wrong tick in a sales
 * conversation is far more costly than a missing one.
 * ===================================================================
 */
export type Direction = "higher" | "lower" | "neutral";

export const PARAM_DIRECTION: Readonly<Record<ParamKey, Direction>> =
  Object.freeze({
    // Workability windows: longer is not automatically better (a long open time
    // can mean a slower set), so they stay neutral.
    open_time: "neutral",
    pot_life: "neutral",
    adjustability_time: "neutral",

    // Bond strengths: unambiguously higher-is-better.
    tensile_adhesion_is: "higher",
    tensile_adhesion_water: "higher",
    tensile_adhesion_heat: "higher",
    tensile_adhesion_freeze_thaw: "higher",
    shear_adhesion_dry: "higher",
    shear_adhesion_wet: "higher",

    // Slip is measured as displacement in mm: less slip is better.
    slip_resistance: "lower",

    // Mixing ratio and density are formulation facts, not a scale.
    mixing_ratio: "neutral",
    mixed_density: "neutral",

    // More area per bag is better value.
    coverage: "higher",

    // Faster setting is a trade-off against working time.
    setting_time: "neutral",
    // A wider usable bed range is better, but a single parsed number cannot
    // express that, so no claim is made.
    adhesive_thickness: "neutral",
    application_temp: "neutral",

    // Lower emissions are better.
    voc_content: "lower",

    // Longer storage life is better.
    shelf_life: "higher",

    packaging: "neutral",
    color: "neutral",
  });

export type AdvantageResult = {
  direction: Direction;
  /** True only when Kamdhenu strictly beats every comparable competitor value. */
  kamdhenuAdvantage: boolean;
  /** How many competitor values could actually be compared. */
  comparedCount: number;
};

function isBetter(
  kamdhenu: Measurement,
  competitor: Measurement,
  direction: Direction,
): boolean {
  if (direction === "higher") {
    return kamdhenu.canonicalValue > competitor.canonicalValue;
  }
  if (direction === "lower") {
    return kamdhenu.canonicalValue < competitor.canonicalValue;
  }
  return false;
}

/**
 * Decides whether the Kamdhenu value beats every competitor value for one
 * parameter.
 *
 * No advantage is claimed when: the parameter is neutral, either side is
 * null/unparseable, or the units are not comparable.
 */
export function detectAdvantage(
  key: ParamKey,
  kamdhenuValue: string | null,
  competitorValues: (string | null)[],
): AdvantageResult {
  const direction = PARAM_DIRECTION[key];

  if (direction === "neutral") {
    return { direction, kamdhenuAdvantage: false, comparedCount: 0 };
  }

  const kamdhenu = parseMeasurement(kamdhenuValue);
  if (!kamdhenu) {
    return { direction, kamdhenuAdvantage: false, comparedCount: 0 };
  }

  let comparedCount = 0;
  let betterThanAll = true;

  for (const raw of competitorValues) {
    const competitor = parseMeasurement(raw);
    if (!competitor || !areComparable(kamdhenu, competitor)) continue;

    comparedCount += 1;
    if (!isBetter(kamdhenu, competitor, direction)) betterThanAll = false;
  }

  return {
    direction,
    kamdhenuAdvantage: comparedCount > 0 && betterThanAll,
    comparedCount,
  };
}
