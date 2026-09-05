/**
 * In-memory stand-in for the small slice of PrismaClient the auth flow touches.
 *
 * Tests mock `src/db/client.js` with this so the whole stack — routing,
 * validation, middleware, session hashing, controllers — runs for real while the
 * database is deterministic and in-process.
 *
 * Excluded from the tsc build (see tsconfig "exclude").
 */
import { vi } from "vitest";

export type FakeUser = {
  id: string;
  role: "rm" | "admin";
  name: string | null;
  email: string | null;
  mobileNumber: string | null;
  googleSub: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const now = new Date();
  return {
    id: `user-${Math.random().toString(36).slice(2, 10)}`,
    role: "rm",
    name: null,
    email: null,
    mobileNumber: null,
    googleSub: null,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Supports `value`, `{ equals, mode: "insensitive" }` and `OR: [...]`. */
function matchesUser(user: FakeUser, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;

    if (key === "OR") {
      const alternatives = expected as Record<string, unknown>[];
      if (!alternatives.some((alt) => matchesUser(user, alt))) return false;
      continue;
    }

    const actual = user[key as keyof FakeUser];

    if (
      expected !== null &&
      typeof expected === "object" &&
      "equals" in expected
    ) {
      const { equals, mode } = expected as { equals: unknown; mode?: string };

      if (
        mode === "insensitive" &&
        typeof actual === "string" &&
        typeof equals === "string"
      ) {
        if (actual.toLowerCase() !== equals.toLowerCase()) return false;
        continue;
      }
      if (actual !== equals) return false;
      continue;
    }

    if (actual !== expected) return false;
  }
  return true;
}

function matchesSession(
  session: FakeSession,
  where: Record<string, unknown>,
): boolean {
  if (typeof where.id === "string" && session.id !== where.id) return false;
  if (
    typeof where.tokenHash === "string" &&
    session.tokenHash !== where.tokenHash
  ) {
    return false;
  }
  if (typeof where.userId === "string" && session.userId !== where.userId) {
    return false;
  }

  const expiresAt = where.expiresAt as { lte?: Date } | undefined;
  if (expiresAt?.lte && session.expiresAt.getTime() > expiresAt.lte.getTime()) {
    return false;
  }
  return true;
}

export function createFakePrisma() {
  const users = new Map<string, FakeUser>();
  const sessions = new Map<string, FakeSession>();
  let sessionSeq = 0;

  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
      ),
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...users.values()].find((user) => matchesUser(user, where)) ?? null,
        ),
      ),
      update: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeUser>;
        }) => {
          const user = users.get(where.id);
          if (!user) return Promise.reject(new Error("user not found"));

          const updated = { ...user, ...data, updatedAt: new Date() };
          users.set(updated.id, updated);
          return Promise.resolve(updated);
        },
      ),
    },
    session: {
      create: vi.fn(
        ({
          data,
        }: {
          data: { userId: string; tokenHash: string; expiresAt: Date };
        }) => {
          sessionSeq += 1;
          const row: FakeSession = {
            id: `session-${sessionSeq}`,
            createdAt: new Date(),
            ...data,
          };
          sessions.set(row.id, row);
          return Promise.resolve({ id: row.id });
        },
      ),
      findUnique: vi.fn(({ where }: { where: { tokenHash: string } }) => {
        const row = [...sessions.values()].find(
          (session) => session.tokenHash === where.tokenHash,
        );
        if (!row) return Promise.resolve(null);

        return Promise.resolve({ ...row, user: users.get(row.userId) });
      }),
      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (const [id, row] of sessions) {
          if (matchesSession(row, where)) {
            sessions.delete(id);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
      count: vi.fn(() => Promise.resolve(sessions.size)),
    },
    // Catalog models are plain stubs: the catalog tests assert the query
    // arguments and drive the return values directly.
    substrate: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(() => Promise.resolve(null)),
    },
    tileType: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(() => Promise.resolve(null)),
    },
    applicationArea: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(() => Promise.resolve(null)),
    },
    product: {
      findMany: vi.fn(() => Promise.resolve([])),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    competitor: {
      findMany: vi.fn(() => Promise.resolve([])),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    competitorProduct: {
      findMany: vi.fn(() => Promise.resolve([])),
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve(null)),
    },
    pitchCache: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      upsert: vi.fn(() => Promise.resolve(null)),
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    recommendationCache: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      upsert: vi.fn(() => Promise.resolve(null)),
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
  };

  return {
    prisma,
    users,
    sessions,
    seedUser(overrides: Partial<FakeUser> = {}): FakeUser {
      const user = makeUser(overrides);
      users.set(user.id, user);
      return user;
    },
    reset(): void {
      users.clear();
      sessions.clear();
      sessionSeq = 0;
    },
  };
}
