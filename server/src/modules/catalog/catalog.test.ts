import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePrisma } from "../../test/fakePrisma.js";

const fake = createFakePrisma();

vi.mock("../../db/client.js", () => ({
  prisma: fake.prisma,
  disconnectPrisma: vi.fn(),
}));

const { createApp } = await import("../../app.js");
const { createSession } = await import("../auth/session.service.js");

const app = createApp();

let rmToken = "";
let adminToken = "";

const now = new Date();

const substrateRow = {
  id: "concrete",
  name: "Concrete",
  sortOrder: 0,
  createdAt: now,
};

const tileTypeRow = {
  id: "vitrified",
  name: "Vitrified",
  category: "porcelain",
  sortOrder: 1,
  createdAt: now,
  sizes: [
    { id: 1n, tileTypeId: "vitrified", sizeLabel: "24 x 24 in" },
    { id: 2n, tileTypeId: "vitrified", sizeLabel: "24 x 48 in" },
  ],
};

const productRow = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "K90",
  name: "Kamdhenu Tile Adhesive K90",
  description: "Deformable adhesive",
  enClassification: "C2TE S1",
  applicationAreas: ["kitchen", "bathroom"],
  technicalParams: { open_time: "20-30 minutes", legacy_key: "ignored" },
  isActive: true,
  deletedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

const competitorRow = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Example Adhesives Co.",
  slug: "example_adhesives",
  isActive: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  products: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      competitorId: "22222222-2222-4222-8222-222222222222",
      name: "ExampleFix Standard",
      enClassification: "C1T",
      competesWith: "K50",
      technicalParams: { color: "Grey" },
      specSource: "manual" as const,
      tdsFileUrl: null,
      tdsFileName: null,
      aiRawExtraction: { secret: "raw ai output" },
      aiModel: null,
      isActive: true,
      deletedAt: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

beforeEach(async () => {
  fake.reset();
  vi.clearAllMocks();

  const rm = fake.seedUser({ role: "rm", mobileNumber: "919876543210" });
  const admin = fake.seedUser({ role: "admin", email: "asha@example.com" });

  rmToken = (await createSession(rm.id)).token;
  adminToken = (await createSession(admin.id)).token;
});

