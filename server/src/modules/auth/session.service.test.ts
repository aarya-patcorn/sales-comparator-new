import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashToken } from "../../lib/tokens.js";

// ------------------------------------------------------------ in-memory prisma

type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

type UserRow = {
  id: string;
  role: "rm" | "admin";
  isActive: boolean;
  name: string | null;
};

const db = {
  sessions: new Map<string, SessionRow>(),
  users: new Map<string, UserRow>(),
};

let sessionSeq = 0;

function matchesSession(row: SessionRow, where: Record<string, unknown>): boolean {
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (typeof where.tokenHash === "string" && row.tokenHash !== where.tokenHash) {
    return false;
  }
  if (typeof where.userId === "string" && row.userId !== where.userId) {
    return false;
  }

  const expiresAt = where.expiresAt as { lte?: Date } | undefined;
  if (expiresAt?.lte && row.expiresAt.getTime() > expiresAt.lte.getTime()) {
    return false;
  }
  return true;
}

const prismaMock = {
  session: {
    create: vi.fn(
      ({ data }: { data: Omit<SessionRow, "id" | "createdAt"> }) => {
        sessionSeq += 1;
        const row: SessionRow = {
          id: `session-${sessionSeq}`,
          createdAt: new Date(),
          ...data,
        };
        db.sessions.set(row.id, row);
        return Promise.resolve({ id: row.id });
      },
    ),
    findUnique: vi.fn(({ where }: { where: { tokenHash: string } }) => {
      const row = [...db.sessions.values()].find(
        (session) => session.tokenHash === where.tokenHash,
      );
      if (!row) return Promise.resolve(null);

      return Promise.resolve({ ...row, user: db.users.get(row.userId) });
    }),
    deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      let count = 0;
      for (const [id, row] of db.sessions) {
        if (matchesSession(row, where)) {
          db.sessions.delete(id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    }),
  },
  user: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(db.users.get(where.id) ?? null),
    ),
  },
};

vi.mock("../../db/client.js", () => ({
  prisma: prismaMock,
  disconnectPrisma: vi.fn(),
}));

const {
  SESSION_TTL_MS,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  resolveSession,
  ttlMsForRole,
} = await import("./session.service.js");

const RM: UserRow = { id: "user-rm", role: "rm", isActive: true, name: "Ravi" };
const ADMIN: UserRow = {
  id: "user-admin",
  role: "admin",
  isActive: true,
  name: "Asha",
};

beforeEach(() => {
  db.sessions.clear();
  db.users.clear();
  db.users.set(RM.id, { ...RM });
  db.users.set(ADMIN.id, { ...ADMIN });
  sessionSeq = 0;
  vi.clearAllMocks();
});

describe("TTL configuration", () => {
  it("defaults to 7 days for rm and 12 hours for admin", () => {
    expect(SESSION_TTL_MS.rm).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SESSION_TTL_MS.admin).toBe(12 * 60 * 60 * 1000);
    expect(ttlMsForRole("rm")).toBe(SESSION_TTL_MS.rm);
    expect(ttlMsForRole("admin")).toBe(SESSION_TTL_MS.admin);
  });
});

describe("createSession", () => {
  it("stores only the token hash, never the plaintext", async () => {
    const { token } = await createSession(RM.id);
    const stored = [...db.sessions.values()][0];

    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("applies the role TTL by default", async () => {
    const before = Date.now();
    const rm = await createSession(RM.id);
    const admin = await createSession(ADMIN.id);

    expect(rm.expiresAt.getTime() - before).toBeGreaterThan(
      SESSION_TTL_MS.rm - 5_000,
    );
    expect(admin.expiresAt.getTime() - before).toBeLessThan(
      SESSION_TTL_MS.admin + 5_000,
    );
  });

  it("honours an explicit ttl", async () => {
    const before = Date.now();
    const { expiresAt } = await createSession(RM.id, 60_000);

    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(59_000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(61_000);
  });

  it("issues a different token every time", async () => {
    const a = await createSession(RM.id);
    const b = await createSession(RM.id);

    expect(a.token).not.toBe(b.token);
    expect(db.sessions.size).toBe(2);
  });

  it("refuses to create a session for an unknown user", async () => {
    await expect(createSession("nobody")).rejects.toThrow(/unknown user/i);
  });
});

describe("resolveSession", () => {
  it("returns the user for a valid token", async () => {
    const { token } = await createSession(RM.id);
    const user = await resolveSession(token);

    expect(user?.id).toBe(RM.id);
    expect(user?.role).toBe("rm");
  });

  it("returns null for an unknown or empty token", async () => {
    await createSession(RM.id);

    expect(await resolveSession("not-a-real-token")).toBeNull();
    expect(await resolveSession("")).toBeNull();
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1); // empty short-circuits
  });

  it("rejects and purges an expired session", async () => {
    const { token } = await createSession(RM.id, 20);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(await resolveSession(token)).toBeNull();
    expect(db.sessions.size).toBe(0); // opportunistic cleanup
  });

  it("rejects a session whose user was deactivated", async () => {
    const { token } = await createSession(RM.id);
    db.users.set(RM.id, { ...RM, isActive: false });

    expect(await resolveSession(token)).toBeNull();
    expect(db.sessions.size).toBe(1); // still present; only login is blocked
  });
});

describe("deleteSession", () => {
  it("logs out exactly the matching session", async () => {
    const first = await createSession(RM.id);
    const second = await createSession(RM.id);

    expect(await deleteSession(first.token)).toBe(true);
    expect(await resolveSession(first.token)).toBeNull();
    expect((await resolveSession(second.token))?.id).toBe(RM.id);
  });

  it("returns false for unknown and empty tokens", async () => {
    expect(await deleteSession("nope")).toBe(false);
    expect(await deleteSession("")).toBe(false);
  });
});

describe("deleteSessionsForUser", () => {
  it("revokes every session of one user only", async () => {
    await createSession(RM.id);
    await createSession(RM.id);
    const adminSession = await createSession(ADMIN.id);

    expect(await deleteSessionsForUser(RM.id)).toBe(2);
    expect((await resolveSession(adminSession.token))?.id).toBe(ADMIN.id);
  });
});

describe("deleteExpiredSessions", () => {
  it("removes only sessions past their expiry", async () => {
    const expired = await createSession(RM.id, -1_000);
    const live = await createSession(ADMIN.id);

    expect(await deleteExpiredSessions()).toBe(1);
    expect(db.sessions.size).toBe(1);
    expect(await resolveSession(expired.token)).toBeNull();
    expect((await resolveSession(live.token))?.id).toBe(ADMIN.id);
  });
});
