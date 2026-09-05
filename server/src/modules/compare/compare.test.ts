import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyParams } from "../../validation/technicalParams.js";
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
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const K90 = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "K90",
  name: "Kamdhenu Tile Adhesive K90",
  description: null,
  enClassification: "C2TE S1",
  applicationAreas: ["terrace"],
  technicalParams: {
    tensile_adhesion_is: "≥ 1.2 N/mm²",
    voc_content: "< 5 g/kg",
    open_time: "30 minutes",
    color: "Grey",
  },
  isActive: true,
  deletedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

function competitorProduct(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    competitorId: `comp-${id}`,
    name: `Product ${id.slice(0, 4)}`,
    enClassification: "C1T",
    technicalParams: {
      tensile_adhesion_is: "≥ 0.5 N/mm²",
      voc_content: "< 30 g/kg",
      open_time: "20 minutes",
    },
    specSource: "manual",
    tdsFileUrl: null,
    tdsFileName: null,
    aiRawExtraction: { secret: "raw ai output" },
    aiModel: null,
    isActive: true,
    deletedAt: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    competitor: { id: `comp-${id}`, name: "Example Adhesives Co." },
    ...overrides,
  };
}

function post(body: unknown, token: string | null = rmToken) {
  const req = request(app).post("/api/compare");
  return token
    ? req.set("Authorization", `Bearer ${token}`).send(body)
    : req.send(body);
}

beforeEach(async () => {
  fake.reset();
  vi.clearAllMocks();

  const rm = fake.seedUser({ role: "rm", mobileNumber: "919876543210" });
  const admin = fake.seedUser({ role: "admin", email: "asha@example.com" });
  rmToken = (await createSession(rm.id)).token;
  adminToken = (await createSession(admin.id)).token;

  fake.prisma.product.findFirst.mockResolvedValue(K90);
  fake.prisma.competitorProduct.findMany.mockResolvedValue([
    competitorProduct(ID_A),
  ]);
});

describe("auth", () => {
  it("401s without a token and 403s an admin", async () => {
    const body = { kamdhenuCode: "K90", competitorProductIds: [ID_A] };

    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, adminToken)).status).toBe(403);
  });
});

