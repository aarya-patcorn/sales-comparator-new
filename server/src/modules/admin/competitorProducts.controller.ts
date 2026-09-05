import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { Prisma, type CompetitorProduct } from "../../generated/prisma/client.js";
import { save as saveFile } from "../../lib/fileStorage.js";
import { logger } from "../../lib/logger.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { coerceTechnicalParams } from "../../validation/technicalParams.js";
import {
  extractParamsFromFile,
  type ExtractionResult,
} from "../tds-extract/service.js";
import { asHttpError } from "../tds-extract/tdsExtract.controller.js";
import {
  createCompetitorProductSchema,
  normalizeCompetitorProductBody,
} from "./competitorProducts.validation.js";

function toDto(row: CompetitorProduct) {
  return {
    id: row.id,
    competitorId: row.competitorId,
    name: row.name,
    enClassification: row.enClassification,
    specSource: row.specSource,
    // The stored PATH, not a URL. Callers that need a downloadable link ask
    // for a signed URL at read time (see getCompetitorProduct).
    tdsFileUrl: row.tdsFileUrl,
    tdsFileName: row.tdsFileName,
    aiModel: row.aiModel,
    isActive: row.isActive,
    technicalParams: coerceTechnicalParams(row.technicalParams),
    createdAt: row.createdAt,
  };
}

/**
 * POST /api/admin/competitor-products
 *
 * Two modes, one endpoint (blueprint §3a):
 *   (a) multipart with a `file`  -> spec_source 'tds_ai', file stored, model
 *       output kept in ai_raw_extraction for audit;
 *   (b) JSON body                -> spec_source 'manual'.
 *
 * In BOTH modes the saved `technical_params` are the admin-confirmed values
 * from the request body. The AI never writes to that column.
 */
export async function postCompetitorProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(
    createCompetitorProductSchema,
    normalizeCompetitorProductBody(req.body),
  );

  const competitor = await prisma.competitor.findFirst({
    where: { id: input.competitorId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!competitor) {
    throw new HttpError(
      400,
      "unknown_reference",
      `Unknown or inactive competitor '${input.competitorId}'`,
      [{ path: "competitorId", message: "not found" }],
    );
  }

  // Mirrors the partial unique index uq_comp_products_name_active.
  const duplicate = await prisma.competitorProduct.findFirst({
    where: {
      competitorId: input.competitorId,
      name: input.name,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new HttpError(
      409,
      "duplicate_competitor_product",
      `This competitor already has a product named '${input.name}'`,
    );
  }

  const file = req.file;

  let tdsFileUrl: string | null = null;
  let tdsFileName: string | null = null;
  let extraction: ExtractionResult | null = null;

  if (file) {
    const stored = await saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    tdsFileUrl = stored.path;
    tdsFileName = stored.originalName;

    // Best effort: the admin has already confirmed the values, so a failed
    // extraction must not lose their work. It only costs the audit trail.
    try {
      extraction = await extractParamsFromFile({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (!asHttpError(error)) throw error;
      logger.warn(
        { err: error },
        "Saving competitor product without an AI audit trail",
      );
    }
  }

  const specSource = file ? "tds_ai" : "manual";

  // Belt-and-braces for chk_tds_file: an AI-sourced row must reference a file.
  if (specSource === "tds_ai" && tdsFileUrl === null) {
    throw new HttpError(
      500,
      "internal_error",
      "Internal error: a TDS-sourced product must reference a stored file",
    );
  }

  const created = await prisma.competitorProduct.create({
    data: {
      competitorId: input.competitorId,
      name: input.name,
      enClassification: input.enClassification,
      // Always the confirmed body values, never the model's.
      technicalParams: input.technicalParams,
      specSource,
      tdsFileUrl,
      tdsFileName,
      aiRawExtraction: extraction
        ? (extraction.raw as Prisma.InputJsonValue)
        : Prisma.DbNull,
      aiModel: extraction?.model ?? null,
      createdBy: req.user?.id ?? null,
    },
  });

  res.status(201).json({ competitorProduct: toDto(created) });
}
