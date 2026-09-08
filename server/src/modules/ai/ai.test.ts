import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyParams } from "../../validation/technicalParams.js";
import { createFakePrisma } from "../../test/fakePrisma.js";

const fake = createFakePrisma();
const responsesCreate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: fake.prisma,
  disconnectPrisma: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({ responses: { create: responsesCreate } })),
}));

const { createApp } = await import("../../app.js");
const { createSession } = await import("../auth/session.service.js");
const { FALLBACK_TTL_MS } = await import("./cache.js");
const { hashSpecs } = await import("../../lib/specHash.js");

const app = createApp();

let rmToken = "";
let adminToken = "";

const now = new Date();
const COMPETITOR_PRODUCT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PRODUCT = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "K90",
  name: "Kamdhenu Tile Adhesive K90",
  description: null,
  enClassification: "C2TE S1",
  applicationAreas: ["terrace"],
  technicalParams: {
    ...emptyParams(),
    tensile_adhesion_is: "≥ 1.2 N/mm²",
    voc_content: "< 5 g/kg",
  },
  isActive: true,
  deletedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

const COMPETITOR_PRODUCT = {
  id: COMPETITOR_PRODUCT_ID,
  competitorId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  name: "ExampleFix Standard",
  enClassification: "C1T",
  technicalParams: {
    ...emptyParams(),
    tensile_adhesion_is: "≥ 0.5 N/mm²",
    voc_content: "< 30 g/kg",
  },
  specSource: "manual" as const,
  tdsFileUrl: null,
  tdsFileName: null,
  aiRawExtraction: null,
  aiModel: null,
  isActive: true,
  deletedAt: null,
  createdBy: null,
  createdAt: now,
  updatedAt: now,
  competitor: {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Example Adhesives Co.",
    slug: "example_adhesives",
  },
};

function mockLines(lines: string[]) {
  responsesCreate.mockResolvedValue({ output_text: JSON.stringify({ lines }) });
}

function post(path: string, body: unknown, token: string | null = rmToken) {
  const req = request(app).post(path);
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

  fake.prisma.product.findFirst.mockResolvedValue(PRODUCT);
  fake.prisma.competitorProduct.findFirst.mockResolvedValue(COMPETITOR_PRODUCT);
  fake.prisma.competitorProduct.findMany.mockResolvedValue([COMPETITOR_PRODUCT]);
  fake.prisma.pitchCache.findUnique.mockResolvedValue(null);
  fake.prisma.recommendationCache.findUnique.mockResolvedValue(null);

  mockLines(["Line one.", "Line two.", "Line three."]);
  responsesCreate.mockResolvedValue({
    output_text: JSON.stringify({
      lines: ["Line one.", "Line two.", "Line three."],
    }),
  });
});

const PITCH_BODY = {
  kamdhenuCode: "K90",
  competitorProductId: COMPETITOR_PRODUCT_ID,
  variant: "durability" as const,
};

