import cron, { type ScheduledTask } from "node-cron";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { deleteExpiredSessions } from "../modules/auth/session.service.js";

/**
 * Sessions are hard-deleted (blueprint §10, defect #9). Expired rows are also
 * removed on access in resolveSession(); this job is the backstop for tokens
 * that are simply never presented again.
 */
export async function runSessionCleanup(): Promise<number> {
  const deleted = await deleteExpiredSessions();

  if (deleted > 0) {
    logger.info({ deleted }, "Purged expired sessions");
  }
  return deleted;
}

/**
 * Schedules the cleanup (default hourly, see SESSION_CLEANUP_CRON).
 * Returns the task so the caller can stop it on shutdown.
 */
export function startSessionCleanup(): ScheduledTask | null {
  if (!cron.validate(env.SESSION_CLEANUP_CRON)) {
    logger.error(
      { cron: env.SESSION_CLEANUP_CRON },
      "Invalid SESSION_CLEANUP_CRON — session cleanup is disabled",
    );
    return null;
  }

  const task = cron.schedule(env.SESSION_CLEANUP_CRON, () => {
    runSessionCleanup().catch((err: unknown) => {
      logger.error({ err }, "Session cleanup failed");
    });
  });

  logger.info(
    { cron: env.SESSION_CLEANUP_CRON },
    "Session cleanup job scheduled",
  );

  return task;
}
