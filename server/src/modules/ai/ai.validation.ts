import { z } from "zod";

import { slugSchema, uuidSchema } from "../../validation/common.js";
import { PITCH_VARIANTS } from "./prompts.js";

const productCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, "must be a product code such as 'K90'");

export const pitchSchema = z
  .object({
    kamdhenuCode: productCodeSchema,
    competitorProductId: uuidSchema,
    variant: z.enum(PITCH_VARIANTS).optional(),
  })
  .strict();

export const recommendationTextSchema = z
  .object({
    kamdhenuCode: productCodeSchema,
    competitorProductIds: z
      .array(uuidSchema)
      .max(10)
      .default([])
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "competitorProductIds must be unique",
      ),
    substrateId: slugSchema.optional(),
    tileTypeId: slugSchema.optional(),
    tileSize: z.string().trim().min(1).max(64).optional(),
    area: slugSchema.optional(),
  })
  .strict();

export type PitchInput = z.infer<typeof pitchSchema>;
export type RecommendationTextInput = z.infer<typeof recommendationTextSchema>;
