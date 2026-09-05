import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the factory can record the constructor call that happens at import
// time (vi.clearAllMocks in beforeEach would otherwise erase it).
const { ctorArgs, verifyIdToken } = vi.hoisted(() => ({
  ctorArgs: [] as unknown[],
  verifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn((options: unknown) => {
    ctorArgs.push(options);
    return { verifyIdToken };
  }),
}));

const { GoogleAuthError, verifyGoogleIdToken } = await import(
  "./googleAuth.js"
);

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "112233445566778899000",
    email: "asha@example.com",
    email_verified: true,
    name: "Asha Nair",
    picture: "https://lh3.googleusercontent.com/a/asha",
    ...overrides,
  };
}

function ticketFor(value: unknown) {
  return { getPayload: () => value };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OAuth2Client configuration", () => {
  it("is constructed with the client id and secret", () => {
    expect(ctorArgs).toEqual([
      { clientId: CLIENT_ID, clientSecret: "test-client-secret" },
    ]);
  });
});

describe("verifyGoogleIdToken", () => {
  it("passes the configured client id as the required audience", async () => {
    verifyIdToken.mockResolvedValue(ticketFor(payload()));

    await verifyGoogleIdToken("an-id-token");

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "an-id-token",
      audience: CLIENT_ID,
    });
  });

  it("maps a verified payload to a profile", async () => {
    verifyIdToken.mockResolvedValue(ticketFor(payload()));

    await expect(verifyGoogleIdToken("t")).resolves.toEqual({
      sub: "112233445566778899000",
      email: "asha@example.com",
      emailVerified: true,
      name: "Asha Nair",
      picture: "https://lh3.googleusercontent.com/a/asha",
    });
  });

  it("accepts both documented issuers", async () => {
    for (const iss of ["accounts.google.com", "https://accounts.google.com"]) {
      verifyIdToken.mockResolvedValue(ticketFor(payload({ iss })));

      await expect(verifyGoogleIdToken("t")).resolves.toMatchObject({
        sub: "112233445566778899000",
      });
    }
  });

  it("rejects an unexpected issuer", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor(payload({ iss: "https://evil.example.com" })),
    );

    await expect(verifyGoogleIdToken("t")).rejects.toThrow(GoogleAuthError);
  });

  it("wraps library verification failures", async () => {
    verifyIdToken.mockRejectedValue(
      new Error("Wrong recipient, payload audience != requiredAudience"),
    );

    const error = await verifyGoogleIdToken("t").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleAuthError);
    expect((error as Error).message).toBe(
      "Google ID token verification failed",
    );
    // The original stays available for logs but not for the response.
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("rejects an empty or non-string token before calling Google", async () => {
    for (const token of ["", "   "]) {
      await expect(verifyGoogleIdToken(token)).rejects.toThrow(GoogleAuthError);
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a missing payload or missing subject", async () => {
    verifyIdToken.mockResolvedValue(ticketFor(undefined));
    await expect(verifyGoogleIdToken("t")).rejects.toThrow(GoogleAuthError);

    verifyIdToken.mockResolvedValue(ticketFor(payload({ sub: undefined })));
    await expect(verifyGoogleIdToken("t")).rejects.toThrow(GoogleAuthError);
  });

  it("reports an unverified email rather than throwing", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor(payload({ email_verified: false })),
    );

    await expect(verifyGoogleIdToken("t")).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it("treats a missing email_verified claim as unverified", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor(payload({ email_verified: undefined })),
    );

    await expect(verifyGoogleIdToken("t")).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it("nulls optional profile fields when absent", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor(payload({ email: undefined, name: undefined, picture: undefined })),
    );

    await expect(verifyGoogleIdToken("t")).resolves.toMatchObject({
      email: null,
      name: null,
      picture: null,
    });
  });
});
