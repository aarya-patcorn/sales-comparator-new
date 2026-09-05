import { createRequire } from "node:module";

import type { Request, Response } from "express";

import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

// package.json sits outside rootDir, so it is read at runtime rather than
// imported (which would drag it into the compiled output).
const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version?: string };

export const APP_VERSION: string = pkg.version ?? "0.0.0";

/**
 * GET /api/health
 *
 * Reports liveness plus database connectivity. Returns 503 when the database is
 * unreachable so a load balancer takes the instance out of rotation instead of
 * routing traffic that will fail.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  let database: "up" | "down" = "up";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "down";
    logger.error({ err: error }, "Health check: database unreachable");
  }

  res.status(database === "up" ? 200 : 503).json({
    status: database === "up" ? "ok" : "degraded",
    version: APP_VERSION,
    uptime: Math.round(process.uptime()),
    database,
  });
}
