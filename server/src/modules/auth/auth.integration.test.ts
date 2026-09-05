import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePrisma } from "../../test/fakePrisma.js";

const fake = createFakePrisma();

vi.mock("../../db/client.js", () => ({
  prisma: fake.prisma,
  disconnectPrisma: vi.fn(),
}));

// Imported after the mock so the whole app wires up against the fake database.
const { createApp } = await import("../../app.js");
const { hashToken } = await import("../../lib/tokens.js");

const app = createApp();

const MOBILE = "919876543210";

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

function seedRm(overrides = {}) {
  return fake.seedUser({
    role: "rm",
    name: "Ravi Kumar",
    mobileNumber: MOBILE,
    ...overrides,
  });
}

describe("RM auth flow: login -> me -> logout", () => {
  it("completes the full journey", async () => {
    const rm = seedRm();

    // --- login
    const login = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: "+91 98765-43210" }); // messy input is normalized

    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.user).toEqual({
      id: rm.id,
      name: "Ravi Kumar",
      role: "rm",
      mobileNumber: MOBILE,
    });

    const { token } = login.body as { token: string };

    // last_login_at is stamped
    expect(fake.users.get(rm.id)?.lastLoginAt).toBeInstanceOf(Date);

    // only the hash is persisted
    const stored = [...fake.sessions.values()][0];
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);

    // --- me
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({
      id: rm.id,
      name: "Ravi Kumar",
      role: "rm",
      mobileNumber: MOBILE,
    });

    // --- logout
    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logout.status).toBe(204);
    expect(logout.body).toEqual({});
    expect(fake.sessions.size).toBe(0);

    // --- the token is dead
    const after = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("unauthorized");
  });
});

describe("POST /api/auth/login", () => {
  it("401s for an unknown mobile number", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(fake.sessions.size).toBe(0);
  });

  it("401s for a deactivated RM", async () => {
    seedRm({ isActive: false });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(res.status).toBe(401);
  });

  it("401s when the number belongs to an admin, not an RM", async () => {
    fake.seedUser({ role: "admin", mobileNumber: MOBILE });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(res.status).toBe(401);
  });

  it("gives the same message for unknown and deactivated accounts", async () => {
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    seedRm({ isActive: false });
    const inactive = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(inactive.body).toEqual(unknown.body);
  });

  it("400s on invalid input with the standard error shape", async () => {
    const cases = [
      {},
      { mobileNumber: "12345" },
      { mobileNumber: 919876543210 },
      { mobileNumber: MOBILE, role: "admin" }, // unknown key (strict)
    ];

    for (const body of cases) {
      const res = await request(app).post("/api/auth/login").send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
      expect(res.body.error.message).toBe("Request validation failed");
      expect(Array.isArray(res.body.error.details)).toBe(true);
    }
  });

  it("issues a distinct session per login", async () => {
    seedRm();

    const first = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });
    const second = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(first.body.token).not.toBe(second.body.token);
    expect(fake.sessions.size).toBe(2);
  });

  it("never returns internal user columns", async () => {
    seedRm({ email: "ravi@example.com", googleSub: "google-123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    expect(Object.keys(res.body.user).sort()).toEqual([
      "id",
      "mobileNumber",
      "name",
      "role",
    ]);
    expect(JSON.stringify(res.body)).not.toContain("google-123");
    expect(JSON.stringify(res.body)).not.toContain("ravi@example.com");
  });
});

describe("POST /api/auth/logout", () => {
  it("204s without a token", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(204);
  });

  it("204s for an unknown token and leaves other sessions alone", async () => {
    seedRm();
    await request(app).post("/api/auth/login").send({ mobileNumber: MOBILE });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(204);
    expect(fake.sessions.size).toBe(1);
  });
});

describe("GET /api/auth/me", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(res.headers["www-authenticate"]).toBe("Bearer");
  });

  it("403s for an admin session (RM-only route)", async () => {
    const admin = fake.seedUser({ role: "admin", email: "asha@example.com" });
    const { createSession } = await import("./session.service.js");
    const { token } = await createSession(admin.id);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("401s once the RM is deactivated mid-session", async () => {
    const rm = seedRm();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ mobileNumber: MOBILE });

    fake.users.set(rm.id, { ...rm, isActive: false });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(401);
  });
});

describe("unmatched routes", () => {
  it("404s with the standard error shape", async () => {
    const res = await request(app).get("/api/auth/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