describe("POST /api/compare", () => {
  const BODY = { kamdhenuCode: "K90", competitorProductIds: [ID_A] };

  it("reads competitor data from competitor_products only", async () => {
    await post(BODY);

    expect(fake.prisma.competitorProduct.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [ID_A] },
        isActive: true,
        deletedAt: null,
        competitor: { isActive: true, deletedAt: null },
      },
      include: { competitor: true },
    });
    expect(fake.prisma.product.findFirst).toHaveBeenCalledWith({
      where: { code: "K90", isActive: true, deletedAt: null },
    });
  });

  it("builds columns with Kamdhenu first and a spec source per competitor", async () => {
    const res = await post(BODY);

    expect(res.status).toBe(200);
    expect(res.body.columns[0]).toEqual({
      kind: "kamdhenu",
      id: K90.id,
      code: "K90",
      name: K90.name,
      enClassification: "C2TE S1",
      specSource: null,
    });
    expect(res.body.columns[1]).toMatchObject({
      kind: "competitor",
      id: ID_A,
      competitorName: "Example Adhesives Co.",
      specSource: "manual",
    });
  });

  it("returns rows in PARAM_FIELDS order, only for populated specs", async () => {
    const res = await post(BODY);
    const keys = res.body.rows.map((row: { key: string }) => row.key);

    expect(keys).toEqual([
      "open_time",
      "tensile_adhesion_is",
      "voc_content",
      "color",
    ]);
    expect(res.body.rows[0].values).toEqual(["30 minutes", "20 minutes"]);
  });

  it("marks advantages per row and leaves neutral rows alone", async () => {
    const res = await post(BODY);
    const byKey = Object.fromEntries(
      res.body.rows.map((row: { key: string }) => [row.key, row]),
    );

    expect(byKey.tensile_adhesion_is).toMatchObject({
      direction: "higher",
      kamdhenuAdvantage: true,
      comparedCount: 1,
    });
    expect(byKey.voc_content).toMatchObject({
      direction: "lower",
      kamdhenuAdvantage: true,
    });
    // Kamdhenu has the longer open time but the parameter is neutral.
    expect(byKey.open_time).toMatchObject({
      direction: "neutral",
      kamdhenuAdvantage: false,
    });
    // Text-only value: nothing to compare.
    expect(byKey.color).toMatchObject({ kamdhenuAdvantage: false });
  });

  it("aligns values with columns across several competitors", async () => {
    fake.prisma.competitorProduct.findMany.mockResolvedValue([
      competitorProduct(ID_A),
      competitorProduct(ID_B, {
        technicalParams: { tensile_adhesion_is: "≥ 2.0 N/mm²" },
      }),
    ]);

    const res = await post({
      kamdhenuCode: "K90",
      competitorProductIds: [ID_A, ID_B],
    });

    const row = res.body.rows.find(
      (r: { key: string }) => r.key === "tensile_adhesion_is",
    );

    expect(res.body.columns).toHaveLength(3);
    expect(row.values).toEqual(["≥ 1.2 N/mm²", "≥ 0.5 N/mm²", "≥ 2.0 N/mm²"]);
    // Beaten by one competitor -> no advantage.
    expect(row.kamdhenuAdvantage).toBe(false);
    expect(row.comparedCount).toBe(2);
  });

  it("preserves the requested competitor order regardless of DB order", async () => {
    fake.prisma.competitorProduct.findMany.mockResolvedValue([
      competitorProduct(ID_B),
      competitorProduct(ID_A),
    ]);

    const res = await post({
      kamdhenuCode: "K90",
      competitorProductIds: [ID_A, ID_B],
    });

    expect(res.body.columns.map((c: { id: string }) => c.id)).toEqual([
      K90.id,
      ID_A,
      ID_B,
    ]);
  });

  it("returns exactly six deterministic talking points, caveat always last", async () => {
    const first = await post(BODY);
    const second = await post(BODY);

    expect(first.body.talkingPoints).toHaveLength(6);
    expect(first.body.talkingPoints).toEqual(second.body.talkingPoints);
    expect(first.body.talkingPoints[0]).toContain("K90");
    // The caveat is reserved: advantage claims can never crowd it out.
    expect(first.body.talkingPoints[5]).toContain(
      "not test results measured under identical conditions",
    );
  });

  it("keeps the caveat last even with the maximum number of advantages", async () => {
    fake.prisma.product.findFirst.mockResolvedValue({
      ...K90,
      technicalParams: {
        tensile_adhesion_is: "≥ 9 N/mm²",
        tensile_adhesion_water: "≥ 9 N/mm²",
        tensile_adhesion_heat: "≥ 9 N/mm²",
        tensile_adhesion_freeze_thaw: "≥ 9 N/mm²",
        shear_adhesion_dry: "≥ 9 N/mm²",
        shear_adhesion_wet: "≥ 9 N/mm²",
        coverage: "9 m2",
        shelf_life: "99 months",
      },
    });
    fake.prisma.competitorProduct.findMany.mockResolvedValue([
      competitorProduct(ID_A, {
        technicalParams: {
          tensile_adhesion_is: "≥ 1 N/mm²",
          tensile_adhesion_water: "≥ 1 N/mm²",
          tensile_adhesion_heat: "≥ 1 N/mm²",
          tensile_adhesion_freeze_thaw: "≥ 1 N/mm²",
          shear_adhesion_dry: "≥ 1 N/mm²",
          shear_adhesion_wet: "≥ 1 N/mm²",
          coverage: "1 m2",
          shelf_life: "9 months",
        },
      }),
    ]);

    const res = await post(BODY);

    expect(res.body.summary.advantageCount).toBe(8);
    expect(res.body.talkingPoints).toHaveLength(6);
    expect(res.body.talkingPoints[5]).toContain(
      "not test results measured under identical conditions",
    );
  });

  it("summarises the comparison", async () => {
    const res = await post(BODY);

    expect(res.body.summary).toEqual({
      competitorCount: 1,
      populatedRowCount: 4,
      comparableRowCount: 2,
      advantageCount: 2,
      specSourceCounts: { tds_ai: 0, manual: 1 },
    });
  });

  it("never leaks the raw AI extraction", async () => {
    const res = await post(BODY);

    expect(JSON.stringify(res.body)).not.toContain("raw ai output");
  });

  it("400s an unknown or inactive Kamdhenu code", async () => {
    fake.prisma.product.findFirst.mockResolvedValue(null);

    const res = await post(BODY);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_reference");
    expect(res.body.error.message).toContain("K90");
  });

  it("400s listing competitor products that could not be resolved", async () => {
    fake.prisma.competitorProduct.findMany.mockResolvedValue([
      competitorProduct(ID_A),
    ]);

    const res = await post({
      kamdhenuCode: "K90",
      competitorProductIds: [ID_A, ID_B],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_reference");
    // Missing ids are named, never silently dropped from the table.
    expect(res.body.error.message).toContain(ID_B);
    expect(res.body.error.message).not.toContain(ID_A);
  });

  it("400s malformed bodies", async () => {
    const cases = [
      {},
      { kamdhenuCode: "K90", competitorProductIds: [] },
      { kamdhenuCode: "K90", competitorProductIds: ["not-a-uuid"] },
      { kamdhenuCode: "K90", competitorProductIds: [ID_A, ID_A] },
      { kamdhenuCode: "", competitorProductIds: [ID_A] },
      { kamdhenuCode: "K90", competitorProductIds: [ID_A], extra: 1 },
    ];

    for (const body of cases) {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });

  it("handles a Kamdhenu product with no published specs", async () => {
    fake.prisma.product.findFirst.mockResolvedValue({
      ...K90,
      technicalParams: emptyParams(),
    });

    const res = await post(BODY);

    expect(res.status).toBe(200);
    expect(res.body.summary.advantageCount).toBe(0);
    expect(res.body.rows.every((r: { values: unknown[] }) => r.values[0] === null)).toBe(true);
    expect(res.body.talkingPoints).toHaveLength(6);
  });
});
