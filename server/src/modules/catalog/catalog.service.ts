import { prisma } from "../../db/client.js";
import type {
  ApplicationArea,
  Competitor,
  CompetitorProduct,
  Product,
  Substrate,
  TileType,
  TileTypeSize,
} from "../../generated/prisma/client.js";

export function listSubstrates(): Promise<Substrate[]> {
  return prisma.substrate.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function substrateExists(id: string): Promise<boolean> {
  return prisma.substrate
    .findUnique({ where: { id }, select: { id: true } })
    .then((row) => row !== null);
}

/**
 * Tile types, optionally restricted to those mapped to a substrate through
 * substrate_tile_map.
 */
export function listTileTypes(
  substrateId?: string,
): Promise<(TileType & { sizes: TileTypeSize[] })[]> {
  return prisma.tileType.findMany({
    where:
      substrateId === undefined
        ? {}
        : { substrates: { some: { substrateId } } },
    include: { sizes: { orderBy: { id: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function listApplicationAreas(): Promise<ApplicationArea[]> {
  return prisma.applicationArea.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/**
 * Live Kamdhenu products only.
 *
 * The database is the single source of truth — there is deliberately no static
 * fallback list, which is what let the old app resurrect deactivated products
 * (blueprint §10, defect #5).
 */
export function listActiveProducts(): Promise<Product[]> {
  return prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ code: "asc" }],
  });
}

/**
 * Live competitors with their live products, read straight from
 * competitor_products (blueprint §10, defect #1: comparisons must never read a
 * hardcoded array).
 */
export function listCompetitorsWithProducts(): Promise<
  (Competitor & { products: CompetitorProduct[] })[]
> {
  return prisma.competitor.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      products: {
        where: { isActive: true, deletedAt: null },
        orderBy: [{ name: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }],
  });
}