function get(path: string, token: string | null = rmToken) {
  const req = request(app).get(path);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

describe("catalog auth", () => {
  const paths = [
    "/api/catalog/substrates",
    "/api/catalog/tile-types",
    "/api/catalog/areas",
    "/api/catalog/kamdhenu",
    "/api/catalog/competitors",
  ];

  it("401s every route without a token", async () => {
    for (const path of paths) {
      const res = await get(path, null);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
    }
  });

  it("403s every route for an admin session (RM-only)", async () => {
    for (const path of paths) {
      const res = await get(path, adminToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });
});

describe("GET /api/catalog/substrates", () => {
  it("returns substrates ordered by sort_order", async () => {
    fake.prisma.substrate.findMany.mockResolvedValue([substrateRow]);

    const res = await get("/api/catalog/substrates");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      substrates: [{ id: "concrete", name: "Concrete", sortOrder: 0 }],
    });
    expect(fake.prisma.substrate.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });
});

describe("GET /api/catalog/tile-types", () => {
  it("returns every tile type with its sizes when unfiltered", async () => {
    fake.prisma.tileType.findMany.mockResolvedValue([tileTypeRow]);

    const res = await get("/api/catalog/tile-types");

    expect(res.status).toBe(200);
    expect(res.body.tileTypes).toEqual([
      {
        id: "vitrified",
        name: "Vitrified",
        category: "porcelain",
        sortOrder: 1,
        sizes: ["24 x 24 in", "24 x 48 in"],
      },
    ]);
    expect(fake.prisma.tileType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(fake.prisma.substrate.findUnique).not.toHaveBeenCalled();
  });

  it("filters through substrate_tile_map when substrate_id is given", async () => {
    fake.prisma.substrate.findUnique.mockResolvedValue({ id: "concrete" });
    fake.prisma.tileType.findMany.mockResolvedValue([tileTypeRow]);

    const res = await get("/api/catalog/tile-types?substrate_id=concrete");

    expect(res.status).toBe(200);
    expect(fake.prisma.tileType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { substrates: { some: { substrateId: "concrete" } } },
      }),
    );
  });

  it("404s an unknown substrate instead of returning an empty list", async () => {
    fake.prisma.substrate.findUnique.mockResolvedValue(null);

    const res = await get("/api/catalog/tile-types?substrate_id=nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect(fake.prisma.tileType.findMany).not.toHaveBeenCalled();
  });

  it("400s unknown or malformed query params", async () => {
    for (const query of ["?substrateId=concrete", "?substrate_id=Concrete!"]) {
      const res = await get(`/api/catalog/tile-types${query}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });
});

describe("GET /api/catalog/areas", () => {
  it("returns application areas", async () => {
    fake.prisma.applicationArea.findMany.mockResolvedValue([
      { id: "kitchen", name: "Kitchen", sortOrder: 2 },
    ]);

    const res = await get("/api/catalog/areas");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      areas: [{ id: "kitchen", name: "Kitchen", sortOrder: 2 }],
    });
  });
});

describe("GET /api/catalog/kamdhenu", () => {
  it("reads live products from the database only", async () => {
    fake.prisma.product.findMany.mockResolvedValue([productRow]);

    const res = await get("/api/catalog/kamdhenu");

    expect(res.status).toBe(200);
    // No static fallback (defect #5): the filter is is_active + not deleted.
    expect(fake.prisma.product.findMany).toHaveBeenCalledWith({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ code: "asc" }],
    });
  });

  it("returns an empty list when nothing is active, never a fallback", async () => {
    fake.prisma.product.findMany.mockResolvedValue([]);

    const res = await get("/api/catalog/kamdhenu");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });

  it("normalizes technical params to the canonical keys", async () => {
    fake.prisma.product.findMany.mockResolvedValue([productRow]);

    const res = await get("/api/catalog/kamdhenu");
    const params = res.body.products[0].technicalParams;

    expect(Object.keys(params)).toHaveLength(21);
    expect(params.open_time).toBe("20-30 minutes");
    expect(params.color).toBeNull(); // missing -> null
    expect(params).not.toHaveProperty("legacy_key"); // unknown -> dropped
  });

  it("hides internal columns", async () => {
    fake.prisma.product.findMany.mockResolvedValue([productRow]);

    const res = await get("/api/catalog/kamdhenu");

    expect(Object.keys(res.body.products[0]).sort()).toEqual([
      "applicationAreas",
      "code",
      "description",
      "enClassification",
      "id",
      "name",
      "technicalParams",
    ]);
  });
});

describe("GET /api/catalog/competitors", () => {
  it("reads competitors and their products from the tables", async () => {
    fake.prisma.competitor.findMany.mockResolvedValue([competitorRow]);

    const res = await get("/api/catalog/competitors");

    expect(res.status).toBe(200);
    // Defect #1: comparisons must read competitor_products via the FK.
    expect(fake.prisma.competitor.findMany).toHaveBeenCalledWith({
      where: { isActive: true, deletedAt: null },
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ name: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }],
    });

    expect(res.body.competitors[0]).toMatchObject({
      id: competitorRow.id,
      name: "Example Adhesives Co.",
      slug: "example_adhesives",
    });
  });

  it("filters products by their competing Kamdhenu code", async () => {
    fake.prisma.competitor.findMany.mockResolvedValue([competitorRow]);

    const res = await get("/api/catalog/competitors?competes_with=K90");

    expect(res.status).toBe(200);
    expect(fake.prisma.competitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          products: expect.objectContaining({
            where: { isActive: true, deletedAt: null, competesWith: "K90" },
          }),
        }),
      }),
    );
  });

  it("rejects an unknown competes_with filter", async () => {
    const res = await get("/api/catalog/competitors?competes_with=K70");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(fake.prisma.competitor.findMany).not.toHaveBeenCalled();
  });

  it("exposes spec_source but not the raw AI extraction or file url", async () => {
    fake.prisma.competitor.findMany.mockResolvedValue([competitorRow]);

    const res = await get("/api/catalog/competitors");
    const product = res.body.competitors[0].products[0];

    expect(product.specSource).toBe("manual");
    expect(Object.keys(product).sort()).toEqual([
      "competesWith",
      "enClassification",
      "id",
      "name",
      "specSource",
      "technicalParams",
    ]);
    expect(JSON.stringify(res.body)).not.toContain("raw ai output");
    expect(product.competesWith).toBe("K50");
  });

  it("returns canonical keys per competitor product", async () => {
    fake.prisma.competitor.findMany.mockResolvedValue([competitorRow]);

    const res = await get("/api/catalog/competitors");
    const params = res.body.competitors[0].products[0].technicalParams;

    expect(Object.keys(params)).toHaveLength(21);
    expect(params.color).toBe("Grey");
    expect(params.open_time).toBeNull();
  });
});
