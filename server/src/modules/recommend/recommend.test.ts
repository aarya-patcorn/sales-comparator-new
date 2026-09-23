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

const K90 = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "K90",
  name: "Kamdhenu Tile Adhesive K90",
  description: "Deformable adhesive",
  enClassification: "C2TE S1",
  applicationAreas: ["terrace"],
  installationSuitability: ["outdoor"],
  technicalParams: { open_time: "20-30 minutes" },
  isActive: true,
  deletedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

const VALID_BODY = {
  substrateId: "concrete",
  tileTypeId: "vitrified",
  tileSize: "24 x 24 in", // 609.6 mm -> outdoor rule stays at K90 (< 800 mm)
  area: "terrace",
  installationSuitability: "outdoor",
};

function post(body: unknown, token: string | null = rmToken) {
  const req = request(app).post("/api/recommend");
  return token ? req.set("Authorization", `Bearer ${token}`).send(body) : req.send(body);
}

beforeEach(async () => {
  fake.reset();
  vi.clearAllMocks();

  const rm = fake.seedUser({ role: "rm", mobileNumber: "919876543210" });
  const admin = fake.seedUser({ role: "admin", email: "asha@example.com" });
  rmToken = (await createSession(rm.id)).token;
  adminToken = (await createSession(admin.id)).token;

  // Catalog lookups succeed by default.
  fake.prisma.substrate.findUnique.mockResolvedValue({ id: "concrete" });
  fake.prisma.tileType.findUnique.mockResolvedValue({
    id: "vitrified",
    sizes: [{ sizeLabel: "24 x 48 in" }, { sizeLabel: "24 x 24 in" }],
  });
  fake.prisma.applicationArea.findUnique.mockResolvedValue({ id: "terrace" });
  fake.prisma.product.findFirst.mockResolvedValue(K90);
});

describe("auth", () => {
  it("401s without a token and 403s an admin", async () => {
    expect((await post(VALID_BODY, null)).status).toBe(401);
    expect((await post(VALID_BODY, adminToken)).status).toBe(403);
  });
});

describe("POST /api/recommend", () => {
  it("returns the resolved product and the reasoning", async () => {
    const res = await post(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.recommendation).toMatchObject({
      code: "K90",
      rule: "outdoor_or_facade",
    });
    expect(res.body.recommendation.sizeMm).toBeCloseTo(609.6, 5);
    expect(res.body.recommendation.reasons.at(-1)).toBe(
      "Recommended product: K90.",
    );
    expect(res.body.product).toMatchObject({ code: "K90", enClassification: "C2TE S1" });
    // Full product payload, normalized to the 20 canonical keys.
    expect(Object.keys(res.body.product.technicalParams)).toHaveLength(20);
  });

  it("resolves the code against live products only", async () => {
    await post(VALID_BODY);

    expect(fake.prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        code: "K90",
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: [{ substrateIds: { equals: [] } }, { substrateIds: { has: "concrete" } }] },
          { OR: [{ tileTypeIds: { equals: [] } }, { tileTypeIds: { has: "vitrified" } }] },
          { OR: [{ tileSizes: { equals: [] } }, { tileSizes: { has: "24 x 24 in" } }] },
          { OR: [{ installationSuitability: { equals: [] } }, { installationSuitability: { has: "outdoor" } }] },
        ],
      },
    });
  });

  it("409s rather than substituting when the product is missing or inactive", async () => {
    fake.prisma.product.findFirst.mockResolvedValue(null);

    const res = await post(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("recommended_product_unavailable");
    expect(res.body.error.message).toContain("K90");
    expect(res.body.error.details).toEqual({ code: "K90" });
    expect(res.body).not.toHaveProperty("product");
  });

  it("400s an unknown substrate, tile type or area", async () => {
    fake.prisma.substrate.findUnique.mockResolvedValue(null);
    let res = await post(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_reference");
    expect(res.body.error.message).toContain("substrateId");

    fake.prisma.substrate.findUnique.mockResolvedValue({ id: "concrete" });
    fake.prisma.tileType.findUnique.mockResolvedValue(null);
    res = await post(VALID_BODY);
    expect(res.body.error.message).toContain("tileTypeId");

    fake.prisma.tileType.findUnique.mockResolvedValue({ id: "vitrified", sizes: [] });
    fake.prisma.applicationArea.findUnique.mockResolvedValue(null);
    res = await post(VALID_BODY);
    expect(res.body.error.message).toContain("area");

    expect(fake.prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it("400s a size label the tile type does not offer", async () => {
    const res = await post({ ...VALID_BODY, tileSize: "99 x 99 in" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_reference");
    expect(res.body.error.message).toContain("tileSize");
  });

  it("accepts any label when the tile type has no registered sizes", async () => {
    fake.prisma.tileType.findUnique.mockResolvedValue({
      id: "vitrified",
      sizes: [],
    });

    expect((await post({ ...VALID_BODY, tileSize: "Slab" })).status).toBe(200);
  });

  it("400s malformed bodies", async () => {
    const cases = [
      {},
      { ...VALID_BODY, tileSize: "" },
      { ...VALID_BODY, substrateId: "Concrete!" },
      { ...VALID_BODY, extra: true },
    ];

    for (const body of cases) {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });
});
