import { z } from "zod";

import {
  mobileNumberSchema,
  paginationSchema,
  slugSchema,
} from "../../validation/common.js";
import { technicalParamsSchema } from "../../validation/technicalParams.js";

/** `?isActive=true` arrives as a string. */
const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const searchQuery = z.string().trim().min(1).max(120).optional();

export const listQuerySchema = paginationSchema.extend({
  search: searchQuery,
  isActive: booleanQuery.optional(),
});

export const competitorProductListQuerySchema = listQuerySchema.extend({
  competitorId: z.uuid().optional(),
});

export const statusSchema = z.object({ isActive: z.boolean() }).strict();

/** `?purge=true` turns a soft delete into a hard delete + file removal. */
export const purgeQuerySchema = z
  .object({ purge: booleanQuery.optional().default(false) })
  .strict();

// ------------------------------------------------------------------ RM users

const optionalEmail = z
  .email()
  .max(200)
  .nullish()
  .transform((value) => (value === undefined || value === "" ? null : value));

const optionalName = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((value) => (value === undefined || value === "" ? null : value));

export const createRmUserSchema = z
  .object({
    name: optionalName,
    mobileNumber: mobileNumberSchema,
    email: optionalEmail,
  })
  .strict();

export const updateRmUserSchema = z
  .object({
    name: optionalName,
    mobileNumber: mobileNumberSchema.optional(),
    email: optionalEmail,
  })
  .strict();

// --------------------------------------------------------------- admin users

export const createAdminUserSchema = z
  .object({
    email: z.email().max(200).transform((value) => value.toLowerCase()),
    name: optionalName,
  })
  .strict();

// ------------------------------------------------------------------ products

const productCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, "must be a product code such as 'K90'");

const optionalProductCodeSchema = productCodeSchema
  .nullish()
  .transform((value) => (value === undefined || value === "" ? null : value));

export const createProductSchema = z
  .object({
    code: productCodeSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish().transform((v) => v ?? null),
    enClassification: z
      .string()
      .trim()
      .max(64)
      .nullish()
      .transform((v) => (v === undefined || v === "" ? null : v)),
    applicationAreas: z.array(slugSchema).max(50).default([]),
    installationSuitability: z.array(z.enum(["indoor", "outdoor"])).max(2).default([]),
    substrateIds: z.array(slugSchema).max(50).default([]),
    tileTypeIds: z.array(slugSchema).max(50).default([]),
    tileSizes: z.array(z.string().trim().min(1).max(64)).max(100).default([]),
    technicalParams: technicalParamsSchema,
  })
  .strict();

export const updateProductSchema = createProductSchema.partial().strict();

// --------------------------------------------------------------- competitors

export const createCompetitorSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: slugSchema,
  })
  .strict();

export const updateCompetitorSchema = createCompetitorSchema.partial().strict();

// ------------------------------------------------------- competitor products

export const updateCompetitorProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    enClassification: z
      .string()
      .trim()
      .max(64)
      .nullish()
      .transform((v) => (v === undefined || v === "" ? null : v)),
    competesWith: optionalProductCodeSchema,
    technicalParams: technicalParamsSchema.optional(),
  })
  .strict();

export type ListQuery = z.infer<typeof listQuerySchema>;
