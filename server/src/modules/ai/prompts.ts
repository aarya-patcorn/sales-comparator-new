import { PARAM_LABELS, type ParamKey } from "../../lib/paramFields.js";
import type { TechnicalParams } from "../../validation/technicalParams.js";
import { detectAdvantage } from "../compare/advantage.js";

/**
 * Bump when the wording or output contract changes: the version is part of the
 * cache key, so old copy is retired automatically.
 */
export const PITCH_PROMPT_VERSION = "pitch-v2";
export const LETTER_PROMPT_VERSION = "letter-v1";

export const PITCH_VARIANTS = [
  "general",
  "durability",
  "safety_economics",
  "large_format_facade",
  "standards",
] as const;

export type PitchVariant = (typeof PITCH_VARIANTS)[number];

const VARIANT_BRIEF: Record<PitchVariant, string> = {
  general: "the overall technical fit for the job in hand",
  durability: "long-term durability: bond retention after water, heat and freeze-thaw exposure",
  safety_economics: "site safety and economics: coverage per bag, VOC content and wastage",
  large_format_facade: "large-format tiles, facades and vertical work where deformability matters",
  standards: "declared classifications and the tested parameters behind them",
};

/** Deterministic variant rotation when the client does not pick one. */
export function pickVariant(index: number): PitchVariant {
  const variant = PITCH_VARIANTS[index % PITCH_VARIANTS.length];
  return variant ?? "general";
}

export type PitchContext = {
  productCode: string;
  productName: string;
  productEnClassification: string | null;
  productParams: TechnicalParams;
  competitorName: string;
  competitorProductName: string;
  competitorEnClassification: string | null;
  competitorParams: TechnicalParams;
  variant: PitchVariant;
};

/**
 * Guardrails shared by both AI features.
 *
 * The model may only restate figures it is given. Inventing a number that ends
 * up in a customer conversation is the worst failure mode here, so it is
 * forbidden explicitly rather than left implicit.
 */
const SHARED_RULES = [
  "Use ONLY the datasheet values supplied below. Never invent, estimate, round or convert a figure.",
  "If a parameter is null it was not published: do not mention it, and never imply the competitor lacks the property.",
  "Do not claim compliance, certification, approval or test results that are not in the supplied data.",
  "Do not disparage the competitor. Compare published figures factually.",
  "Write in plain professional English for an Indian construction market.",
];

function paramLines(params: TechnicalParams): string {
  const lines = (Object.keys(params) as ParamKey[])
    .filter((key) => params[key] !== null)
    .map((key) => `  - ${PARAM_LABELS[key]}: ${params[key]}`);

  return lines.length > 0 ? lines.join("\n") : "  (no published values)";
}

export function buildPitchPrompt(context: PitchContext): {
  instructions: string;
  input: string;
} {
  const instructions = [
    "You write short factual sales talking points for Kamdhenu tile-adhesive sales representatives.",
    ...SHARED_RULES,
    "Return at most 3 lines. Each line must be one sentence of at most 22 words.",
    "Each line must be usable verbatim in conversation with a customer.",
    "Focus every line on the requested angle; do not use generic talking points from another angle.",
  ].join("\n");

  const input = [
    `Angle for this set of lines: ${VARIANT_BRIEF[context.variant]}.`,
    "",
    `Kamdhenu product: ${context.productCode} — ${context.productName}` +
      (context.productEnClassification
        ? ` (declared ${context.productEnClassification})`
        : ""),
    paramLines(context.productParams),
    "",
    `Competitor product: ${context.competitorProductName} by ${context.competitorName}` +
      (context.competitorEnClassification
        ? ` (declared ${context.competitorEnClassification})`
        : ""),
    paramLines(context.competitorParams),
  ].join("\n");

  return { instructions, input };
}

/**
 * Deterministic, data-only lines used when OpenAI is unavailable.
 * Every sentence is traceable to a value in the database.
 */
