import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { hashSpecs } from "../../lib/specHash.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { coerceTechnicalParams } from "../../validation/technicalParams.js";
import { generateLetter, generatePitchLines } from "./ai.service.js";
import {
  pitchSchema,
  recommendationTextSchema,
} from "./ai.validation.js";
import {
  readPitchCache,
  readRecommendationCache,
  writePitchCache,
  writeRecommendationCache,
} from "./cache.js";
import {
  LETTER_PROMPT_VERSION,
  PITCH_PROMPT_VERSION,
  PITCH_VARIANTS,
  buildLetterFallback,
  buildPitchFallback,
  pickVariant,
  type LetterContext,
  type PitchContext,
  type PitchVariant,
} from "./prompts.js";

function unknownProduct(code: string): HttpError {
  return new HttpError(
    400,
    "unknown_reference",
    `Unknown or inactive Kamdhenu product '${code}'`,
    [{ path: "kamdhenuCode", message: "no active product with this code" }],
  );
}

/**
 * POST /api/pitch
 *
 * Cache key = product code + competitor identity + spec hash + prompt version +
 * variant. The spec hash means an admin editing one parameter invalidates the
 * copy written against the old number (defect #6).
 */
export async function postPitch(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(pitchSchema, req.body);

  const [product, competitorProduct] = await Promise.all([
    prisma.product.findFirst({
      where: { code: input.kamdhenuCode, isActive: true, deletedAt: null },
    }),
    prisma.competitorProduct.findFirst({
      where: {
        id: input.competitorProductId,
        isActive: true,
        deletedAt: null,
        competitor: { isActive: true, deletedAt: null },
      },
      include: { competitor: true },
    }),
  ]);

  if (!product) throw unknownProduct(input.kamdhenuCode);

  if (!competitorProduct) {
    throw new HttpError(
      400,
      "unknown_reference",
      `Unknown or inactive competitor product '${input.competitorProductId}'`,
      [{ path: "competitorProductId", message: "not found" }],
    );
  }

  const productParams = coerceTechnicalParams(product.technicalParams);
  const competitorParams = coerceTechnicalParams(
    competitorProduct.technicalParams,
  );

  // Rotate through the angles when the client does not pick one, so repeated
  // taps give the RM fresh material. Each variant is cached separately.
  const variant: PitchVariant =
    input.variant ??
    pickVariant(Math.floor(Math.random() * PITCH_VARIANTS.length));

  const specHash = hashSpecs(productParams, competitorParams);
  const cacheKey = [
    product.code,
    `${competitorProduct.competitor.slug}:${competitorProduct.id}`,
    specHash,
    PITCH_PROMPT_VERSION,
    variant,
  ].join("|");

  const cached = await readPitchCache(cacheKey);
  if (cached) {
    res.status(200).json({
      lines: cached.lines,
      variant,
      isFallback: cached.isFallback,
      cached: true,
    });
    return;
  }

  const context: PitchContext = {
    productCode: product.code,
    productName: product.name,
    productEnClassification: product.enClassification,
    productParams,
    competitorName: competitorProduct.competitor.name,
    competitorProductName: competitorProduct.name,
    competitorEnClassification: competitorProduct.enClassification,
    competitorParams,
    variant,
  };

  let lines: string[];
  let isFallback = false;

  try {
    lines = await generatePitchLines(context);
  } catch (error) {
    // Never fail the request: the RM is standing in front of a customer.
    logger.warn({ err: error, cacheKey }, "Pitch generation failed; using fallback");
    lines = buildPitchFallback(context);
    isFallback = true;
  }

  await writePitchCache(cacheKey, lines, isFallback);

  res.status(200).json({ lines, variant, isFallback, cached: false });
}

/**
 * POST /api/recommendation-text
 *
 * Cache key = product code + sorted competitor names + spec hash + context +
 * prompt version. Sorting the names makes selection order irrelevant.
 */
export async function postRecommendationText(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(recommendationTextSchema, req.body);

  const [product, competitorProducts] = await Promise.all([
    prisma.product.findFirst({
      where: { code: input.kamdhenuCode, isActive: true, deletedAt: null },
    }),
    input.competitorProductIds.length > 0
      ? prisma.competitorProduct.findMany({
          where: {
            id: { in: input.competitorProductIds },
            isActive: true,
            deletedAt: null,
            competitor: { isActive: true, deletedAt: null },
          },
          include: { competitor: true },
        })
      : Promise.resolve([]),
  ]);

  if (!product) throw unknownProduct(input.kamdhenuCode);

  const missing = input.competitorProductIds.filter(
    (id) => !competitorProducts.some((row) => row.id === id),
  );

  if (missing.length > 0) {
    throw new HttpError(
      400,
      "unknown_reference",
      `Unknown or inactive competitor product(s): ${missing.join(", ")}`,
      missing.map((id) => ({ path: "competitorProductIds", message: id })),
    );
  }

  const productParams = coerceTechnicalParams(product.technicalParams);
  const competitorParamSets = competitorProducts.map((row) =>
    coerceTechnicalParams(row.technicalParams),
  );

  const competitors = competitorProducts
    .map((row) => ({
      competitorName: row.competitor.name,
      productName: row.name,
    }))
    .sort((a, b) =>
      `${a.competitorName}${a.productName}`.localeCompare(
        `${b.competitorName}${b.productName}`,
      ),
    );

  const specHash = hashSpecs(productParams, ...competitorParamSets);
  const cacheKey = [
    product.code,
    competitors.map((c) => `${c.competitorName}/${c.productName}`).join(","),
    specHash,
    [
      input.substrateId ?? "",
      input.tileTypeId ?? "",
      input.tileSize ?? "",
      input.area ?? "",
    ].join("~"),
    LETTER_PROMPT_VERSION,
  ].join("|");

  const cached = await readRecommendationCache(cacheKey);
  if (cached) {
    res.status(200).json({
      content: cached.content,
      isFallback: cached.isFallback,
      cached: true,
    });
    return;
  }

  const context: LetterContext = {
    productCode: product.code,
    productName: product.name,
    productEnClassification: product.enClassification,
    productParams,
    competitors,
    substrateId: input.substrateId ?? null,
    tileTypeId: input.tileTypeId ?? null,
    tileSize: input.tileSize ?? null,
    area: input.area ?? null,
  };

  let content: string;
  let isFallback = false;

  try {
    content = await generateLetter(context);
  } catch (error) {
    logger.warn(
      { err: error, cacheKey },
      "Recommendation letter generation failed; using fallback",
    );
    content = buildLetterFallback(context);
    isFallback = true;
  }

  await writeRecommendationCache(cacheKey, content, isFallback);

  res.status(200).json({ content, isFallback, cached: false });
}
