import { prisma } from "../../db/client.js";
import { logger } from "../../lib/logger.js";

/**
 * Fallback copy is cached only briefly so a transient OpenAI outage cannot
 * pin low-quality text to a product forever (blueprint §10, defect #7).
 */
export const FALLBACK_TTL_MS = 15 * 60 * 1000;

export type CachedPitch = { lines: string[]; isFallback: boolean };
export type CachedLetter = { content: string; isFallback: boolean };

function expiryFor(isFallback: boolean): Date | null {
  return isFallback ? new Date(Date.now() + FALLBACK_TTL_MS) : null;
}

/** A row is a miss once `expires_at` has passed; expired rows are deleted. */
function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now();
}

export async function readPitchCache(
  cacheKey: string,
): Promise<CachedPitch | null> {
  const row = await prisma.pitchCache.findUnique({ where: { cacheKey } });
  if (!row) return null;

  if (isExpired(row.expiresAt)) {
    await prisma.pitchCache.deleteMany({ where: { cacheKey } });
    return null;
  }

  if (!Array.isArray(row.lines)) {
    logger.warn({ cacheKey }, "Discarding malformed pitch cache entry");
    await prisma.pitchCache.deleteMany({ where: { cacheKey } });
    return null;
  }

  return {
    lines: row.lines.filter((line): line is string => typeof line === "string"),
    isFallback: row.isFallback,
  };
}

export async function writePitchCache(
  cacheKey: string,
  lines: string[],
  isFallback: boolean,
): Promise<void> {
  const data = { lines, isFallback, expiresAt: expiryFor(isFallback) };

  await prisma.pitchCache.upsert({
    where: { cacheKey },
    create: { cacheKey, ...data },
    update: data,
  });
}

export async function readRecommendationCache(
  cacheKey: string,
): Promise<CachedLetter | null> {
  const row = await prisma.recommendationCache.findUnique({
    where: { cacheKey },
  });
  if (!row) return null;

  if (isExpired(row.expiresAt)) {
    await prisma.recommendationCache.deleteMany({ where: { cacheKey } });
    return null;
  }

  return { content: row.content, isFallback: row.isFallback };
}

export async function writeRecommendationCache(
  cacheKey: string,
  content: string,
  isFallback: boolean,
): Promise<void> {
  const data = { content, isFallback, expiresAt: expiryFor(isFallback) };

  await prisma.recommendationCache.upsert({
    where: { cacheKey },
    create: { cacheKey, ...data },
    update: data,
  });
}

/**
 * Drops cached copy that was written against now-superseded specs (defect #6).
 *
 * The spec hash in the key already makes stale rows unreachable, so this is
 * belt-and-braces: it reclaims the space and guarantees the old text can never
 * be served again, even if a hash were ever to collide or a key format change.
 *
 * Cache key layouts (see ai.controller.ts):
 *   pitch  : `<code>|<competitorSlug>:<competitorProductId>|<hash>|<ver>|<variant>`
 *   letter : `<code>|<competitorName>/<productName>,...|<hash>|<ctx>|<ver>`
 */
export async function invalidateAiCaches(target: {
  productCode?: string;
  competitorProductId?: string;
  competitorProductLabels?: string[];
}): Promise<number> {
  let deleted = 0;

  if (target.productCode) {
    const startsWith = `${target.productCode}|`;

    const [pitch, letter] = await Promise.all([
      prisma.pitchCache.deleteMany({ where: { cacheKey: { startsWith } } }),
      prisma.recommendationCache.deleteMany({
        where: { cacheKey: { startsWith } },
      }),
    ]);
    deleted += pitch.count + letter.count;
  }

  if (target.competitorProductId) {
    const { count } = await prisma.pitchCache.deleteMany({
      where: { cacheKey: { contains: `:${target.competitorProductId}|` } },
    });
    deleted += count;
  }

  // Letter keys identify competitor products by name, not id, so both the old
  // and the new label have to be cleared on a rename.
  for (const label of target.competitorProductLabels ?? []) {
    const { count } = await prisma.recommendationCache.deleteMany({
      where: { cacheKey: { contains: label } },
    });
    deleted += count;
  }

  if (deleted > 0) {
    logger.info({ ...target, deleted }, "Invalidated AI cache entries");
  }
  return deleted;
}
