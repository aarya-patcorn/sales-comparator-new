/**
 * Numeric/unit parsing for spec strings (blueprint §10, defect #8).
 *
 * Spec values are stored exactly as printed on the datasheet — "≥ 0.5 N/mm²",
 * "0.45-0.55 N/mm²", "20-30 minutes", "< 5 g/kg", "Grey". To compare two of them
 * we need the leading number AND the unit, because comparing 2 (hours) against
 * 30 (minutes) as bare numbers is exactly the bug this replaces.
 *
 * This is a best-effort presentation aid, not a standards calculation.
 */

export type Measurement = {
  /** The leading number. For a range, the lower bound. */
  value: number;
  /** Upper bound when the value is a range ("0.45-0.55"), otherwise null. */
  rangeMax: number | null;
  /** Leading comparator, e.g. "≥" in "≥ 0.5 N/mm²". */
  comparator: "≥" | "≤" | ">" | "<" | "~" | null;
  /** Unit text exactly as written after the number ("N/mm²"). */
  unit: string | null;
  /**
   * Unit reduced to a comparable form, with time converted to minutes.
   * Two measurements are only comparable when these match.
   */
  canonicalUnit: string;
  /** `value` expressed in `canonicalUnit`. */
  canonicalValue: number;
};

const MEASUREMENT_RE =
  /^\s*(?<cmp>[≥≤<>~]|>=|<=)?\s*(?<num>-?\d+(?:[.,]\d+)?)\s*(?:(?:-|–|—|to)\s*(?<num2>-?\d+(?:[.,]\d+)?))?\s*(?<unit>.*)$/u;

/** Multipliers into minutes, so time specs compare correctly. */
const TIME_TO_MINUTES: Record<string, number> = {
  sec: 1 / 60,
  secs: 1 / 60,
  second: 1 / 60,
  seconds: 1 / 60,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  day: 1440,
  days: 1440,
};

/** Spellings that mean the same unit. */
const UNIT_ALIASES: Record<string, string> = {
  "n/mm2": "n/mm2",
  mpa: "n/mm2", // 1 MPa === 1 N/mm²
  "kg/l": "kg/l",
  "kg/ltr": "kg/l",
  "g/kg": "g/kg",
  months: "month",
  month: "month",
  years: "year",
  year: "year",
  mm: "mm",
  m2: "m2",
};

/** Lowercase, strip whitespace/punctuation noise, fold superscripts. */
export function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/[³]/g, "3")
    .replace(/\s+/g, "")
    .replace(/[.,;]+$/, "");
}

function canonicalize(unit: string | null): {
  canonicalUnit: string;
  factor: number;
} {
  if (unit === null || unit.length === 0) {
    return { canonicalUnit: "", factor: 1 };
  }

  const normalized = normalizeUnit(unit);

  const minutes = TIME_TO_MINUTES[normalized];
  if (minutes !== undefined) {
    return { canonicalUnit: "min", factor: minutes };
  }

  return { canonicalUnit: UNIT_ALIASES[normalized] ?? normalized, factor: 1 };
}

/**
 * Extracts the leading number and unit from a spec string.
 * Returns null for text-only values ("Grey") and for null/empty input.
 */
export function parseMeasurement(raw: string | null): Measurement | null {
  if (raw === null) return null;

  const match = MEASUREMENT_RE.exec(raw);
  const groups = match?.groups;
  if (!groups?.num) return null;

  const value = Number(groups.num.replace(",", "."));
  if (!Number.isFinite(value)) return null;

  const rangeMaxRaw = groups.num2;
  const rangeMax =
    rangeMaxRaw === undefined ? null : Number(rangeMaxRaw.replace(",", "."));

  const unitText = groups.unit?.trim() ?? "";
  const unit = unitText.length > 0 ? unitText : null;
  const { canonicalUnit, factor } = canonicalize(unit);

  const comparatorRaw = groups.cmp ?? null;
  const comparator =
    comparatorRaw === ">=" ? "≥" : comparatorRaw === "<=" ? "≤" : comparatorRaw;

  return {
    value,
    rangeMax: rangeMax !== null && Number.isFinite(rangeMax) ? rangeMax : null,
    comparator: comparator as Measurement["comparator"],
    unit,
    canonicalUnit,
    canonicalValue: value * factor,
  };
}

/** Two measurements can only be compared when their canonical units match. */
export function areComparable(a: Measurement, b: Measurement): boolean {
  return a.canonicalUnit === b.canonicalUnit;
}
