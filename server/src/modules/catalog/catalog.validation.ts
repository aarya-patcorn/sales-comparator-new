import { z } from "zod";

import { slugSchema } from "../../validation/common.js";

/**
 * GET /api/catalog/tile-types?substrate_id=concrete
 *
 * Strict: a typo such as `substrateId` would otherwise silently return the whole
 * catalog instead of the substrate's subset.
 */
export const tileTypesQuerySchema = z
  .object({
    substrate_id: slugSchema.optional(),
  })
  .strict();

export type TileTypesQuery = z.infer<typeof tileTypesQuerySchema>;

export const competitorsQuerySchema = z
  .object({
    competes_with: z.enum(["K50", "K60", "K80", "K90", "KX"]).optional(),
  })
  .strict();
