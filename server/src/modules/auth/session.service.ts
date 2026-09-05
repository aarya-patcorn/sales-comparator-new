import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import type { User } from "../../generated/prisma/client.js";
import type { UserRole } from "../../generated/prisma/enums.js";
import { generateToken, hashToken } from "../../lib/tokens.js";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Session lifetime per role (blueprint §5): RM 7 days, admin 12 hours. */
export const SESSION_TTL_MS: Readonly<Record<UserRole, number>> = Object.freeze({
  rm: env.SESSION_TTL_DAYS * MS_PER_DAY,
  admin: env.ADMIN_SESSION_TTL_HOURS * MS_PER_HOUR,
});

export function ttlMsForRole(role: UserRole): number {
  return SESSION_TTL_MS[role];
}

export type CreatedSession = {
  /** Plaintext token — returned to the client once, never persisted. */
  token: string;
  expiresAt: Date;
  sessionId: string;
};

/**
 * Issues a session for a user.
 *
 * Only `sha256(token)` is written to the database; the plaintext lives in the
 * response body and nowhere else.
 *
 * @param ttlMs lifetime in milliseconds. Defaults to the user's role-based TTL.
 */
export async function createSession(
  userId: string,
  ttlMs?: number,
): Promise<CreatedSession> {
  let lifetime = ttlMs;

  if (lifetime === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new Error(`Cannot create a session for unknown user ${userId}`);
    }
    lifetime = ttlMsForRole(user.role);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + lifetime);

  const session = await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
    select: { id: true },
  });

  return { token, expiresAt, sessionId: session.id };
}

/**
 * Resolves a bearer token to its user.
 *
 * Returns null when the token is unknown, the session has expired, or the user
 * has been deactivated. Expired rows are deleted opportunistically; the cron job
 * in src/jobs/sessionCleanup.ts is the backstop.
 */
export async function resolveSession(token: string): Promise<User | null> {
  if (token.length === 0) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (!session.user.isActive) return null;

  return session.user;
}

/** Logout. Returns true when a session was actually removed. */
export async function deleteSession(token: string): Promise<boolean> {
  if (token.length === 0) return false;

  const { count } = await prisma.session.deleteMany({
    where: { tokenHash: hashToken(token) },
  });

  return count > 0;
}

/** Revokes every session for a user (deactivation, forced logout). */
export async function deleteSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

/** Used by the cleanup job. */
export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return count;
}
