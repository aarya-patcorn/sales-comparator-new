import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { extractBearerToken } from "../../middleware/auth.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { loginSchema } from "./auth.validation.js";
import {
  createSession,
  deleteSession,
  ttlMsForRole,
} from "./session.service.js";
import { toPublicUser } from "./user.presenter.js";

/**
 * POST /api/auth/login — passwordless RM login (blueprint §5.1).
 *
 * There is no secret to check: possession of a registered mobile number is the
 * credential, so an RM must already exist and be active.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { mobileNumber } = parseOrThrow(loginSchema, req.body);

  const user = await prisma.user.findFirst({
    where: { mobileNumber, role: "rm", isActive: true },
  });

  if (!user) {
    // Same response for "no such number" and "deactivated": the caller cannot
    // use this endpoint to enumerate registered RMs.
    throw HttpError.unauthorized("No active RM account for this mobile number");
  }

  const { token } = await createSession(user.id, ttlMsForRole("rm"));

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // The plaintext token is returned exactly once, here.
  res.status(200).json({ token, user: toPublicUser(updated) });
}

/**
 * POST /api/auth/logout — always 204.
 *
 * Idempotent by design: a client clearing a stale token should not have to care
 * whether the session still existed.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = extractBearerToken(req);

  if (token) {
    await deleteSession(token);
  }

  res.status(204).end();
}

/** GET /api/auth/me — the caller's own record (requireRm runs first). */
export function me(req: Request, res: Response): void {
  if (!req.user) {
    throw HttpError.unauthorized();
  }

  res.status(200).json({ user: toPublicUser(req.user) });
}
