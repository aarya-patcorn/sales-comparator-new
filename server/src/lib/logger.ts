import { createRequire } from "node:module";

import { pino, type LoggerOptions } from "pino";

import { env } from "../config/env.js";

/**
 * pino-pretty is a dev-only dependency. Resolve it defensively so a production
 * install (without dev deps) can never crash at startup.
 */
function prettyTransport(): LoggerOptions["transport"] {
  if (env.NODE_ENV === "production") return undefined;
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
  } catch {
    return undefined;
  }
  return {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
  };
}

const transport = prettyTransport();

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "sales-comparator-server" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(transport ? { transport } : {}),
});

export type Logger = typeof logger;
