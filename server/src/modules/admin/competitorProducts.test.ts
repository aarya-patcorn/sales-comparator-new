import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyParams } from "../../validation/technicalParams.js";
import { createFakePrisma } from "../../test/fakePrisma.js";

const fake = createFakePrisma();
const responsesCreate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: fake.prisma,
  disconnectPrisma: vi.fn(),
}));

// Only the network boundary is mocked; prompt building, schema derivation,
// JSON parsing and validation all run for real.
vi.mock("openai", () => ({
  default: vi.fn(() => ({ responses: { create: responsesCreate } })),
}));

const { createApp } = await import("../../app.js");
const { createSession } = await import("../auth/session.service.js");
const { buildExtractionSchema } = await import("../tds-extract/service.js");

const app = createApp();

let adminToken = "";
let rmToken = "";

const COMPETITOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const AI_PARAMS = {
  ...emptyParams(),
  open_time: "20-30 minutes",
  tensile_adhesion_is: "≥ 0.5 N/mm²",
  color: "Grey",
};

/** The values an admin corrected in the form before saving. */
const CONFIRMED_PARAMS = {
  ...emptyParams(),
  open_time: "25-35 minutes", // corrected by the admin
  tensile_adhesion_is: "≥ 0.5 N/mm²",
  color: "White", // corrected by the admin
};

function mockExtraction(params: unknown = AI_PARAMS) {
  responsesCreate.mockResolvedValue({ output_text: JSON.stringify(params) });
}

const PDF = Buffer.from("%PDF-1.4 fake tds", "utf8");
const PNG = Buffer.from("\x89PNG fake", "binary");

beforeEach(async () => {
  fake.reset();
  vi.clearAllMocks();
  mockExtraction();

  const admin = fake.seedUser({ role: "admin", email: "asha@example.com" });
  const rm = fake.seedUser({ role: "rm", mobileNumber: "919876543210" });
  adminToken = (await createSession(admin.id)).token;
  rmToken = (await createSession(rm.id)).token;

  fake.prisma.competitor.findFirst.mockResolvedValue({ id: COMPETITOR_ID });
  fake.prisma.competitorProduct.findFirst.mockResolvedValue(null);
  fake.prisma.competitorProduct.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "new-id", createdAt: new Date(), isActive: true, ...data }),
  );
});

const UPLOADS = path.resolve("./uploads");

afterAll(async () => {
  await rm(UPLOADS, { recursive: true, force: true });
});

describe("extraction schema", () => {
  it("forces exactly the canonical keys, nullable, no extras", () => {
    const schema = buildExtractionSchema() as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: string[] }>;
    };

    expect(schema.required).toHaveLength(21);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.open_time.type).toEqual(["string", "null"]);
    expect(Object.keys(schema.properties)).toHaveLength(21);
  });
});

