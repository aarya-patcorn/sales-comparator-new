import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { APP_VERSION } from "./modules/health.controller.js";

const app = createApp();

describe("GET /api/health", () => {
  it("reports ok with the package version when the database answers", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      version: APP_VERSION,
      database: "up",
    });
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("route map (blueprint §7)", () => {
  it("mounts every group under /api with auth enforced", async () => {
    const routes: [string, string][] = [
      ["post", "/api/auth/login"],
      ["get", "/api/auth/me"],
      ["get", "/api/catalog/substrates"],
      ["get", "/api/catalog/tile-types"],
      ["get", "/api/catalog/areas"],
      ["get", "/api/catalog/kamdhenu"],
      ["get", "/api/catalog/competitors"],
      ["post", "/api/recommend"],
      ["post", "/api/compare"],
      ["post", "/api/pitch"],
      ["post", "/api/recommendation-text"],
      ["post", "/api/admin/auth/google"],
      ["get", "/api/admin/auth/me"],
      ["post", "/api/admin/tds/extract"],
      ["get", "/api/admin/dashboard"],
      ["get", "/api/admin/users"],
      ["get", "/api/admin/admins"],
      ["get", "/api/admin/products"],
      ["get", "/api/admin/competitors"],
      ["get", "/api/admin/competitor-products"],
    ];

    for (const [method, path] of routes) {
      const res = await request(app)[method as "get"](path).send({});

      // Never a 404: every route in the blueprint is wired up.
      expect(res.status, `${method.toUpperCase()} ${path}`).not.toBe(404);
      // Protected routes answer 401; the two public credential endpoints
      // validate their body first (400).
      expect([400, 401]).toContain(res.status);
    }
  });

  it("404s an unknown route with the standard error shape", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("CORS", () => {
  it("allows a configured admin origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("does not reflect an unconfigured origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows clients that send no Origin (native Expo, curl)", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});

describe("API caching", () => {
  it("does not send ETags or return a conditional 304 response", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("If-None-Match", '"cached"');

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeUndefined();
    expect(res.body.status).toBe("ok");
  });
});

describe("security headers", () => {
  it("sets helmet defaults and hides the framework", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
