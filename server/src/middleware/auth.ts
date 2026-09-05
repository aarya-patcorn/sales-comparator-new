import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { User } from "../generated/prisma/client.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { resolveSession } from "../modules/auth/session.service.js";
import { HttpError } from "./errorHandler.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth once a bearer token resolves to an active user. */
      user?: User;
    }
  }
}

const BEARER_PREFIX = /^Bearer +/i;

/** Pulls the token out of `Authorization: Bearer <token>`. */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (typeof header !== "string" || !BEARER_PREFIX.test(header)) return null;

  const token = header.replace(BEARER_PREFIX, "").trim();
  return token.length > 0 ? token : null;
}

function unauthorized(res: Response, message: string): void {
  // WWW-Authenticate keeps the 401 honest for HTTP clients.
  res.setHeader("WWW-Authenticate", "Bearer");
  res.status(401).json(HttpError.unauthorized(message).toBody());
}

/**
 * Resolves the app-issued bearer token (blueprint §5) and attaches `req.user`.
 * 401s when the header is missing, the session is unknown or expired, or the
 * user has been deactivated.
 */
export const requireAuth: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = extractBearerToken(req);

  if (!token) {
    unauthorized(res, "Missing bearer token");
    return;
  }

  resolveSession(token)
    .then((user) => {
      if (!user) {
        // Deliberately identical message for unknown / expired / deactivated:
        // the client learns nothing about which token exists.
        unauthorized(res, "Invalid or expired session");
        return;
      }

      req.user = user;
      next();
    })
    .catch(next);
};

/** requireAuth + a role check. 403 when authenticated as the wrong role. */
export function requireRole(role: UserRole): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err !== undefined) {
        next(err);
        return;
      }

      // requireAuth already answered (401) when there is no user.
      if (!req.user) return;

      if (req.user.role !== role) {
        res
          .status(403)
          .json(
            HttpError.forbidden(`Requires the '${role}' role`).toBody(),
          );
        return;
      }

      next();
    });
  };
}

export const requireRm: RequestHandler = requireRole("rm");
export const requireAdmin: RequestHandler = requireRole("admin");