describe("POST /api/admin/tds/extract", () => {
  function extract(token: string | null = adminToken) {
    const req = request(app).post("/api/admin/tds/extract");
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  }

  it("401s without a token and 403s an RM", async () => {
    expect((await extract(null).attach("file", PDF, "tds.pdf")).status).toBe(401);
    expect((await extract(rmToken).attach("file", PDF, "tds.pdf")).status).toBe(403);
  });

  it("returns prefill params and the model, saving nothing", async () => {
    const res = await extract().attach("file", PDF, "tds.pdf");

    expect(res.status).toBe(200);
    expect(res.body.params).toEqual(AI_PARAMS);
    expect(res.body.model).toBe("gpt-4o-mini");

    // Nothing persisted, nothing stored.
    expect(fake.prisma.competitorProduct.create).not.toHaveBeenCalled();
  });

  it("sends the document with a strict json_schema and temperature 0", async () => {
    await extract().attach("file", PDF, "tds.pdf");

    const call = responsesCreate.mock.calls[0]?.[0];

    expect(call.model).toBe("gpt-4o-mini");
    expect(call.temperature).toBe(0);
    expect(call.text.format).toMatchObject({
      type: "json_schema",
      name: "technical_params",
      strict: true,
    });
    expect(call.instructions).toContain("VERBATIM");
    expect(call.input[0].content[0]).toMatchObject({
      type: "input_file",
      filename: "tds.pdf",
    });
    expect(call.input[0].content[0].file_data).toContain(
      "data:application/pdf;base64,",
    );
  });

  it("sends images as input_image", async () => {
    await extract().attach("file", PNG, {
      filename: "tds.png",
      contentType: "image/png",
    });

    expect(responsesCreate.mock.calls[0]?.[0].input[0].content[0]).toMatchObject({
      type: "input_image",
    });
  });

  it("400s when no file is attached", async () => {
    const res = await extract().send();

    expect(res.status).toBe(400);
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("400s an unsupported file type", async () => {
    const res = await extract().attach("file", Buffer.from("x"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Unsupported file type");
  });

  it("422s when the model returns a malformed object", async () => {
    responsesCreate.mockResolvedValue({ output_text: "not json" });
    let res = await extract().attach("file", PDF, "tds.pdf");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("extraction_failed");

    // Missing keys / unknown keys are rejected too.
    mockExtraction({ open_time: "5 minutes", invented_key: "nope" });
    res = await extract().attach("file", PDF, "tds.pdf");
    expect(res.status).toBe(422);
  });

  it("422s when the OpenAI call itself fails", async () => {
    responsesCreate.mockRejectedValue(new Error("upstream 500"));

    const res = await extract().attach("file", PDF, "tds.pdf");

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain("upstream 500");
  });
});

describe("POST /api/admin/competitor-products", () => {
  function create(token: string | null = adminToken) {
    const req = request(app).post("/api/admin/competitor-products");
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  }

  const MANUAL_BODY = {
    competitorId: COMPETITOR_ID,
    name: "ExampleFix Standard",
    enClassification: "C1T",
    technicalParams: CONFIRMED_PARAMS,
  };

  it("401s without a token and 403s an RM", async () => {
    expect((await create(null).send(MANUAL_BODY)).status).toBe(401);
    expect((await create(rmToken).send(MANUAL_BODY)).status).toBe(403);
  });

  describe("mode (b): manual JSON", () => {
    it("creates a manual product with no file or AI fields", async () => {
      const res = await create().send(MANUAL_BODY);

      expect(res.status).toBe(201);
      expect(res.body.competitorProduct).toMatchObject({
        name: "ExampleFix Standard",
        specSource: "manual",
        tdsFileUrl: null,
        tdsFileName: null,
        aiModel: null,
      });

      const data = fake.prisma.competitorProduct.create.mock.calls[0]?.[0].data;
      expect(data.specSource).toBe("manual");
      expect(data.technicalParams).toEqual(CONFIRMED_PARAMS);
      expect(responsesCreate).not.toHaveBeenCalled();
    });

    it("records the acting admin as created_by", async () => {
      await create().send(MANUAL_BODY);

      const data = fake.prisma.competitorProduct.create.mock.calls[0]?.[0].data;
      expect(data.createdBy).toBe([...fake.users.values()][0]?.id);
    });
  });

  describe("mode (a): multipart with a TDS", () => {
    async function createWithFile(params = CONFIRMED_PARAMS) {
      return create()
        .field("competitorId", COMPETITOR_ID)
        .field("name", "ExampleFix Standard")
        .field("enClassification", "C1T")
        .field("technicalParams", JSON.stringify(params))
        .attach("file", PDF, "example-tds.pdf");
    }

    it("stores the file, runs extraction and marks the row tds_ai", async () => {
      const res = await createWithFile();

      expect(res.status).toBe(201);
      expect(res.body.competitorProduct.specSource).toBe("tds_ai");
      expect(res.body.competitorProduct.tdsFileName).toBe("example-tds.pdf");
      // tds_file_url now holds the storage PATH, not a URL: signed URLs are
      // minted on demand at read time.
      expect(res.body.competitorProduct.tdsFileUrl).toMatch(
        /^tds\/[0-9a-f-]{36}-example-tds\.pdf$/,
      );
      expect(res.body.competitorProduct.aiModel).toBe("gpt-4o-mini");
      expect(responsesCreate).toHaveBeenCalledTimes(1);
    });

    it("actually writes the file to storage", async () => {
      const res = await createWithFile();
      const stored: string = res.body.competitorProduct.tdsFileUrl;

      await expect(readFile(path.join(UPLOADS, stored))).resolves.toEqual(PDF);
    });

    it("saves the ADMIN-CONFIRMED params, not the AI output", async () => {
      const res = await createWithFile();
      const data = fake.prisma.competitorProduct.create.mock.calls[0]?.[0].data;

      // The model said "20-30 minutes" / "Grey"; the admin corrected both.
      expect(data.technicalParams).toEqual(CONFIRMED_PARAMS);
      expect(data.technicalParams.open_time).toBe("25-35 minutes");
      expect(data.technicalParams.color).toBe("White");
      expect(res.body.competitorProduct.technicalParams.color).toBe("White");

      // The untouched model output is kept separately for audit.
      expect(data.aiRawExtraction).toEqual(AI_PARAMS);
      expect(data.aiRawExtraction.open_time).toBe("20-30 minutes");
    });

    it("still saves when extraction fails, losing only the audit trail", async () => {
      responsesCreate.mockRejectedValue(new Error("upstream down"));

      const res = await createWithFile();
      const data = fake.prisma.competitorProduct.create.mock.calls[0]?.[0].data;

      expect(res.status).toBe(201);
      expect(data.specSource).toBe("tds_ai");
      expect(data.tdsFileUrl).toBeTruthy(); // chk_tds_file still satisfied
      expect(data.aiModel).toBeNull();
      expect(data.technicalParams).toEqual(CONFIRMED_PARAMS);
    });

    it("400s when technicalParams is not valid JSON", async () => {
      const res = await create()
        .field("competitorId", COMPETITOR_ID)
        .field("name", "Broken")
        .field("technicalParams", "{not json")
        .attach("file", PDF, "tds.pdf");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    });
  });

  describe("validation and conflicts", () => {
    it("400s an unknown or inactive competitor", async () => {
      fake.prisma.competitor.findFirst.mockResolvedValue(null);

      const res = await create().send(MANUAL_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("unknown_reference");
      expect(fake.prisma.competitorProduct.create).not.toHaveBeenCalled();
    });

    it("409s a duplicate live product name for the same competitor", async () => {
      fake.prisma.competitorProduct.findFirst.mockResolvedValue({ id: "existing" });

      const res = await create().send(MANUAL_BODY);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("duplicate_competitor_product");
    });

    it("400s malformed bodies", async () => {
      const cases = [
        {},
        { ...MANUAL_BODY, competitorId: "not-a-uuid" },
        { ...MANUAL_BODY, name: "" },
        { ...MANUAL_BODY, technicalParams: { open_time: "5 min" } }, // incomplete
        { ...MANUAL_BODY, technicalParams: { ...CONFIRMED_PARAMS, extra: "x" } },
        { ...MANUAL_BODY, unexpected: true },
      ];

      for (const body of cases) {
        const res = await create().send(body);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("validation_error");
      }
    });
  });
});
