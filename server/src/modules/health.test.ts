import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

// The database client is mocked so the degraded path can be exercised without
// touching (or breaking) a real connection.
vi.mock("../db/client.js", () => ({
  prisma: { $queryRaw: queryRaw },
  disconnectPrisma: vi.fn(),
}));

const { createApp } = await import("../app.js");
const { APP_VERSION } = await import("./health.controller.js");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 with version and database up", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      version: APP_VERSION,
      database: "up",
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns 503 when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused to db-host:5432"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "down" });
    // The failure is logged server-side, never returned to the caller.
    expect(JSON.stringify(res.body)).not.toContain("connection refused");
    expect(JSON.stringify(res.body)).not.toContain("db-host");
  });

  it("needs no authentication", async () => {
    queryRaw.mockResolvedValue([]);

    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});
