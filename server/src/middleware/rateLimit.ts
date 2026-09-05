import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

import { env } from "../config/env.js";
import { HttpError } from "./errorHandler.js";

/**
 * Throttles the credential endpoints: RM login and admin Google sign-in.
 *
 * RM login is passwordless, so a mobile number is the only credential — without
 * a limit it can be enumerated or brute-forced cheaply. Read endpoints are not
 * limited; they already require a bearer token.
 */
export function createAuthRateLimiter(
  options: { windowMs?: number; max?: number } = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: options.max ?? env.AUTH_RATE_LIMIT_MAX,
    // draft-6 headers: RateLimit-Limit / -Remaining / -Reset.
    standardHeaders: true,
    legacyHeaders: false,
    // Same envelope as every other error in the API.
    handler: (_req, _res, next) => {
      next(
        new HttpError(
          429,
          "rate_limited",
          "Too many attempts. Please wait and try again.",
        ),
      );
    },
  });
}
