import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { coerceTechnicalParams } from "../../validation/technicalParams.js";
import { toProductDto } from "../catalog/catalog.presenter.js";
import { recommendSchema } from "./recommend.validation.js";
import { recommendKamdhenu } from "./rules.js";

/** 400 for an id that is well-formed but not in the catalog. */
function unknownReference(field: string, value: string): HttpError {
  return new HttpError(
    400,
    "unknown_reference",
    `Unknown ${field} '${value}'`,
    [{ path: field, message: "not found in the catalog" }],
  );
}

function buildReasons(input: {
  tileSize: string;
  code: string;
  rule: string;
  substrateName: string;
  tileTypeName: string;
  areaName: string;
  technicalParams: unknown;
  enClassification: string | null;
}): string[] {
  const reasons = {
    special_substrate: `Chosen for ${input.substrateName}, a challenging substrate that needs a highly deformable adhesive.`,
    pool_or_industrial: `Selected for ${input.areaName}, which demands maximum bond strength and deformability.`,
    outdoor_or_elevation: `Suited to ${input.areaName} exposure and thermal movement.`,
    natural_stone: `Matched to ${input.tileTypeName}, a heavy natural stone requiring a strong, non-slip hold.`,
    porcelain_or_vitrified: `Recommended for ${input.tileSize} ${input.tileTypeName}, where larger tiles need higher adhesion and open time.`,
    ceramic: `A good fit for ${input.tileSize} ${input.tileTypeName} in ${input.areaName}.`,
    default: `A balanced choice for ${input.tileTypeName} on ${input.substrateName}.`,
  }[input.rule] ?? `Selected for this ${input.areaName} installation.`;

  const params = coerceTechnicalParams(input.technicalParams);
  const productStrength = params.tensile_adhesion_is
    ? `${input.code} offers published initial tensile adhesion of ${params.tensile_adhesion_is}.`
    : params.open_time
      ? `${input.code} offers a published open time of ${params.open_time}.`
      : input.enClassification
        ? `${input.code} is declared as ${input.enClassification}.`
        : `${input.code} is the active product selected by the recommendation rules.`;

  return [
    reasons,
    `The selected ${input.tileSize} tile size was considered for this application.`,
    productStrength,
  ];
}

/**
 * POST /api/recommend (RM only — this was public in the old app, defect #4).
 *
 * The rule engine returns a product CODE; the code is then resolved against the
 * database. If the chosen product is missing or inactive we fail loudly instead
 * of substituting another one (blueprint §4 and defect #5).
 */
export async function postRecommend(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(recommendSchema, req.body);

  const [substrate, tileType, area] = await Promise.all([
    prisma.substrate.findUnique({
      where: { id: input.substrateId },
      select: { id: true, name: true },
    }),
    prisma.tileType.findUnique({
      where: { id: input.tileTypeId },
      select: { id: true, name: true },
    }),
    prisma.applicationArea.findFirst({
      where: { OR: [{ id: input.area }, { name: input.area }] },
      select: { id: true, name: true },
    }),
  ]);

  if (!substrate) throw unknownReference("substrateId", input.substrateId);
  if (!tileType) throw unknownReference("tileTypeId", input.tileTypeId);
  if (!area) throw unknownReference("area", input.area);

  const recommendation = recommendKamdhenu({ ...input, area: area.name });

  const product = await prisma.product.findFirst({
    where: { code: recommendation.code, isActive: true, deletedAt: null },
  });

  if (!product) {
    // Deliberately a hard failure: silently swapping in another product is how
    // the old app recommended things that had been deactivated.
    throw new HttpError(
      409,
      "recommended_product_unavailable",
      `The rules selected product '${recommendation.code}', but no active product with that code exists. Ask an administrator to restore or activate it.`,
      { code: recommendation.code },
    );
  }

  res.status(200).json({
    product: toProductDto(product),
    recommendation: {
      code: recommendation.code,
      rule: recommendation.rule,
      reasons: buildReasons({
        tileSize: input.tileSize,
        code: product.code,
        rule: recommendation.rule,
        substrateName: substrate.name,
        tileTypeName: tileType.name,
        areaName: area.name,
        technicalParams: product.technicalParams,
        enClassification: product.enClassification,
      }),
    },
  });
}
