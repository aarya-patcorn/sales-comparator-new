import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "./errorHandler.js";
import { createAuthRateLimiter } from "./rateLimit.js";

function appWithLimit(max: number) {
  const app = express();
  app.use(express.json());
  app.post("/login", createAuthRateLimiter({ max, windowMs: 60_000 }), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("createAuthRateLimiter", () => {
  it("allows requests up to the limit, then 429s", async () => {
    const app = appWithLimit(2);

    expect((await request(app).post("/login")).status).toBe(200);
    expect((await request(app).post("/login")).status).toBe(200);

    const blocked = await request(app).post("/login");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual({
      code: "rate_limited",
      message: "Too many attempts. Please wait and try again.",
    });
  });

  it("advertises the limit with standard headers", async () => {
    const res = await request(appWithLimit(5)).post("/login");

    expect(res.headers["ratelimit-limit"]).toBe("5");
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined(); // legacy off
  });

  it("keeps separate counters per limiter instance", async () => {
    const first = appWithLimit(1);
    const second = appWithLimit(1);

    await request(first).post("/login");
    expect((await request(first).post("/login")).status).toBe(429);
    // A different route/app is unaffected.
    expect((await request(second).post("/login")).status).toBe(200);
  });
});
