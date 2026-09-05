import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import type { User } from "../../generated/prisma/client.js";
import {
  GoogleAuthError,
  verifyGoogleIdToken,
  type GoogleProfile,
} from "../../lib/googleAuth.js";
import { logger } from "../../lib/logger.js";
import { extractBearerToken } from "../../middleware/auth.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import {
  createSession,
  deleteSession,
  ttlMsForRole,
} from "../auth/session.service.js";
import { toPublicAdmin } from "../auth/user.presenter.js";
import { googleLoginSchema } from "./adminAuth.validation.js";

const NOT_AUTHORIZED = "Not an authorized admin";

/**
 * Allow-list lookup (blueprint §5.2 step 5).
 *
 * Matching on `google_sub` first means an admin's email can change at Google
 * without breaking their login; the email match is what binds the row the very
 * first time.
 */
async function findAllowListedAdmin(
  profile: GoogleProfile,
): Promise<User | null> {
  const identityFilters: { googleSub?: string; email?: object }[] = [
    { googleSub: profile.sub },
  ];

  if (profile.email) {
    identityFilters.push({
      email: { equals: profile.email, mode: "insensitive" },
    });
  }

  return prisma.user.findFirst({
    where: { role: "admin", isActive: true, OR: identityFilters },
  });
}

/**
 * POST /api/admin/auth/google
 *
 * Google proves identity; this app decides authorization and issues its own
 * session token. Google's ID token is never used as our API token.
 */
export async function googleLogin(req: Request, res: Response): Promise<void> {
  const { idToken } = parseOrThrow(googleLoginSchema, req.body);

  let profile: GoogleProfile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      logger.warn({ err: error }, "Google ID token rejected");
      throw HttpError.unauthorized("Invalid Google ID token");
    }
    throw error;
  }

  if (!profile.emailVerified) {
    throw HttpError.unauthorized("Google account email is not verified");
  }

  const admin = await findAllowListedAdmin(profile);

  if (!admin) {
    // OAuth alone grants nothing: an active admin row must already exist.
    logger.warn({ googleSub: profile.sub }, "Google login not on allow-list");
    throw HttpError.forbidden(NOT_AUTHORIZED);
  }

  // Matched by email, but the row is already bound to a different Google
  // account — refuse rather than silently re-bind someone else's identity.
  if (admin.googleSub !== null && admin.googleSub !== profile.sub) {
    logger.error(
      { userId: admin.id },
      "Admin row is bound to a different google_sub",
    );
    throw HttpError.forbidden(NOT_AUTHORIZED);
  }

  const isFirstLogin = admin.googleSub === null;

  const updated = await prisma.user.update({
    where: { id: admin.id },
    data: {
      lastLoginAt: new Date(),
      // Bind the Google identity once, on first successful login. Later logins
      // leave the profile alone so admin edits are not overwritten by Google.
      ...(isFirstLogin
        ? {
            googleSub: profile.sub,
            ...(admin.name === null && profile.name
              ? { name: profile.name }
              : {}),
            ...(admin.avatarUrl === null && profile.picture
              ? { avatarUrl: profile.picture }
              : {}),
          }
        : {}),
    },
  });

  const { token } = await createSession(admin.id, ttlMsForRole("admin"));

  res.status(200).json({ token, user: toPublicAdmin(updated) });
}

/** GET /api/admin/auth/me — requireAdmin has already resolved the session. */
export function me(req: Request, res: Response): void {
  if (!req.user) {
    throw HttpError.unauthorized();
  }

  res.status(200).json({ user: toPublicAdmin(req.user) });
}

/** POST /api/admin/auth/logout — always 204, no Google round-trip. */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = extractBearerToken(req);

  if (token) {
    await deleteSession(token);
  }

  res.status(204).end();
}
