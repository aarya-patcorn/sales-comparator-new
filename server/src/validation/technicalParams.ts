import { z } from "zod";

import { PARAM_FIELDS, type ParamKey } from "../lib/paramFields.js";

/**
 * Every canonical spec is a string kept exactly as printed on the sheet (ranges,
 * `≥`/`≤` and units preserved). A spec that is absent from the sheet is `null`.
 *
 * The same shape is handed to the OpenAI structured-output call, which forces the
 * model to return exactly these 20 keys.
 */
type TechnicalParamsShape = {
  [K in ParamKey]: z.ZodNullable<z.ZodString>;
};

const shape = Object.fromEntries(
  PARAM_FIELDS.map(([key]) => [key, z.string().nullable()]),
) as TechnicalParamsShape;

/** All 20 keys required; values are `string | null`; unknown keys are rejected. */
export const technicalParamsSchema = z.object(shape).strict();

export type TechnicalParams = z.infer<typeof technicalParamsSchema>;

/** A blank spec set — every canonical key present and null. */
export function emptyParams(): TechnicalParams {
  return Object.fromEntries(
    PARAM_FIELDS.map(([key]) => [key, null]),
  ) as TechnicalParams;
}

/**
 * Lenient variant for AI output and partial admin edits: unknown keys are still
 * rejected, but missing keys are filled in as null rather than failing.
 */
export const partialTechnicalParamsSchema = technicalParamsSchema
  .partial()
  .transform((value) => ({ ...emptyParams(), ...value }) as TechnicalParams);

/**
 * Tolerant reader for values already stored in the `technical_params` JSONB
 * column.
 *
 * Read paths must never 500 because a row predates a field rename: unknown keys
 * are dropped and missing ones become null, so the API always returns exactly
 * the 20 canonical keys and the comparison columns line up.
 */
export function coerceTechnicalParams(value: unknown): TechnicalParams {
  const source =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const result = emptyParams();

  for (const [key] of PARAM_FIELDS) {
    const raw = source[key];
    if (typeof raw === "string") {
      result[key] = raw;
    }
  }

  return result;
}