describe("POST /api/pitch", () => {
  it("401s without a token and 403s an admin", async () => {
    expect((await post("/api/pitch", PITCH_BODY, null)).status).toBe(401);
    expect((await post("/api/pitch", PITCH_BODY, adminToken)).status).toBe(403);
  });

  it("miss -> generates, stores and returns the lines", async () => {
    const res = await post("/api/pitch", PITCH_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      lines: ["Line one.", "Line two.", "Line three."],
      variant: "durability",
      isFallback: false,
      cached: false,
    });

    const upsert = fake.prisma.pitchCache.upsert.mock.calls[0]?.[0];
    expect(upsert.create.isFallback).toBe(false);
    // Successful copy has no TTL: the spec hash in the key retires it instead.
    expect(upsert.create.expiresAt).toBeNull();
  });

  it("builds a cache key from code, competitor, spec hash, prompt version and variant", async () => {
    await post("/api/pitch", PITCH_BODY);

    const key: string = fake.prisma.pitchCache.upsert.mock.calls[0]?.[0].where
      .cacheKey;
    const expectedHash = hashSpecs(
      PRODUCT.technicalParams,
      COMPETITOR_PRODUCT.technicalParams,
    );

    expect(key).toBe(
      `K90|example_adhesives:${COMPETITOR_PRODUCT_ID}|${expectedHash}|pitch-v2|durability`,
    );
  });

  it("hit -> returns immediately without calling OpenAI", async () => {
    fake.prisma.pitchCache.findUnique.mockResolvedValue({
      cacheKey: "k",
      lines: ["Cached line."],
      isFallback: false,
      expiresAt: null,
    });

    const res = await post("/api/pitch", PITCH_BODY);

    expect(res.body).toMatchObject({ lines: ["Cached line."], cached: true });
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(fake.prisma.pitchCache.upsert).not.toHaveBeenCalled();
  });

  it("treats an expired entry as a miss and deletes it", async () => {
    fake.prisma.pitchCache.findUnique.mockResolvedValue({
      cacheKey: "k",
      lines: ["Stale fallback."],
      isFallback: true,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await post("/api/pitch", PITCH_BODY);

    expect(fake.prisma.pitchCache.deleteMany).toHaveBeenCalled();
    expect(res.body.lines).toEqual(["Line one.", "Line two.", "Line three."]);
    expect(res.body.cached).toBe(false);
  });

  it("changes the cache key when a spec value changes (defect #6)", async () => {
    await post("/api/pitch", PITCH_BODY);
    const firstKey =
      fake.prisma.pitchCache.upsert.mock.calls[0]?.[0].where.cacheKey;

    fake.prisma.product.findFirst.mockResolvedValue({
      ...PRODUCT,
      technicalParams: {
        ...PRODUCT.technicalParams,
        tensile_adhesion_is: "≥ 1.4 N/mm²",
      },
    });
    await post("/api/pitch", PITCH_BODY);
    const secondKey =
      fake.prisma.pitchCache.upsert.mock.calls[1]?.[0].where.cacheKey;

    expect(secondKey).not.toBe(firstKey);
  });

  it("uses a different key per variant", async () => {
    await post("/api/pitch", { ...PITCH_BODY, variant: "standards" });
    await post("/api/pitch", { ...PITCH_BODY, variant: "safety_economics" });

    const [a, b] = fake.prisma.pitchCache.upsert.mock.calls.map(
      (call) => call[0].where.cacheKey,
    );
    expect(a).not.toBe(b);
    expect(a).toContain("standards");
    expect(b).toContain("safety_economics");
  });

  it("rotates through the five variants when none is given", async () => {
    const seen = new Set<string>();

    for (let i = 0; i < 60; i += 1) {
      const res = await post("/api/pitch", {
        kamdhenuCode: "K90",
        competitorProductId: COMPETITOR_PRODUCT_ID,
      });
      seen.add(res.body.variant);
    }

    expect(seen).toEqual(
      new Set([
        "general",
        "durability",
        "safety_economics",
        "large_format_facade",
        "standards",
      ]),
    );
  });

  it("failure -> deterministic fallback, is_fallback true, short expiry", async () => {
    responsesCreate.mockRejectedValue(new Error("openai is down"));

    const res = await post("/api/pitch", PITCH_BODY);

    expect(res.status).toBe(200);
    expect(res.body.isFallback).toBe(true);
    expect(res.body.lines.length).toBeGreaterThan(0);
    expect(res.body.lines.length).toBeLessThanOrEqual(3);
    // Fallback content is traceable to the datasheet values.
    expect(res.body.lines.join(" ")).toContain("≥ 1.2 N/mm²");
    expect(JSON.stringify(res.body)).not.toContain("openai is down");

    const upsert = fake.prisma.pitchCache.upsert.mock.calls[0]?.[0];
    expect(upsert.create.isFallback).toBe(true);

    const ttl = upsert.create.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(FALLBACK_TTL_MS);
  });

  it("uses variant-specific fallback lines", async () => {
    responsesCreate.mockRejectedValue(new Error("openai is down"));

    const durability = await post("/api/pitch", PITCH_BODY);
    const standards = await post("/api/pitch", {
      ...PITCH_BODY,
      variant: "standards",
    });

    expect(durability.body.lines[0]).not.toBe(standards.body.lines[0]);
    expect(durability.body.isFallback).toBe(true);
    expect(standards.body.isFallback).toBe(true);
  });

  it("falls back rather than failing when the model returns nothing usable", async () => {
    mockLines(["", "   "]);

    const res = await post("/api/pitch", PITCH_BODY);

    expect(res.status).toBe(200);
    expect(res.body.isFallback).toBe(true);
  });

  it("drops blank and duplicate lines and caps at three", async () => {
    mockLines(["  One.  ", "", "One.", "Two.", "Three.", "Four."]);

    const res = await post("/api/pitch", PITCH_BODY);

    expect(res.body.lines).toEqual(["One.", "Two.", "Three."]);
    expect(res.body.isFallback).toBe(false);
  });

  it("400s unknown references and malformed bodies", async () => {
    fake.prisma.product.findFirst.mockResolvedValue(null);
    expect((await post("/api/pitch", PITCH_BODY)).status).toBe(400);

    fake.prisma.product.findFirst.mockResolvedValue(PRODUCT);
    fake.prisma.competitorProduct.findFirst.mockResolvedValue(null);
    expect((await post("/api/pitch", PITCH_BODY)).status).toBe(400);

    for (const body of [
      {},
      { ...PITCH_BODY, variant: "nope" },
      { ...PITCH_BODY, competitorProductId: "x" },
      { ...PITCH_BODY, extra: 1 },
    ]) {
      const res = await post("/api/pitch", body);
      expect(res.status).toBe(400);
    }
  });
});

describe("POST /api/recommendation-text", () => {
  const LETTER = [
    "We have reviewed the requirement and recommend K90.",
    "",
    "The published datasheet values support this choice.",
    "",
    "Please follow the datasheet instructions.",
    "",
    "Kamdhenu Technical Team",
  ].join("\n");

  const BODY = {
    kamdhenuCode: "K90",
    competitorProductIds: [COMPETITOR_PRODUCT_ID],
    substrateId: "concrete",
    area: "terrace",
  };

  beforeEach(() => {
    responsesCreate.mockResolvedValue({ output_text: LETTER });
  });

  it("401s without a token and 403s an admin", async () => {
    expect((await post("/api/recommendation-text", BODY, null)).status).toBe(401);
    expect((await post("/api/recommendation-text", BODY, adminToken)).status).toBe(403);
  });

  it("miss -> generates, stores and returns the letter", async () => {
    const res = await post("/api/recommendation-text", BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ content: LETTER, isFallback: false, cached: false });

    const upsert = fake.prisma.recommendationCache.upsert.mock.calls[0]?.[0];
    expect(upsert.create.expiresAt).toBeNull();
  });

  it("keys on product, sorted competitor names, spec hash and context", async () => {
    await post("/api/recommendation-text", BODY);

    const key: string =
      fake.prisma.recommendationCache.upsert.mock.calls[0]?.[0].where.cacheKey;

    expect(key).toContain("K90|");
    expect(key).toContain("Example Adhesives Co./ExampleFix Standard");
    expect(key).toContain("concrete~~~terrace");
    expect(key).toContain("letter-v1");
  });

  it("is insensitive to competitor selection order", async () => {
    const second = {
      ...COMPETITOR_PRODUCT,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "AnotherFix",
      competitor: { id: "x", name: "Another Co.", slug: "another_co" },
    };
    fake.prisma.competitorProduct.findMany.mockResolvedValue([
      COMPETITOR_PRODUCT,
      second,
    ]);

    await post("/api/recommendation-text", {
      ...BODY,
      competitorProductIds: [COMPETITOR_PRODUCT_ID, second.id],
    });
    await post("/api/recommendation-text", {
      ...BODY,
      competitorProductIds: [second.id, COMPETITOR_PRODUCT_ID],
    });

    const [a, b] = fake.prisma.recommendationCache.upsert.mock.calls.map(
      (call) => call[0].where.cacheKey,
    );
    expect(a).toBe(b);
  });

  it("hit -> returns immediately without calling OpenAI", async () => {
    fake.prisma.recommendationCache.findUnique.mockResolvedValue({
      cacheKey: "k",
      content: "Cached letter.",
      isFallback: false,
      expiresAt: null,
    });

    const res = await post("/api/recommendation-text", BODY);

    expect(res.body).toMatchObject({ content: "Cached letter.", cached: true });
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("treats an expired fallback as a miss", async () => {
    fake.prisma.recommendationCache.findUnique.mockResolvedValue({
      cacheKey: "k",
      content: "Stale fallback.",
      isFallback: true,
      expiresAt: new Date(Date.now() - 1),
    });

    const res = await post("/api/recommendation-text", BODY);

    expect(fake.prisma.recommendationCache.deleteMany).toHaveBeenCalled();
    expect(res.body.content).toBe(LETTER);
  });

  it("failure -> deterministic 3-paragraph fallback with the sign-off", async () => {
    responsesCreate.mockRejectedValue(new Error("openai is down"));

    const res = await post("/api/recommendation-text", BODY);

    expect(res.status).toBe(200);
    expect(res.body.isFallback).toBe(true);
    expect(res.body.content.split("\n\n")).toHaveLength(4); // 3 paragraphs + sign-off
    expect(res.body.content).toContain("Kamdhenu Technical Team");
    expect(res.body.content).toContain("concrete");
    expect(JSON.stringify(res.body)).not.toContain("openai is down");

    const upsert =
      fake.prisma.recommendationCache.upsert.mock.calls[0]?.[0];
    expect(upsert.create.isFallback).toBe(true);
    const ttl = upsert.create.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(FALLBACK_TTL_MS);
  });

  it("works with no competitors selected", async () => {
    const res = await post("/api/recommendation-text", { kamdhenuCode: "K90" });

    expect(res.status).toBe(200);
    expect(fake.prisma.competitorProduct.findMany).not.toHaveBeenCalled();
  });

  it("400s competitor ids that cannot be resolved", async () => {
    fake.prisma.competitorProduct.findMany.mockResolvedValue([]);

    const res = await post("/api/recommendation-text", BODY);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_reference");
  });
});
