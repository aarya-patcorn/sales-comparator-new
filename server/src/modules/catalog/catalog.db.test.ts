/**
 * Catalog integration tests against a REAL Postgres.
 *
 * Enable by pointing TEST_DATABASE_URL at a migrated throwaway database:
 *
 *   createdb sales_comparator_test
 *   $env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sales_comparator_test"
 *   npx prisma migrate deploy
 *   npm test
 *
 * These exercise what the mocked catalog.test.ts cannot: the real
 * substrate_tile_map join, partial-index filtering of soft-deleted rows, and
 * JSONB round-tripping. They skip (loudly) when no database is reachable.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { prisma } from "../../db/client.js";
import { createSession } from "../auth/session.service.js";

const available = await prisma.substrate
  .findFirst({ select: { id: true } })
  .then(() => true)
  .catch(() => false);

if (!available) {
  // Intentional: a silent skip would hide missing coverage.
  // eslint-disable-next-line no-console
  console.warn(
    "\n[skip] catalog.db.test.ts — no database at TEST_DATABASE_URL; run `npx prisma migrate deploy` against it to enable these tests.\n",
  );
}

const app = createApp();
let rmToken = "";
let adminToken = "";

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      sessions, users, competitor_products, competitors, products,
      substrate_tile_map, tile_type_sizes, tile_types, substrates,
      application_areas
    RESTART IDENTITY CASCADE
  `);
}

describe.skipIf(!available)("catalog (real database)", () => {
  beforeAll(async () => {
    await truncateAll();

    await prisma.substrate.createMany({
      data: [
        { id: "concrete", name: "Concrete", sortOrder: 1 },
        { id: "plywood", name: "Plywood", sortOrder: 0 },
        { id: "glass", name: "Glass", sortOrder: 2 },
      ],
    });

    await prisma.tileType.create({
      data: {
        id: "vitrified",
        name: "Vitrified",
        category: "porcelain",
        sortOrder: 0,
        sizes: {
          create: [{ sizeLabel: "24 x 24 in" }, { sizeLabel: "24 x 48 in" }],
        },
      },
    });
    await prisma.tileType.create({
      data: { id: "marble", name: "Marble", category: "natural_stone", sortOrder: 1 },
    });
    await prisma.tileType.create({
      data: { id: "glass_mosaic", name: "Glass Mosaic", sortOrder: 2 },
    });

    await prisma.substrateTileMap.createMany({
      data: [
        { substrateId: "concrete", tileTypeId: "vitrified" },
        { substrateId: "concrete", tileTypeId: "marble" },
        { substrateId: "glass", tileTypeId: "glass_mosaic" },
      ],
    });

    await prisma.applicationArea.createMany({
      data: [
        { id: "kitchen", name: "Kitchen", sortOrder: 1 },
        { id: "bathroom", name: "Bathroom", sortOrder: 0 },
      ],
    });

    await prisma.product.createMany({
      data: [
        {
          code: "K90",
          name: "Kamdhenu K90",
          enClassification: "C2TE S1",
          applicationAreas: ["kitchen", "bathroom"],
          technicalParams: { open_time: "20-30 minutes", stale_key: "drop me" },
        },
        { code: "K50", name: "Kamdhenu K50", applicationAreas: ["kitchen"] },
        { code: "K60", name: "Inactive product", isActive: false },
        { code: "K80", name: "Deleted product", deletedAt: new Date() },
      ],
    });

    const live = await prisma.competitor.create({
      data: { name: "Example Adhesives Co.", slug: "example_adhesives" },
    });
    await prisma.competitorProduct.createMany({
      data: [
        {
          competitorId: live.id,
          name: "ExampleFix Standard",
          specSource: "manual",
          technicalParams: { color: "Grey" },
        },
        {
          competitorId: live.id,
          name: "Discontinued Product",
          specSource: "manual",
          isActive: false,
        },
        {
          competitorId: live.id,
          name: "Removed Product",
          specSource: "manual",
          deletedAt: new Date(),
        },
      ],
    });

    const hidden = await prisma.competitor.create({
      data: { name: "Soft Deleted Co.", slug: "soft_deleted", deletedAt: new Date() },
    });
    await prisma.competitorProduct.create({
      data: { competitorId: hidden.id, name: "Ghost", specSource: "manual" },
    });

    const rm = await prisma.user.create({
      data: { role: "rm", name: "Ravi", mobileNumber: "919876543210" },
    });
    const admin = await prisma.user.create({
      data: { role: "admin", email: "asha@example.com" },
    });

    rmToken = (await createSession(rm.id)).token;
    adminToken = (await createSession(admin.id)).token;
  });

  afterAll(async () => {
    if (available) await truncateAll();
    await prisma.$disconnect();
  });

  function get(path: string, token: string | null = rmToken) {
    const req = request(app).get(path);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  }

  it("requires an RM session", async () => {
    expect((await get("/api/catalog/substrates", null)).status).toBe(401);
    expect((await get("/api/catalog/substrates", adminToken)).status).toBe(403);
  });

  it("returns substrates ordered by sort_order", async () => {
    const res = await get("/api/catalog/substrates");

    expect(res.status).toBe(200);
    expect(res.body.substrates.map((s: { id: string }) => s.id)).toEqual([
      "plywood",
      "concrete",
      "glass",
    ]);
  });

  it("returns all tile types with sizes when unfiltered", async () => {
    const res = await get("/api/catalog/tile-types");

    expect(res.body.tileTypes.map((t: { id: string }) => t.id)).toEqual([
      "vitrified",
      "marble",
      "glass_mosaic",
    ]);
    expect(res.body.tileTypes[0].sizes).toEqual(["24 x 24 in", "24 x 48 in"]);
    expect(res.body.tileTypes[1].sizes).toEqual([]);
  });

  it("filters tile types through substrate_tile_map", async () => {
    const concrete = await get("/api/catalog/tile-types?substrate_id=concrete");
    expect(concrete.body.tileTypes.map((t: { id: string }) => t.id)).toEqual([
      "vitrified",
      "marble",
    ]);

    const glass = await get("/api/catalog/tile-types?substrate_id=glass");
    expect(glass.body.tileTypes.map((t: { id: string }) => t.id)).toEqual([
      "glass_mosaic",
    ]);

    // Mapped to nothing -> empty, not an error.
    const plywood = await get("/api/catalog/tile-types?substrate_id=plywood");
    expect(plywood.status).toBe(200);
    expect(plywood.body.tileTypes).toEqual([]);
  });

  it("404s an unknown substrate", async () => {
    const res = await get("/api/catalog/tile-types?substrate_id=unobtainium");

    expect(res.status).toBe(404);
  });

  it("returns application areas ordered by sort_order", async () => {
    const res = await get("/api/catalog/areas");

    expect(res.body.areas.map((a: { id: string }) => a.id)).toEqual([
      "bathroom",
      "kitchen",
    ]);
  });

  it("excludes inactive and soft-deleted products", async () => {
    const res = await get("/api/catalog/kamdhenu");

    expect(res.body.products.map((p: { code: string }) => p.code)).toEqual([
      "K50",
      "K90",
    ]);
  });

  it("round-trips JSONB into the 20 canonical keys", async () => {
    const res = await get("/api/catalog/kamdhenu");
    const k90 = res.body.products.find(
      (p: { code: string }) => p.code === "K90",
    );

    expect(Object.keys(k90.technicalParams)).toHaveLength(20);
    expect(k90.technicalParams.open_time).toBe("20-30 minutes");
    expect(k90.technicalParams).not.toHaveProperty("stale_key");
    expect(k90.applicationAreas).toEqual(["kitchen", "bathroom"]);
  });

  it("excludes soft-deleted competitors and their inactive products", async () => {
    const res = await get("/api/catalog/competitors");

    expect(res.body.competitors).toHaveLength(1);
    expect(res.body.competitors[0].slug).toBe("example_adhesives");
    expect(
      res.body.competitors[0].products.map((p: { name: string }) => p.name),
    ).toEqual(["ExampleFix Standard"]);
    expect(res.body.competitors[0].products[0].specSource).toBe("manual");
    expect(res.body.competitors[0].products[0].technicalParams.color).toBe(
      "Grey",
    );
  });
});
