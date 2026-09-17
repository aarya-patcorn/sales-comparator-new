import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * A single PrismaClient per process.
 *
 * `tsx watch` and vitest re-evaluate modules in place, which would otherwise leak a
 * new connection pool on every reload, so the instance is cached on globalThis
 * outside production.
 */
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

/**
 * Creates a Prisma client for the supplied Postgres connection. Node uses
 * DATABASE_URL; the Worker supplies Hyperdrive's connection string at startup.
 */
export function createPrismaClient(
  connectionString = env.DATABASE_URL,
): PrismaClient {
  // Prisma 7 talks to Postgres through a driver adapter (node-postgres).
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : env.NODE_ENV === "test"
          ? ["error"]
          : ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
