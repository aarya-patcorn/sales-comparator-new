import { PARAM_FIELDS, type ParamKey } from "../../lib/paramFields.js";
import type { SpecSource } from "../../generated/prisma/enums.js";
import type { TechnicalParams } from "../../validation/technicalParams.js";
import { detectAdvantage, type Direction } from "./advantage.js";

export type KamdhenuColumnInput = {
  id: string;
  code: string;
  name: string;
  enClassification: string | null;
  technicalParams: TechnicalParams;
};

export type CompetitorColumnInput = {
  id: string;
  name: string;
  competitorId: string;
  competitorName: string;
  enClassification: string | null;
  specSource: SpecSource;
  technicalParams: TechnicalParams;
};

export type ComparisonColumn =
  | {
      kind: "kamdhenu";
      id: string;
      code: string;
      name: string;
      enClassification: string | null;
      /** Kamdhenu products are not TDS-extracted, so there is nothing to badge. */
      specSource: null;
    }
  | {
      kind: "competitor";
      id: string;
      name: string;
      competitorId: string;
      competitorName: string;
      enClassification: string | null;
      specSource: SpecSource;
    };

export type ComparisonRow = {
  key: ParamKey;
  label: string;
  /** Aligned with `columns`: index 0 is always Kamdhenu. */
  values: (string | null)[];
  direction: Direction;
  kamdhenuAdvantage: boolean;
  comparedCount: number;
};

export type Comparison = {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  summary: {
    competitorCount: number;
    /** Rows with at least one value on any column. */
    populatedRowCount: number;
    comparableRowCount: number;
    advantageCount: number;
    specSourceCounts: { tds_ai: number; manual: number };
  };
  talkingPoints: string[];
};

const TALKING_POINT_COUNT = 6;

/**
 * Always the last talking point. It is the one line that must never be crowded
 * out by advantage claims, so it is reserved rather than queued.
 */
const COMPARISON_CAVEAT =
  "Values are compared as printed on the datasheets; they are not test results measured under identical conditions.";

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * Six deterministic, fact-only talking points.
 *
 * These are derived purely from the datasheet values in front of us — no
 * generated marketing copy, no claims that cannot be traced back to a cell in
 * the table. (The AI pitch is a separate, clearly-labelled feature.)
 */
function buildTalkingPoints(
  kamdhenu: KamdhenuColumnInput,
  rows: ComparisonRow[],
  summary: Comparison["summary"],
): string[] {
  const points: string[] = [];

  for (const row of rows) {
    if (!row.kamdhenuAdvantage) continue;

    const direction = row.direction === "higher" ? "higher" : "lower";
    points.push(
      `${kamdhenu.code} shows a ${direction} ${row.label} (${row.values[0]}) than ${
        row.comparedCount === 1 ? "the compared product" : "all compared products"
      }.`,
    );
  }

  const facts: string[] = [];

  if (kamdhenu.enClassification) {
    facts.push(
      `${kamdhenu.code} is declared as ${kamdhenu.enClassification} on its datasheet.`,
    );
  }

  facts.push(
    `${kamdhenu.code} is compared here against ${summary.competitorCount} competitor ${
      summary.competitorCount === 1 ? "product" : "products"
    } across ${summary.populatedRowCount} published ${
      summary.populatedRowCount === 1 ? "specification" : "specifications"
    }.`,
  );

  facts.push(
    `${summary.advantageCount} of ${summary.comparableRowCount} directly comparable ${
      summary.comparableRowCount === 1 ? "specification favours" : "specifications favour"
    } ${kamdhenu.code}.`,
  );

  const sources: string[] = [];
  if (summary.specSourceCounts.tds_ai > 0) {
    sources.push(
      `${summary.specSourceCounts.tds_ai} from an uploaded technical datasheet`,
    );
  }
  if (summary.specSourceCounts.manual > 0) {
    sources.push(`${summary.specSourceCounts.manual} entered manually`);
  }
  if (sources.length > 0) {
    facts.push(`Competitor figures: ${formatList(sources)}.`);
  }

  const publishedByKamdhenu = rows.filter(
    (row) => row.values[0] !== null,
  ).length;
  facts.push(
    `${kamdhenu.code} publishes ${publishedByKamdhenu} of the ${PARAM_FIELDS.length} tracked specifications.`,
  );

  facts.push(
    "Every figure is shown exactly as recorded for that product, with its original units.",
  );

  return [
    ...[...points, ...facts].slice(0, TALKING_POINT_COUNT - 1),
    COMPARISON_CAVEAT,
  ];
}

/**
 * Builds the side-by-side table.
 *
 * Pure: all competitor data is passed in, having been read from
 * `competitor_products` (blueprint §10, defect #1 — never a static array, and
 * never an estimated value).
 */
export function buildComparison(
  kamdhenu: KamdhenuColumnInput,
  competitors: CompetitorColumnInput[],
): Comparison {
  const columns: ComparisonColumn[] = [
    {
      kind: "kamdhenu",
      id: kamdhenu.id,
      code: kamdhenu.code,
      name: kamdhenu.name,
      enClassification: kamdhenu.enClassification,
      specSource: null,
    },
    ...competitors.map(
      (competitor): ComparisonColumn => ({
        kind: "competitor",
        id: competitor.id,
        name: competitor.name,
        competitorId: competitor.competitorId,
        competitorName: competitor.competitorName,
        enClassification: competitor.enClassification,
        specSource: competitor.specSource,
      }),
    ),
  ];

  const rows: ComparisonRow[] = [];

  // PARAM_FIELDS order is the display order; a row is kept when at least one
  // product publishes that spec (the union of populated keys).
  for (const [key, label] of PARAM_FIELDS) {
    const kamdhenuValue = kamdhenu.technicalParams[key];
    const competitorValues = competitors.map(
      (competitor) => competitor.technicalParams[key],
    );
    const values = [kamdhenuValue, ...competitorValues];

    if (values.every((value) => value === null)) continue;

    const advantage = detectAdvantage(key, kamdhenuValue, competitorValues);

    rows.push({
      key,
      label,
      values,
      direction: advantage.direction,
      kamdhenuAdvantage: advantage.kamdhenuAdvantage,
      comparedCount: advantage.comparedCount,
    });
  }

  const summary: Comparison["summary"] = {
    competitorCount: competitors.length,
    populatedRowCount: rows.length,
    comparableRowCount: rows.filter((row) => row.comparedCount > 0).length,
    advantageCount: rows.filter((row) => row.kamdhenuAdvantage).length,
    specSourceCounts: {
      tds_ai: competitors.filter((c) => c.specSource === "tds_ai").length,
      manual: competitors.filter((c) => c.specSource === "manual").length,
    },
  };

  return {
    columns,
    rows,
    summary,
    talkingPoints: buildTalkingPoints(kamdhenu, rows, summary),
  };
}
