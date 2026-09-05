import { z } from "zod";

import { slugSchema } from "../../validation/common.js";

/**
 * POST /api/recommend
 *
 * Ids are checked for shape here and for existence in the controller, which
 * resolves them against the catalog tables.
 */
export const recommendSchema = z
  .object({
    substrateId: slugSchema,
    tileTypeId: slugSchema,
    tileSize: z.string().trim().min(1, "tileSize is required").max(64),
    area: slugSchema,
  })
  .strict();

export type RecommendInputBody = z.infer<typeof recommendSchema>;
