import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { coerceTechnicalParams } from "../../validation/technicalParams.js";
import { buildComparison } from "./compare.builder.js";
import { compareSchema } from "./compare.validation.js";

/**
 * POST /api/compare (RM only — public in the old app, defect #4).
 *
 * Competitor specs are read from `competitor_products` through the FK to
 * `competitors`; there is no static competitor array anywhere in the codebase
 * (defect #1) and no estimated value is ever synthesised for a missing spec.
 */
export async function postCompare(req: Request, res: Response): Promise<void> {
  const { kamdhenuCode, competitorProductIds } = parseOrThrow(
    compareSchema,
    req.body,
  );

  const [product, competitorProducts] = await Promise.all([
    prisma.product.findFirst({
      where: { code: kamdhenuCode, isActive: true, deletedAt: null },
    }),
    prisma.competitorProduct.findMany({
      where: {
        id: { in: competitorProductIds },
        isActive: true,
        deletedAt: null,
        competitor: { isActive: true, deletedAt: null },
      },
      include: { competitor: true },
    }),
  ]);

  if (!product) {
    throw new HttpError(
      400,
      "unknown_reference",
      `Unknown or inactive Kamdhenu product '${kamdhenuCode}'`,
      [{ path: "kamdhenuCode", message: "no active product with this code" }],
    );
  }

  // Requested-but-missing ids are reported, never silently dropped: a column
  // quietly disappearing from a comparison is how the old app hid stale data.
  const found = new Map(competitorProducts.map((row) => [row.id, row]));
  const missing = competitorProductIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new HttpError(
      400,
      "unknown_reference",
      `Unknown or inactive competitor product(s): ${missing.join(", ")}`,
      missing.map((id) => ({
        path: "competitorProductIds",
        message: `'${id}' was not found, is inactive, or belongs to an inactive competitor`,
      })),
    );
  }

  // Preserve the caller's column order.
  const ordered = competitorProductIds.map((id) => {
    const row = found.get(id);
    if (!row) throw new Error(`unreachable: competitor product ${id}`);
    return row;
  });

  const comparison = buildComparison(
    {
      id: product.id,
      code: product.code,
      name: product.name,
      enClassification: product.enClassification,
      technicalParams: coerceTechnicalParams(product.technicalParams),
    },
    ordered.map((row) => ({
      id: row.id,
      name: row.name,
      competitorId: row.competitorId,
      competitorName: row.competitor.name,
      enClassification: row.enClassification,
      specSource: row.specSource,
      technicalParams: coerceTechnicalParams(row.technicalParams),
    })),
  );

  res.status(200).json(comparison);
}
