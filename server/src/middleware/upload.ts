import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { MulterError } from "multer";

import { SUPPORTED_MIME_TYPES } from "../modules/tds-extract/service.js";
import { HttpError } from "./errorHandler.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * TDS uploads are held in memory: they are small, they go straight to object
 * storage and to the model, and nothing should touch the local disk on the way.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!SUPPORTED_MIME_TYPES.includes(file.mimetype as never)) {
      callback(
        HttpError.badRequest(
          `Unsupported file type '${file.mimetype}'. Upload a PDF, PNG, JPEG or WebP.`,
        ),
      );
      return;
    }
    callback(null, true);
  },
});

/**
 * Accepts an optional single file in the `file` field.
 *
 * multer ignores non-multipart requests, so the same handler serves both the
 * upload and the JSON-only variants of a route.
 */
export function singleFileUpload(field = "file"): RequestHandler {
  const handler = upload.single(field);

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (error instanceof MulterError) {
        // Turn multer's own failures into the standard error shape.
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? `File is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`
            : error.message;

        next(new HttpError(400, "invalid_upload", message));
        return;
      }
      next(error);
    });
  };
}
