/**
 * Admin CRUD integration tests against a REAL Postgres.
 * Skips (loudly) unless TEST_DATABASE_URL points at a migrated database.
 */
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { prisma } from "../../db/client.js";
import { createSession } from "../auth/session.service.js";
import { emptyParams } from "../../validation/technicalParams.js";

const available = await prisma.user
  .findFirst({ select: { id: true } })
  .then(() => true)
  .catch(() => false);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "\n[skip] admin.db.test.ts — no database at TEST_DATABASE_URL.\n",
  );
}

const app = createApp();

let adminToken = "";
let adminId = "";
let rmToken = "";

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      sessions, users, competitor_products, competitors, products,
      pitch_cache, recommendation_cache
    RESTART IDENTITY CASCADE
  `);
}

function auth(
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  token: string | null = adminToken,
) {
  const req = request(app)[method](path);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

const PARAMS = { ...emptyParams(), open_time: "20-30 minutes", color: "Grey" };

describe.skipIf(!available)("admin API (real database)", () => {
  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    if (available) await truncateAll();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();

    const admin = await prisma.user.create({
      data: { role: "admin", email: "asha@example.com", name: "Asha" },
    });
    const rm = await prisma.user.create({
      data: { role: "rm", mobileNumber: "919000000000", name: "Ravi" },
    });

    adminId = admin.id;
    adminToken = (await createSession(admin.id)).token;
    rmToken = (await createSession(rm.id)).token;
  });

  describe("auth", () => {
    it("401s without a token and 403s an RM session", async () => {
      expect((await auth("get", "/api/admin/dashboard", null)).status).toBe(401);
      expect((await auth("get", "/api/admin/dashboard", rmToken)).status).toBe(403);
      expect((await auth("get", "/api/admin/users", rmToken)).status).toBe(403);
      expect((await auth("get", "/api/admin/products", rmToken)).status).toBe(403);
    });
  });

  describe("GET /api/admin/dashboard", () => {
    it("counts RM users and live products", async () => {
      await prisma.user.createMany({
        data: [
          { role: "rm", mobileNumber: "919111111111" },
          { role: "rm", mobileNumber: "919222222222", isActive: false },
        ],
      });
      await prisma.product.createMany({
        data: [
          { code: "K50", name: "K50", technicalParams: PARAMS },
          { code: "K60", name: "K60", isActive: false },
          { code: "K80", name: "K80", deletedAt: new Date() },
        ],
      });

      const res = await auth("get", "/api/admin/dashboard");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        rmUsers: { total: 3, active: 2 },
        products: { total: 2, active: 1 }, // soft-deleted excluded
      });
    });
  });

  describe("RM users", () => {
    it("creates, rejects duplicates and normalizes the number", async () => {
      const created = await auth("post", "/api/admin/users").send({
        name: "Priya",
        mobileNumber: "+91 98765-43210",
      });

      expect(created.status).toBe(201);
      expect(created.body.user).toMatchObject({
        role: "rm",
        name: "Priya",
        mobileNumber: "919876543210",
        isActive: true,
      });

      const duplicate = await auth("post", "/api/admin/users").send({
        mobileNumber: "919876543210",
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("duplicate_mobile_number");
    });

    it("searches and paginates", async () => {
      await prisma.user.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          role: "rm" as const,
          name: `Rep ${i}`,
          mobileNumber: `9198${String(i).padStart(5, "0")}`,
        })),
      });

      const page = await auth("get", "/api/admin/users?page=2&pageSize=10");
      expect(page.body.users).toHaveLength(10);
      expect(page.body.pagination).toEqual({
        page: 2,
        pageSize: 10,
        total: 26, // 25 + the seeded Ravi
        totalPages: 3,
      });

      const search = await auth("get", "/api/admin/users?search=Rep%201");
      expect(search.body.users.length).toBeGreaterThan(0);
      expect(
        search.body.users.every((u: { name: string }) => u.name.includes("Rep 1")),
      ).toBe(true);

      const inactive = await auth("get", "/api/admin/users?isActive=false");
      expect(inactive.body.users).toHaveLength(0);
    });

    it("updates and 404s an unknown id", async () => {
      const user = await prisma.user.create({
        data: { role: "rm", mobileNumber: "919333333333" },
      });

      const res = await auth("put", `/api/admin/users/${user.id}`).send({
        name: "Renamed",
      });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe("Renamed");

      const missing = await auth(
        "put",
        "/api/admin/users/11111111-1111-4111-8111-111111111111",
      ).send({ name: "x" });
      expect(missing.status).toBe(404);
    });

    it("deactivating revokes live sessions immediately", async () => {
      const user = await prisma.user.create({
        data: { role: "rm", mobileNumber: "919444444444" },
      });
      const { token } = await createSession(user.id);

      const res = await auth("patch", `/api/admin/users/${user.id}/status`).send({
        isActive: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.user.isActive).toBe(false);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
      expect(
        (await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${token}`)).status,
      ).toBe(401);
    });

    it("hard deletes and cascades sessions", async () => {
      const user = await prisma.user.create({
        data: { role: "rm", mobileNumber: "919555555555" },
      });
      await createSession(user.id);

      const res = await auth("delete", `/api/admin/users/${user.id}`);

      expect(res.status).toBe(204);
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe("admin allow-list", () => {
    it("lists, adds and rejects duplicates case-insensitively", async () => {
      const list = await auth("get", "/api/admin/admins");
      expect(list.body.admins).toHaveLength(1);
      expect(list.body.admins[0].googleLinked).toBe(false);

      const created = await auth("post", "/api/admin/admins").send({
        email: "New.Admin@Example.com",
        name: "New Admin",
      });
      expect(created.status).toBe(201);
      expect(created.body.user.email).toBe("new.admin@example.com");
      expect(created.body.user.role).toBe("admin");

      const duplicate = await auth("post", "/api/admin/admins").send({
        email: "ASHA@example.com",
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("duplicate_admin");
    });

    it("deactivates another admin but not yourself", async () => {
      const other = await prisma.user.create({
        data: { role: "admin", email: "other@example.com" },
      });
      await createSession(other.id);

      const ok = await auth("patch", `/api/admin/admins/${other.id}/status`).send({
        isActive: false,
      });
      expect(ok.status).toBe(200);
      expect(await prisma.session.count({ where: { userId: other.id } })).toBe(0);

      const self = await auth("patch", `/api/admin/admins/${adminId}/status`).send({
        isActive: false,
      });
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe("cannot_deactivate_self");
    });
  });

  describe("products", () => {
    it("creates, enforces the unique active code and validates params", async () => {
      const created = await auth("post", "/api/admin/products").send({
        code: "K90",
        name: "Kamdhenu K90",
        enClassification: "C2TE S1",
        applicationAreas: ["terrace"],
        technicalParams: PARAMS,
      });

      expect(created.status).toBe(201);
      expect(created.body.product.technicalParams.open_time).toBe("20-30 minutes");

      const duplicate = await auth("post", "/api/admin/products").send({
        code: "K90",
        name: "Clash",
        technicalParams: PARAMS,
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("duplicate_product_code");

      const invalid = await auth("post", "/api/admin/products").send({
        code: "K91",
        name: "Bad params",
        technicalParams: { open_time: "5 min" },
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe("validation_error");
    });

    it("soft deletes and frees the code for reuse", async () => {
      const product = await prisma.product.create({
        data: { code: "K90", name: "Old K90", technicalParams: PARAMS },
      });

      expect((await auth("delete", `/api/admin/products/${product.id}`)).status).toBe(204);

      const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.isActive).toBe(false);

      // Still in the table, but no longer visible or blocking the code.
      expect((await auth("get", "/api/admin/products")).body.products).toHaveLength(0);
      expect(
        (await auth("post", "/api/admin/products").send({
          code: "K90",
          name: "New K90",
          technicalParams: PARAMS,
        })).status,
      ).toBe(201);
    });

    it("searches and filters by status", async () => {
      await prisma.product.createMany({
        data: [
          { code: "K50", name: "Standard", technicalParams: PARAMS },
          { code: "K90", name: "Deformable", isActive: false },
        ],
      });

      expect((await auth("get", "/api/admin/products?search=deform")).body.products)
        .toHaveLength(1);
      expect((await auth("get", "/api/admin/products?isActive=true")).body.products)
        .toHaveLength(1);
      expect((await auth("get", "/api/admin/products?search=K5")).body.products[0].code)
        .toBe("K50");
    });

    it("clears AI caches when specs change (defect #6)", async () => {
      const product = await prisma.product.create({
        data: { code: "K90", name: "K90", technicalParams: PARAMS },
      });
      await prisma.pitchCache.create({
        data: { cacheKey: "K90|example:1|hash|pitch-v1|general", lines: ["Stale."] },
      });
      await prisma.recommendationCache.create({
        data: { cacheKey: "K90|Example/Fix|hash|~~~|letter-v1", content: "Stale." },
      });
      await prisma.pitchCache.create({
        data: { cacheKey: "K50|example:1|hash|pitch-v1|general", lines: ["Keep."] },
      });

      const res = await auth("put", `/api/admin/products/${product.id}`).send({
        technicalParams: { ...PARAMS, open_time: "40 minutes" },
      });

      expect(res.status).toBe(200);
      expect(await prisma.pitchCache.count()).toBe(1); // only the K50 row survives
      expect(await prisma.recommendationCache.count()).toBe(0);
    });

    it("does not clear caches for an unrelated edit", async () => {
      const product = await prisma.product.create({
        data: { code: "K90", name: "K90", technicalParams: PARAMS },
      });
      await prisma.pitchCache.create({
        data: { cacheKey: "K90|example:1|hash|pitch-v1|general", lines: ["Keep."] },
      });

      await auth("put", `/api/admin/products/${product.id}`).send({
        name: "Renamed only",
      });

      expect(await prisma.pitchCache.count()).toBe(1);
    });
  });

  describe("competitors", () => {
    async function seedCompetitorWithProduct() {
      const competitor = await prisma.competitor.create({
        data: { name: "Example Co.", slug: "example_co" },
      });
      const product = await prisma.competitorProduct.create({
        data: {
          competitorId: competitor.id,
          name: "ExampleFix",
          specSource: "manual",
          technicalParams: PARAMS,
        },
      });
      return { competitor, product };
    }

    it("creates and rejects a duplicate active slug", async () => {
      const created = await auth("post", "/api/admin/competitors").send({
        name: "Example Co.",
        slug: "example_co",
      });
      expect(created.status).toBe(201);

      const duplicate = await auth("post", "/api/admin/competitors").send({
        name: "Another",
        slug: "example_co",
      });
      expect(duplicate.status).toBe(409);
    });

    it("cascades status to child products", async () => {
      const { competitor, product } = await seedCompetitorWithProduct();

      const res = await auth(
        "patch",
        `/api/admin/competitors/${competitor.id}/status`,
      ).send({ isActive: false });

      expect(res.status).toBe(200);
      expect(
        (await prisma.competitorProduct.findUniqueOrThrow({ where: { id: product.id } }))
          .isActive,
      ).toBe(false);
    });

    it("soft deletes and cascades deletion to child products", async () => {
      const { competitor, product } = await seedCompetitorWithProduct();

      expect((await auth("delete", `/api/admin/competitors/${competitor.id}`)).status)
        .toBe(204);

      const child = await prisma.competitorProduct.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(child.deletedAt).not.toBeNull();
      expect(child.isActive).toBe(false);

      // Gone from both admin and RM-facing reads.
      expect((await auth("get", "/api/admin/competitors")).body.competitors).toHaveLength(0);
      const rmView = await request(app)
        .get("/api/catalog/competitors")
        .set("Authorization", `Bearer ${rmToken}`);
      expect(rmView.body.competitors).toHaveLength(0);
    });

    it("reports the live product count", async () => {
      const { competitor } = await seedCompetitorWithProduct();
      await prisma.competitorProduct.create({
        data: {
          competitorId: competitor.id,
          name: "Deleted one",
          specSource: "manual",
          deletedAt: new Date(),
        },
      });

      const res = await auth("get", "/api/admin/competitors");
      expect(res.body.competitors[0].productCount).toBe(1);
    });

    describe("competitor products", () => {
      it("lists, filters by competitor and hides soft-deleted rows", async () => {
        const { competitor, product } = await seedCompetitorWithProduct();
        await prisma.competitorProduct.create({
          data: {
            competitorId: competitor.id,
            name: "Removed",
            specSource: "manual",
            deletedAt: new Date(),
          },
        });

        const res = await auth(
          "get",
          `/api/admin/competitor-products?competitorId=${competitor.id}`,
        );

        expect(res.body.competitorProducts).toHaveLength(1);
        expect(res.body.competitorProducts[0]).toMatchObject({
          id: product.id,
          competitorName: "Example Co.",
          specSource: "manual",
        });
      });

      it("updates specs and clears the AI caches", async () => {
        const { product } = await seedCompetitorWithProduct();
        await prisma.pitchCache.create({
          data: {
            cacheKey: `K90|example_co:${product.id}|hash|pitch-v1|general`,
            lines: ["Stale."],
          },
        });
        await prisma.recommendationCache.create({
          data: {
            cacheKey: "K90|Example Co./ExampleFix|hash|~~~|letter-v1",
            content: "Stale.",
          },
        });

        const res = await auth(
          "put",
          `/api/admin/competitor-products/${product.id}`,
        ).send({ technicalParams: { ...PARAMS, color: "White" } });

        expect(res.status).toBe(200);
        expect(res.body.competitorProduct.technicalParams.color).toBe("White");
        expect(await prisma.pitchCache.count()).toBe(0);
        expect(await prisma.recommendationCache.count()).toBe(0);
      });

      it("rejects a duplicate name within the same competitor", async () => {
        const { competitor, product } = await seedCompetitorWithProduct();
        await prisma.competitorProduct.create({
          data: {
            competitorId: competitor.id,
            name: "Second",
            specSource: "manual",
          },
        });

        const res = await auth(
          "put",
          `/api/admin/competitor-products/${product.id}`,
        ).send({ name: "Second" });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("duplicate_competitor_product");
      });

      it("soft deletes", async () => {
        const { product } = await seedCompetitorWithProduct();

        expect(
          (await auth("delete", `/api/admin/competitor-products/${product.id}`)).status,
        ).toBe(204);

        const row = await prisma.competitorProduct.findUniqueOrThrow({
          where: { id: product.id },
        });
        expect(row.deletedAt).not.toBeNull();
        expect(
          (await auth("get", "/api/admin/competitor-products")).body.competitorProducts,
        ).toHaveLength(0);
      });

      it("returns a signed URL for a stored TDS on the detail route", async () => {
        const { competitor } = await seedCompetitorWithProduct();
        const withFile = await prisma.competitorProduct.create({
          data: {
            competitorId: competitor.id,
            name: "From TDS",
            specSource: "tds_ai",
            tdsFileUrl: "tds/6b1f0d2c-0000-4000-8000-000000000000-sheet.pdf",
            tdsFileName: "sheet.pdf",
          },
        });

        const res = await auth(
          "get",
          `/api/admin/competitor-products/${withFile.id}`,
        );

        expect(res.status).toBe(200);
        // The path is what is persisted; the signed URL is minted per request.
        expect(res.body.competitorProduct.tdsFileUrl).toBe(
          "tds/6b1f0d2c-0000-4000-8000-000000000000-sheet.pdf",
        );
        expect(res.body.competitorProduct.tdsFileSignedUrl).toContain(
          "tds/6b1f0d2c-0000-4000-8000-000000000000-sheet.pdf",
        );

        // Nothing signed was written back to the row.
        const stored = await prisma.competitorProduct.findUniqueOrThrow({
          where: { id: withFile.id },
        });
        expect(stored.tdsFileUrl).not.toContain("http");
      });

      it("returns a null signed URL when no file is attached", async () => {
        const { product } = await seedCompetitorWithProduct();

        const res = await auth(
          "get",
          `/api/admin/competitor-products/${product.id}`,
        );

        expect(res.body.competitorProduct.tdsFileSignedUrl).toBeNull();
      });

      it("hard deletes and removes the stored file with ?purge=true", async () => {
        const { competitor } = await seedCompetitorWithProduct();
        const withFile = await prisma.competitorProduct.create({
          data: {
            competitorId: competitor.id,
            name: "Uploaded in error",
            specSource: "tds_ai",
            tdsFileUrl: "tds/never-written.pdf",
            tdsFileName: "oops.pdf",
          },
        });

        const res = await auth(
          "delete",
          `/api/admin/competitor-products/${withFile.id}?purge=true`,
        );

        expect(res.status).toBe(204);
        // Row is gone entirely, not soft-deleted.
        expect(
          await prisma.competitorProduct.count({ where: { id: withFile.id } }),
        ).toBe(0);
      });
    });
  });

  describe("validation", () => {
    it("400s malformed ids and bodies", async () => {
      expect((await auth("get", "/api/admin/products/not-a-uuid")).status).toBe(400);
      expect(
        (await auth("post", "/api/admin/users").send({ mobileNumber: "12" })).status,
      ).toBe(400);
      expect(
        (await auth("post", "/api/admin/competitors").send({
          name: "X",
          slug: "Bad Slug",
        })).status,
      ).toBe(400);
      expect((await auth("get", "/api/admin/users?pageSize=500")).status).toBe(400);
    });
  });
});
