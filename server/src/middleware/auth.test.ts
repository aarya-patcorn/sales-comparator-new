import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveSession = vi.fn();

vi.mock("../modules/auth/session.service.js", () => ({ resolveSession }));

const { requireAdmin, requireAuth, requireRm } = await import("./auth.js");

const RM = { id: "user-rm", role: "rm", isActive: true };
const ADMIN = { id: "user-admin", role: "admin", isActive: true };

const app = express();
app.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user?.id, role: req.user?.role });
});
app.get("/rm-only", requireRm, (_req, res) => res.json({ ok: true }));
app.get("/admin-only", requireAdmin, (_req, res) => res.json({ ok: true }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requireAuth", () => {
  it("attaches req.user for a valid bearer token", async () => {
    resolveSession.mockResolvedValue(RM);

    const res = await request(app).get("/me").set("Authorization", "Bearer tok");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: RM.id, role: "rm" });
    expect(resolveSession).toHaveBeenCalledWith("tok");
  });

  it("accepts a case-insensitive scheme and trims the token", async () => {
    resolveSession.mockResolvedValue(RM);

    await request(app).get("/me").set("Authorization", "bearer  tok  ");

    expect(resolveSession).toHaveBeenCalledWith("tok");
  });

  it("401s without a header, with the wrong scheme, or with an empty token", async () => {
    for (const header of [null, "Basic abc", "Bearer", "Bearer   "]) {
      const req = request(app).get("/me");
      const res = await (header ? req.set("Authorization", header) : req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
      expect(res.headers["www-authenticate"]).toBe("Bearer");
    }
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it("401s when the session does not resolve", async () => {
    resolveSession.mockResolvedValue(null);

    const res = await request(app).get("/me").set("Authorization", "Bearer x");

    expect(res.status).toBe(401);
    // Same message for unknown / expired / deactivated — no enumeration hints.
    expect(res.body.error.message).toBe("Invalid or expired session");
  });

  it("does not leak the token in the response", async () => {
    resolveSession.mockResolvedValue(null);

    const res = await request(app)
      .get("/me")
      .set("Authorization", "Bearer super-secret-token");

    expect(JSON.stringify(res.body)).not.toContain("super-secret-token");
  });

  it("passes database errors to the error handler as a 500", async () => {
    resolveSession.mockRejectedValue(new Error("db is down"));

    const res = await request(app).get("/me").set("Authorization", "Bearer x");

    expect(res.status).toBe(500);
  });
});

describe("requireRole", () => {
  it("allows the matching role", async () => {
    resolveSession.mockResolvedValue(RM);
    expect((await request(app).get("/rm-only").set("Authorization", "Bearer t")).status).toBe(200);

    resolveSession.mockResolvedValue(ADMIN);
    expect((await request(app).get("/admin-only").set("Authorization", "Bearer t")).status).toBe(200);
  });

  it("403s the wrong role", async () => {
    resolveSession.mockResolvedValue(RM);

    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("401s (not 403s) when unauthenticated", async () => {
    const res = await request(app).get("/admin-only");

    expect(res.status).toBe(401);
  });
});
