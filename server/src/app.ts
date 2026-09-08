import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.js";
import { createAuthRateLimiter } from "./middleware/rateLimit.js";
import { adminAuthRouter } from "./modules/admin-auth/adminAuth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import {
  pitchRouter,
  recommendationTextRouter,
} from "./modules/ai/ai.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { compareRouter } from "./modules/compare/compare.routes.js";
import {
  getHealth,
  getLiveness,
  getReadiness,
} from "./modules/health.controller.js";
import { recommendRouter } from "./modules/recommend/recommend.routes.js";
import { tdsExtractRouter } from "./modules/tds-extract/tdsExtract.routes.js";

/**
 * Browser origins come from CORS_ORIGINS: the admin SPA (Vite, usually
 * http://localhost:5173) and the Expo web/dev origins (http://localhost:8081,
 * http://localhost:19006). Native Expo and curl send no Origin header at all
 * and are always allowed — CORS is a browser mechanism, and every protected
 * route still requires a bearer token.
 */
function corsOptions(): CorsOptions {
  const allowed = env.CORS_ORIGINS;

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.includes("*") || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  };
}

/**
 * `trust proxy` decides which IP the rate limiter sees. Trusting every hop
 * (`true`) means a spoofed X-Forwarded-For defeats the limiter, so the default
 * is `false` and deployments opt in with a hop count or an explicit list.
 */
function trustProxySetting(): boolean | number | string[] {
  const raw = env.TRUST_PROXY.trim();

  if (raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  if (/^\d+$/.test(raw)) return Number(raw);

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxySetting());

  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );

  // Credential endpoints only; everything else is bearer-token protected.
  const authLimiter = createAuthRateLimiter();

  // ---- route map (blueprint §7) ----
  app.get("/api/health", getHealth);
  app.get("/api/health/live", getLiveness);
  app.get("/api/health/ready", getReadiness);

  app.post("/api/auth/login", authLimiter);
  app.post("/api/admin/auth/google", authLimiter);

  app.use("/api/auth", authRouter); // RM: login, logout, me
  app.use("/api/catalog", catalogRouter); // RM: substrates, tile-types, areas, kamdhenu, competitors
  app.use("/api/recommend", recommendRouter); // RM
  app.use("/api/compare", compareRouter); // RM
  app.use("/api/pitch", pitchRouter); // RM
  app.use("/api/recommendation-text", recommendationTextRouter); // RM

  app.use("/api/admin/auth", adminAuthRouter); // google, me, logout
  app.use("/api/admin/tds", tdsExtractRouter); // extract
  // Broadest admin mount last so /auth and /tds above take precedence:
  // dashboard, users, admins, products, competitors, competitor-products.
  app.use("/api/admin", adminRouter);

  // Must stay last: 404 for unmatched routes, then the error serializer.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
