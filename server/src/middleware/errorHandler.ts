import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Authentication required"): HttpError {
    return new HttpError(401, "unauthorized", message);
  }

  static forbidden(message = "Not allowed"): HttpError {
    return new HttpError(403, "forbidden", message);
  }

  static notFound(message = "Not found"): HttpError {
    return new HttpError(404, "not_found", message);
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

/** Flattens a ZodError into `[{ path, message }]` for the response body. */
export function zodDetails(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Parses untrusted input, converting a validation failure into a 400.
 * Use for req.body / req.query / req.params.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new HttpError(
      400,
      "validation_error",
      "Request validation failed",
      zodDetails(result.error),
    );
  }
  return result.data;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(
      HttpError.notFound(`Cannot ${req.method} ${req.path}`).toBody(),
    );
};

/**
 * Central error serializer. Every failure leaves the API as
 * `{ error: { code, message } }` (plus `details` for validation failures).
 *
 * Mapping:
 *   ZodError                    -> 400 validation_error
 *   HttpError(400 …)            -> as thrown (unknown_reference, invalid_upload)
 *   requireAuth / requireRole   -> 401 unauthorized / 403 forbidden
 *   HttpError.notFound / 404    -> 404 not_found
 *   known conflicts             -> 409 (duplicate_*, cannot_deactivate_self, …)
 *   rate limiter                -> 429 rate_limited
 *   anything else               -> 500 internal_error
 *
 * A 500 never exposes the underlying message or stack in production: the real
 * error is logged server-side with the request id instead.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    // 4xx is the client's problem; only log it at debug level.
    logger.debug({ err, code: err.code }, "Request rejected");
    res.status(err.status).json(err.toBody());
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: zodDetails(err),
      },
    } satisfies ErrorBody);
    return;
  }

  // Anything reaching here is a bug or an infrastructure failure.
  logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled error");

  const body: ErrorBody = {
    error: { code: "internal_error", message: "Internal server error" },
  };

  // Outside production, surface the cause to whoever is debugging. Never in
  // production: messages and stacks leak table names, paths and secrets.
  if (env.NODE_ENV !== "production" && err instanceof Error) {
    body.error.details = { message: err.message, stack: err.stack };
  }

  res.status(500).json(body);
};
