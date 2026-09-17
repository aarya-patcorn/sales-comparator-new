import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
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
      select: { id: true },
    }),
    prisma.tileType.findUnique({
      where: { id: input.tileTypeId },
      select: { id: true, sizes: { select: { sizeLabel: true } } },
    }),
    prisma.applicationArea.findUnique({
      where: { id: input.area },
      select: { id: true },
    }),
  ]);

  if (!substrate) throw unknownReference("substrateId", input.substrateId);
  if (!tileType) throw unknownReference("tileTypeId", input.tileTypeId);
  if (!area) throw unknownReference("area", input.area);

  // When the tile type has registered sizes, the label must be one of them:
  // an unrecognised label would otherwise be silently treated as large format.
  if (
    tileType.sizes.length > 0 &&
    !tileType.sizes.some((size) => size.sizeLabel === input.tileSize)
  ) {
    throw unknownReference("tileSize", input.tileSize);
  }

  const recommendation = recommendKamdhenu(input);

  const product = await prisma.product.findFirst({
    where: {
      code: recommendation.code,
      isActive: true,
      deletedAt: null,
      // Empty lists preserve eligibility for products created before applicability
      // criteria were introduced. Once configured, every selected criterion must match.
      AND: [
        { OR: [{ substrateIds: { equals: [] } }, { substrateIds: { has: input.substrateId } }] },
        { OR: [{ tileTypeIds: { equals: [] } }, { tileTypeIds: { has: input.tileTypeId } }] },
        { OR: [{ tileSizes: { equals: [] } }, { tileSizes: { has: input.tileSize } }] },
        { OR: [{ installationSuitability: { equals: [] } }, { installationSuitability: { has: input.installationSuitability } }] },
      ],
    },
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
      sizeMm: recommendation.sizeMm,
      reasons: recommendation.reasons,
    },
  });
}
