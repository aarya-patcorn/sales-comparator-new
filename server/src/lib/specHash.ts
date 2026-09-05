import { createHash } from "node:crypto";

import { PARAM_FIELDS } from "./paramFields.js";
import type { TechnicalParams } from "../validation/technicalParams.js";

/**
 * Stable fingerprint of one or more spec sets.
 *
 * Included in every AI cache key so that editing a single parameter naturally
 * misses the cache (blueprint §10, defect #6 — the old app kept serving copy
 * written against superseded numbers). Keys are emitted in PARAM_FIELDS order,
 * so the hash does not depend on JSON key ordering.
 */
export function hashSpecs(...paramSets: TechnicalParams[]): string {
  const canonical = paramSets.map((params) =>
    PARAM_FIELDS.map(([key]) => `${key}=${params[key] ?? ""}`).join("\u0001"),
  );

  return createHash("sha256")
    .update(canonical.join("\u0002"), "utf8")
    .digest("hex")
    .slice(0, 16);
}
