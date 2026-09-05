import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import type { Product } from "../../generated/prisma/client.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { omitUndefined } from "../../lib/objects.js";
import { toSkipTake, uuidSchema } from "../../validation/common.js";
import { invalidateAiCaches } from "../ai/cache.js";
import { paginationMeta, toAdminProductDto } from "./admin.presenter.js";
import {
  createProductSchema,
  listQuerySchema,
  statusSchema,
  updateProductSchema,
} from "./admin.validation.js";

async function findProductOr404(id: string): Promise<Product> {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
  });

  if (!product) throw HttpError.notFound(`No product with id '${id}'`);
  return product;
}

/** Mirrors the partial unique index uq_products_code_active. */
async function assertCodeIsFree(code: string, exceptId?: string): Promise<void> {
  const clash = await prisma.product.findFirst({
    where: {
      code,
      deletedAt: null,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw new HttpError(
      409,
      "duplicate_product_code",
      `An active product with code '${code}' already exists`,
    );
  }
}

/** GET /api/admin/products */
export async function listProducts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listQuerySchema, req.query);

  const where = {
    deletedAt: null,
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: "insensitive" as const } },
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
    prisma.product.findMany({
      where,
      orderBy: [{ code: "asc" }],
      ...toSkipTake(query),
    }),
    prisma.product.count({ where }),
  ]);

  res.status(200).json({
    products: rows.map(toAdminProductDto),
    pagination: paginationMeta(query.page, query.pageSize, total),
  });
}

/** GET /api/admin/products/:id */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const product = await findProductOr404(id);

  res.status(200).json({ product: toAdminProductDto(product) });
}

/** POST /api/admin/products */
export async function createProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(createProductSchema, req.body);

  await assertCodeIsFree(input.code);

  const product = await prisma.product.create({
    data: { ...input, createdBy: req.user?.id ?? null, updatedBy: req.user?.id ?? null },
  });

  res.status(201).json({ product: toAdminProductDto(product) });
}

/** PUT /api/admin/products/:id */
export async function updateProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(updateProductSchema, req.body);

  const existing = await findProductOr404(id);

  if (input.code && input.code !== existing.code) {
    await assertCodeIsFree(input.code, id);
  }

  const product = await prisma.product.update({
    where: { id },
    data: { ...omitUndefined(input), updatedBy: req.user?.id ?? null },
  });

  // Specs (or the code) changed -> any AI copy written against the old figures
  // must go (defect #6).
  if (input.technicalParams !== undefined || input.code !== undefined) {
    await invalidateAiCaches({ productCode: existing.code });
    if (product.code !== existing.code) {
      await invalidateAiCaches({ productCode: product.code });
    }
  }

  res.status(200).json({ product: toAdminProductDto(product) });
}

/** PATCH /api/admin/products/:id/status */
export async function setProductStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const { isActive } = parseOrThrow(statusSchema, req.body);

  const existing = await findProductOr404(id);

  const product = await prisma.product.update({
    where: { id },
    data: { isActive, updatedBy: req.user?.id ?? null },
  });

  if (!isActive) await invalidateAiCaches({ productCode: existing.code });

  res.status(200).json({ product: toAdminProductDto(product) });
}

/** DELETE /api/admin/products/:id — soft delete (defect #9). */
export async function deleteProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const existing = await findProductOr404(id);

  await prisma.product.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      updatedBy: req.user?.id ?? null,
    },
  });

  await invalidateAiCaches({ productCode: existing.code });

  res.status(204).end();
}
