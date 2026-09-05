import { z } from "zod";

import { uuidSchema } from "../../validation/common.js";
import { technicalParamsSchema } from "../../validation/technicalParams.js";

/**
 * Both creation modes post the same fields; the presence of an uploaded file is
 * what selects `spec_source`.
 *
 * `technicalParams` are the ADMIN-CONFIRMED values. Even in the AI path these
 * are what gets saved — the model's own output is stored separately in
 * `ai_raw_extraction` for audit (blueprint §3a).
 */
export const createCompetitorProductSchema = z
  .object({
    competitorId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    enClassification: z
      .string()
      .trim()
      .max(64)
      .nullish()
      .transform((value) => (value === undefined || value === "" ? null : value)),
    technicalParams: technicalParamsSchema,
  })
  .strict();

export type CreateCompetitorProductInput = z.infer<
  typeof createCompetitorProductSchema
>;

/**
 * In a multipart request every field arrives as a string, so the params object
 * is JSON-encoded by the client. Decode it before validation.
 */
export function normalizeCompetitorProductBody(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;

  const source = body as Record<string, unknown>;
  if (typeof source.technicalParams !== "string") return body;

  try {
    return { ...source, technicalParams: JSON.parse(source.technicalParams) };
  } catch {
    // Leave it as a string: zod reports it as an invalid technicalParams object.
    return body;
  }
}
