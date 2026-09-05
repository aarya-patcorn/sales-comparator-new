import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePrisma } from "../../test/fakePrisma.js";

const fake = createFakePrisma();
const verifyGoogleIdToken = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: fake.prisma,
  disconnectPrisma: vi.fn(),
}));

// Only the Google network call is mocked; verification failures are simulated by
// throwing the library's own error type.
vi.mock("../../lib/googleAuth.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/googleAuth.js")
  >("../../lib/googleAuth.js");

  return { ...actual, verifyGoogleIdToken };
});

const { createApp } = await import("../../app.js");
const { GoogleAuthError } = await import("../../lib/googleAuth.js");

const app = createApp();

const GOOGLE_SUB = "112233445566778899000";
const EMAIL = "asha@example.com";

const profile = {
  sub: GOOGLE_SUB,
  email: EMAIL,
  emailVerified: true,
  name: "Asha Nair",
  picture: "https://lh3.googleusercontent.com/a/asha",
};

function seedAdmin(overrides = {}) {
  return fake.seedUser({
    role: "admin",
    name: null,
    email: EMAIL,
    mobileNumber: null,
    ...overrides,
  });
}

function login(idToken = "google-id-token") {
  return request(app).post("/api/admin/auth/google").send({ idToken });
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  verifyGoogleIdToken.mockResolvedValue(profile);
});

describe("POST /api/admin/auth/google", () => {
  it("signs in an allow-listed admin and binds google_sub on first login", async () => {
    const admin = seedAdmin();
    expect(admin.googleSub).toBeNull();

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: admin.id,
      name: "Asha Nair", // taken from the Google profile on first login
      role: "admin",
      email: EMAIL,
      avatarUrl: profile.picture,
    });

    const stored = fake.users.get(admin.id);
    expect(stored?.googleSub).toBe(GOOGLE_SUB);
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("verifies the token server-side rather than trusting the body", async () => {
    seedAdmin();

    await login("the-token");

    expect(verifyGoogleIdToken).toHaveBeenCalledWith("the-token");
  });

  it("matches the allow-list case-insensitively", async () => {
    const admin = seedAdmin({ email: "ASHA@Example.COM" });

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(admin.id);
  });

  it("403s an email that is not on the allow-list", async () => {
    const res = await login(); // no admin row seeded

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({
      code: "forbidden",
      message: "Not an authorized admin",
    });
    expect(fake.sessions.size).toBe(0);
  });

  it("403s a deactivated admin", async () => {
    seedAdmin({ isActive: false });

    const res = await login();

    expect(res.status).toBe(403);
    expect(fake.sessions.size).toBe(0);
  });

  it("403s an RM whose email happens to match", async () => {
    fake.seedUser({ role: "rm", email: EMAIL });

    expect((await login()).status).toBe(403);
  });

  it("401s when the Google email is not verified", async () => {
    seedAdmin();
    verifyGoogleIdToken.mockResolvedValue({ ...profile, emailVerified: false });

    const res = await login();

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Google account email is not verified");
    expect(fake.sessions.size).toBe(0);
    expect(fake.users.get(seedAdmin().id)?.googleSub).toBeNull();
  });

  it("401s when the token fails verification, without echoing it", async () => {
    seedAdmin();
    verifyGoogleIdToken.mockRejectedValue(
      new GoogleAuthError("Wrong recipient, payload audience != requiredAudience"),
    );

    const res = await login("forged.token.value");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid Google ID token");
    expect(JSON.stringify(res.body)).not.toContain("forged.token.value");
    expect(JSON.stringify(res.body)).not.toContain("requiredAudience");
  });

  it("400s a missing or malformed body", async () => {
    for (const body of [{}, { idToken: "" }, { idToken: 1 }, { token: "x" }]) {
      const res = await request(app).post("/api/admin/auth/google").send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("signs in by google_sub after the email changed at Google", async () => {
    const admin = seedAdmin({ googleSub: GOOGLE_SUB, email: "old@example.com" });
    verifyGoogleIdToken.mockResolvedValue({ ...profile, email: "new@example.com" });

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(admin.id);
  });

  it("does not overwrite a curated name on later logins", async () => {
    const admin = seedAdmin({ googleSub: GOOGLE_SUB, name: "Asha (Ops Lead)" });

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Asha (Ops Lead)");
    expect(fake.users.get(admin.id)?.name).toBe("Asha (Ops Lead)");
  });

  it("403s when the matched row is bound to a different Google account", async () => {
    seedAdmin({ googleSub: "some-other-google-sub" });

    const res = await login();

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Not an authorized admin");
    expect(fake.sessions.size).toBe(0);
  });

  it("never leaks google_sub to the client", async () => {
    seedAdmin();

    const res = await login();

    expect(JSON.stringify(res.body)).not.toContain(GOOGLE_SUB);
  });

  it("issues an admin-length session (12h), not an RM one", async () => {
    seedAdmin();
    const before = Date.now();

    await login();

    const session = [...fake.sessions.values()][0];
    const ttlHours = ((session?.expiresAt.getTime() ?? 0) - before) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(11.9);
    expect(ttlHours).toBeLessThan(12.1);
  });
});

describe("admin session endpoints", () => {
  it("completes google -> me -> logout", async () => {
    const admin = seedAdmin();
    const { body } = await login();
    const token = body.token as string;

    const me = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({
      id: admin.id,
      name: "Asha Nair",
      role: "admin",
      email: EMAIL,
      avatarUrl: profile.picture,
    });

    const logout = await request(app)
      .post("/api/admin/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logout.status).toBe(204);
    expect(fake.sessions.size).toBe(0);

    const after = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(after.status).toBe(401);
  });

  it("401s /me without a token and 204s logout without one", async () => {
    expect((await request(app).get("/api/admin/auth/me")).status).toBe(401);
    expect((await request(app).post("/api/admin/auth/logout")).status).toBe(204);
  });

  it("403s an RM session on the admin routes", async () => {
    const rm = fake.seedUser({ role: "rm", mobileNumber: "919876543210" });
    const { createSession } = await import("../auth/session.service.js");
    const { token } = await createSession(rm.id);

    const res = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("keeps the admin session usable on RM routes only per role", async () => {
    seedAdmin();
    const { body } = await login();

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(403); // /api/auth/me is RM-only
  });
});
