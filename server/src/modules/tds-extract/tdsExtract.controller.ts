import type { Request, Response } from "express";

import { HttpError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import { OpenAiUnavailableError } from "../../lib/openaiClient.js";
import { extractParamsFromFile, TdsExtractionError } from "./service.js";

/**
 * Maps AI/extraction failures onto the standard error shape.
 * Returns null for anything that is not an extraction failure.
 */
export function asHttpError(error: unknown): HttpError | null {
  if (error instanceof OpenAiUnavailableError) {
    return new HttpError(
      503,
      "ai_unavailable",
      "AI extraction is not configured on this server. Enter the specifications manually.",
    );
  }

  if (error instanceof TdsExtractionError) {
    logger.warn({ err: error }, "TDS extraction failed");
    return new HttpError(422, "extraction_failed", error.message);
  }

  return null;
}

/**
 * POST /api/admin/tds/extract
 *
 * Returns prefill values for the admin form. Deliberately saves NOTHING: the
 * file is not stored and no row is created (blueprint §3a). The admin reviews
 * the values and submits them through POST /api/admin/competitor-products.
 */
export async function postExtract(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    throw HttpError.badRequest("A TDS file is required in the 'file' field");
  }

  try {
    const { params, model } = await extractParamsFromFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    res.status(200).json({ params, model });
  } catch (error) {
    throw asHttpError(error) ?? error;
  }
}
