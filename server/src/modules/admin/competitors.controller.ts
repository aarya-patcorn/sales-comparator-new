import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import type { Competitor, CompetitorProduct } from "../../generated/prisma/client.js";
import { getSignedUrl, remove as removeFile } from "../../lib/fileStorage.js";
import { logger } from "../../lib/logger.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { omitUndefined } from "../../lib/objects.js";
import { toSkipTake, uuidSchema } from "../../validation/common.js";
import { invalidateAiCaches } from "../ai/cache.js";
import {
  paginationMeta,
  toAdminCompetitorDto,
  toAdminCompetitorProductDto,
} from "./admin.presenter.js";
import {
  competitorProductListQuerySchema,
  createCompetitorSchema,
  listQuerySchema,
  purgeQuerySchema,
  statusSchema,
  updateCompetitorProductSchema,
  updateCompetitorSchema,
} from "./admin.validation.js";

async function findCompetitorOr404(id: string): Promise<Competitor> {
  const competitor = await prisma.competitor.findFirst({
    where: { id, deletedAt: null },
  });

  if (!competitor) throw HttpError.notFound(`No competitor with id '${id}'`);
  return competitor;
}

async function findCompetitorProductOr404(
  id: string,
): Promise<CompetitorProduct & { competitor: Competitor }> {
  const row = await prisma.competitorProduct.findFirst({
    where: { id, deletedAt: null },
    include: { competitor: true },
  });

  if (!row) throw HttpError.notFound(`No competitor product with id '${id}'`);
  return row;
}

function letterLabel(competitorName: string, productName: string): string {
  return `${competitorName}/${productName}`;
}

// --------------------------------------------------------------- competitors

/** GET /api/admin/competitors */
export async function listCompetitors(
  req: Request,
  res: Response,
): Promise<void> {
  const query = parseOrThrow(listQuerySchema, req.query);

  const where = {
    deletedAt: null,
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { slug: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.competitor.findMany({
      where,
      orderBy: [{ name: "asc" }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      ...toSkipTake(query),
    }),
    prisma.competitor.count({ where }),
  ]);

  res.status(200).json({
    competitors: rows.map(toAdminCompetitorDto),
    pagination: paginationMeta(query.page, query.pageSize, total),
  });
}

/** POST /api/admin/competitors */
export async function createCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(createCompetitorSchema, req.body);

  const clash = await prisma.competitor.findFirst({
    where: { slug: input.slug, deletedAt: null },
    select: { id: true },
  });

  if (clash) {
    throw new HttpError(
      409,
      "duplicate_competitor_slug",
      `An active competitor with slug '${input.slug}' already exists`,
    );
  }

  const competitor = await prisma.competitor.create({ data: input });

  res.status(201).json({ competitor: toAdminCompetitorDto(competitor) });
}

/** PUT /api/admin/competitors/:id */
export async function updateCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(updateCompetitorSchema, req.body);

  const existing = await findCompetitorOr404(id);

  if (input.slug && input.slug !== existing.slug) {
    const clash = await prisma.competitor.findFirst({
      where: { slug: input.slug, deletedAt: null, NOT: { id } },
      select: { id: true },
    });

    if (clash) {
      throw new HttpError(
        409,
        "duplicate_competitor_slug",
        `An active competitor with slug '${input.slug}' already exists`,
      );
    }
  }

  const competitor = await prisma.competitor.update({
    where: { id },
    data: omitUndefined(input),
  });

  // Letter cache keys embed the competitor's display name.
  if (input.name && input.name !== existing.name) {
    const products = await prisma.competitorProduct.findMany({
      where: { competitorId: id, deletedAt: null },
      select: { name: true },
    });

    await invalidateAiCaches({
      competitorProductLabels: products.flatMap((product) => [
        letterLabel(existing.name, product.name),
        letterLabel(competitor.name, product.name),
      ]),
    });
  }

  res.status(200).json({ competitor: toAdminCompetitorDto(competitor) });
}

/**
 * PATCH /api/admin/competitors/:id/status
 * Status cascades to the competitor's products so nothing is left orphaned.
 */
export async function setCompetitorStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const { isActive } = parseOrThrow(statusSchema, req.body);

  await findCompetitorOr404(id);

  const [competitor] = await prisma.$transaction([
    prisma.competitor.update({ where: { id }, data: { isActive } }),
    prisma.competitorProduct.updateMany({
      where: { competitorId: id, deletedAt: null },
      data: { isActive },
    }),
  ]);

  res.status(200).json({ competitor: toAdminCompetitorDto(competitor) });
}

/** DELETE /api/admin/competitors/:id — soft delete, cascading to products. */
export async function deleteCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const existing = await findCompetitorOr404(id);

  const products = await prisma.competitorProduct.findMany({
    where: { competitorId: id, deletedAt: null },
    select: { id: true, name: true },
  });

  const now = new Date();

  await prisma.$transaction([
    prisma.competitor.update({
      where: { id },
      data: { deletedAt: now, isActive: false },
    }),
    prisma.competitorProduct.updateMany({
      where: { competitorId: id, deletedAt: null },
      data: { deletedAt: now, isActive: false },
    }),
  ]);

  for (const product of products) {
    await invalidateAiCaches({
      competitorProductId: product.id,
      competitorProductLabels: [letterLabel(existing.name, product.name)],
    });
  }

  res.status(204).end();
}

