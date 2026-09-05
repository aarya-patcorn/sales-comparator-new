import { z } from "zod";

import { uuidSchema } from "../../validation/common.js";

export const compareSchema = z
  .object({
    kamdhenuCode: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "must be a product code such as 'K90'"),
    competitorProductIds: z
      .array(uuidSchema)
      .min(1, "select at least one competitor product")
      .max(10, "at most 10 competitor products can be compared")
      // Duplicates would render duplicate columns.
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "competitorProductIds must be unique",
      ),
  })
  .strict();

export type CompareInput = z.infer<typeof compareSchema>;