export function buildPitchFallback(context: PitchContext): string[] {
  const lines: string[] = [
    `Focus this discussion on ${VARIANT_BRIEF[context.variant]}.`,
  ];

  const advantageKeys = (Object.keys(context.productParams) as ParamKey[]).filter(
    (key) =>
      detectAdvantage(key, context.productParams[key], [
        context.competitorParams[key],
      ]).kamdhenuAdvantage,
  );

  for (const key of advantageKeys.slice(0, 2)) {
    lines.push(
      `${context.productCode} publishes ${PARAM_LABELS[key]} of ${context.productParams[key]}, against ${context.competitorParams[key]} for ${context.competitorProductName}.`,
    );
  }

  if (lines.length < 3 && context.productEnClassification) {
    lines.push(
      `${context.productCode} is declared as ${context.productEnClassification} on its datasheet.`,
    );
  }

  if (lines.length < 3) {
    lines.push(
      `Compare ${context.productCode} against ${context.competitorProductName} on the specification sheet — every figure shown is taken from the published datasheets.`,
    );
  }

  if (lines.length < 3) {
    lines.push(
      `${context.productCode} and ${context.competitorProductName} should be reviewed against their published technical specifications.`,
    );
  }

  return lines.slice(0, 3);
}

export type LetterContext = {
  productCode: string;
  productName: string;
  productEnClassification: string | null;
  productParams: TechnicalParams;
  competitors: { competitorName: string; productName: string }[];
  substrateId: string | null;
  tileTypeId: string | null;
  tileSize: string | null;
  area: string | null;
};

const SIGN_OFF = "Kamdhenu Technical Team";

function contextLines(context: LetterContext): string {
  const parts = [
    context.substrateId ? `substrate: ${context.substrateId}` : null,
    context.tileTypeId ? `tile type: ${context.tileTypeId}` : null,
    context.tileSize ? `tile size: ${context.tileSize}` : null,
    context.area ? `application area: ${context.area}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(", ") : "not specified";
}

export function buildLetterPrompt(context: LetterContext): {
  instructions: string;
  input: string;
} {
  const instructions = [
    "You write short technical recommendation letters for the Kamdhenu Technical Team.",
    ...SHARED_RULES,
    "Structure: exactly 3 paragraphs, 200-280 words in total.",
    "Paragraph 1: the application and why this product suits it.",
    "Paragraph 2: the supporting published parameters.",
    "Paragraph 3: practical guidance and a closing offer of technical support.",
    `End with the sign-off line exactly: "${SIGN_OFF}".`,
    "Do not add a subject line, letterhead, date or recipient address.",
  ].join("\n");

  const input = [
    `Application context: ${contextLines(context)}.`,
    "",
    `Recommended product: ${context.productCode} — ${context.productName}` +
      (context.productEnClassification
        ? ` (declared ${context.productEnClassification})`
        : ""),
    paramLines(context.productParams),
    "",
    context.competitors.length > 0
      ? `Products under consideration by the customer: ${context.competitors
          .map((c) => `${c.productName} (${c.competitorName})`)
          .join(", ")}.`
      : "No competitor products were selected.",
  ].join("\n");

  return { instructions, input };
}

/** Deterministic, data-only letter used when OpenAI is unavailable. */
export function buildLetterFallback(context: LetterContext): string {
  const published = (Object.keys(context.productParams) as ParamKey[])
    .filter((key) => context.productParams[key] !== null)
    .slice(0, 5)
    .map((key) => `${PARAM_LABELS[key]} ${context.productParams[key]}`);

  const applicationSentence =
    contextLines(context) === "not specified"
      ? `We have reviewed the requirement and recommend ${context.productCode} (${context.productName}).`
      : `We have reviewed the requirement (${contextLines(context)}) and recommend ${context.productCode} (${context.productName}).`;

  const paragraph1 = [
    applicationSentence,
    context.productEnClassification
      ? `This product is declared as ${context.productEnClassification} on its technical datasheet.`
      : "",
    context.competitors.length > 0
      ? `It has been compared against ${context.competitors
          .map((c) => `${c.productName} (${c.competitorName})`)
          .join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const paragraph2 =
    published.length > 0
      ? `The recommendation is based on the published datasheet values for ${context.productCode}, including ${published.join("; ")}. All figures are quoted exactly as published and have not been converted or rounded.`
      : `The published datasheet for ${context.productCode} should be consulted for the full parameter set; no values are reproduced here that are not on the sheet.`;

  const paragraph3 =
    "Please follow the mixing, application and curing instructions on the product datasheet, and confirm substrate preparation before work begins. Our technical team is available to review site conditions and to provide application support on request.";

  return `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}\n\n${SIGN_OFF}`;
}