// ------------------------------------------------------- competitor products

/** GET /api/admin/competitor-products */
export async function listCompetitorProducts(
  req: Request,
  res: Response,
): Promise<void> {
  const query = parseOrThrow(competitorProductListQuerySchema, req.query);

  const where = {
    deletedAt: null,
    ...(query.competitorId ? { competitorId: query.competitorId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            {
              enClassification: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.competitorProduct.findMany({
      where,
      orderBy: [{ name: "asc" }],
      include: { competitor: true },
      ...toSkipTake(query),
    }),
    prisma.competitorProduct.count({ where }),
  ]);

  res.status(200).json({
    competitorProducts: rows.map(toAdminCompetitorProductDto),
    pagination: paginationMeta(query.page, query.pageSize, total),
  });
}

/**
 * GET /api/admin/competitor-products/:id
 *
 * `tdsFileUrl` is the stored object path; `tdsFileSignedUrl` is a short-lived
 * download link minted here, at read time. Signed URLs expire, so they are
 * never persisted (blueprint §3a).
 */
export async function getCompetitorProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const row = await findCompetitorProductOr404(id);

  let tdsFileSignedUrl: string | null = null;

  if (row.tdsFileUrl) {
    try {
      tdsFileSignedUrl = await getSignedUrl(row.tdsFileUrl);
    } catch (error) {
      // A missing or unsignable object must not hide the rest of the record.
      logger.warn(
        { err: error, competitorProductId: id },
        "Could not sign the stored TDS file",
      );
    }
  }

  res.status(200).json({
    competitorProduct: { ...toAdminCompetitorProductDto(row), tdsFileSignedUrl },
  });
}

/** PUT /api/admin/competitor-products/:id */
export async function updateCompetitorProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(updateCompetitorProductSchema, req.body);

  const existing = await findCompetitorProductOr404(id);

  if (input.competesWith) {
    const product = await prisma.product.findFirst({
      where: { code: input.competesWith, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new HttpError(400, "unknown_reference", `Unknown Kamdhenu product '${input.competesWith}'`, [
        { path: "competesWith", message: "not found" },
      ]);
    }
  }

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.competitorProduct.findFirst({
      where: {
        competitorId: existing.competitorId,
        name: input.name,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });

    if (clash) {
      throw new HttpError(
        409,
        "duplicate_competitor_product",
        `This competitor already has a product named '${input.name}'`,
      );
    }
  }

  const row = await prisma.competitorProduct.update({
    where: { id },
    data: omitUndefined(input),
    include: { competitor: true },
  });

  // Admin-confirmed spec edits supersede any AI copy quoting the old figures.
  if (input.technicalParams !== undefined || input.name !== undefined) {
    await invalidateAiCaches({
      competitorProductId: id,
      competitorProductLabels: [
        letterLabel(existing.competitor.name, existing.name),
        letterLabel(row.competitor.name, row.name),
      ],
    });
  }

  res.status(200).json({ competitorProduct: toAdminCompetitorProductDto(row) });
}

/** PATCH /api/admin/competitor-products/:id/status */
export async function setCompetitorProductStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const { isActive } = parseOrThrow(statusSchema, req.body);

  const existing = await findCompetitorProductOr404(id);

  const row = await prisma.competitorProduct.update({
    where: { id },
    data: { isActive },
    include: { competitor: true },
  });

  if (!isActive) {
    await invalidateAiCaches({
      competitorProductId: id,
      competitorProductLabels: [
        letterLabel(existing.competitor.name, existing.name),
      ],
    });
  }

  res.status(200).json({ competitorProduct: toAdminCompetitorProductDto(row) });
}

/**
 * DELETE /api/admin/competitor-products/:id
 *
 * Soft delete by default (defect #9): the row and its stored TDS survive for
 * audit. `?purge=true` hard-deletes the row and removes the object from
 * storage — for a file uploaded in error, where retention is not wanted.
 */
export async function deleteCompetitorProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const { purge } = parseOrThrow(purgeQuerySchema, req.query);
  const existing = await findCompetitorProductOr404(id);

  if (purge) {
    await prisma.competitorProduct.delete({ where: { id } });

    if (existing.tdsFileUrl) {
      try {
        await removeFile(existing.tdsFileUrl);
      } catch (error) {
        // The row is already gone; an orphaned object is not worth a 500.
        logger.error(
          { err: error, path: existing.tdsFileUrl },
          "Deleted competitor product but could not remove its stored TDS",
        );
      }
    }
  } else {
    await prisma.competitorProduct.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  await invalidateAiCaches({
    competitorProductId: id,
    competitorProductLabels: [
      letterLabel(existing.competitor.name, existing.name),
    ],
  });

  res.status(204).end();
}
