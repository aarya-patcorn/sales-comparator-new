import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const createSignedUrl = vi.fn();
const removeObject = vi.fn();
const getBucket = vi.fn();
const createBucket = vi.fn();
const from = vi.fn(() => ({ upload, createSignedUrl, remove: removeObject }));

const { ctorArgs } = vi.hoisted(() => ({ ctorArgs: [] as unknown[] }));

vi.mock("@supabase/storage-js", () => ({
  StorageClient: vi.fn(function StorageClientMock(
    this: unknown,
    url: string,
    headers: Record<string, string>,
  ) {
    ctorArgs.push({ url, headers });
    return { from, getBucket, createBucket };
  }),
}));

vi.mock("../config/env.js", () => ({
  env: {
    APP_ENV: "production",
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    SUPABASE_URL: "https://project.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    SUPABASE_STORAGE_BUCKET: "tds-files",
    SUPABASE_SIGNED_URL_TTL: 3600,
  },
}));

const storage = await import("./fileStorage.js");

const FILE = {
  buffer: Buffer.from("%PDF-1.4 fake"),
  originalName: "MYK Latacrete — TDS (2024).pdf",
  mimeType: "application/pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
  getBucket.mockResolvedValue({ data: { name: "tds-files" }, error: null });
  createBucket.mockResolvedValue({ data: null, error: null });
  upload.mockResolvedValue({ data: { path: "x" }, error: null });
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/tds/x?token=abc" },
    error: null,
  });
  removeObject.mockResolvedValue({ data: [], error: null });
  // Reset the cached bucket-ready promise between tests.
  (globalThis as Record<string, unknown>).__supabaseBucketReady = undefined;
});

describe("client configuration", () => {
  it("targets /storage/v1 with the service role key as apikey and bearer", async () => {
    await storage.save(FILE);

    expect(ctorArgs[0]).toEqual({
      url: "https://project.supabase.co/storage/v1",
      headers: {
        apikey: "service-role-secret",
        Authorization: "Bearer service-role-secret",
      },
    });
  });

  it("reports the supabase backend", () => {
    expect(storage.activeBackend()).toBe("supabase");
  });
});

describe("bucket bootstrap", () => {
  it("creates a PRIVATE bucket when it is missing", async () => {
    getBucket.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });

    await storage.save(FILE);

    expect(createBucket).toHaveBeenCalledWith("tds-files", { public: false });
  });

  it("does not create the bucket when it already exists", async () => {
    await storage.save(FILE);

    expect(createBucket).not.toHaveBeenCalled();
  });

  it("ignores an already-exists race", async () => {
    getBucket.mockResolvedValue({ data: null, error: { message: "not found" } });
    createBucket.mockResolvedValue({
      data: null,
      error: { message: "The resource already exists" },
    });

    await expect(storage.save(FILE)).resolves.toMatchObject({
      originalName: FILE.originalName,
    });
  });

  it("surfaces a genuine bucket failure", async () => {
    getBucket.mockResolvedValue({ data: null, error: { message: "not found" } });
    createBucket.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(storage.save(FILE)).rejects.toThrow(storage.FileStorageError);
  });

  it("checks the bucket once per process, not per upload", async () => {
    await storage.save(FILE);
    await storage.save(FILE);

    expect(getBucket).toHaveBeenCalledTimes(1);
  });
});

describe("save", () => {
  it("returns the storage path and the original name", async () => {
    const stored = await storage.save(FILE);

    expect(stored.originalName).toBe(FILE.originalName);
    expect(stored.path).toMatch(
      /^tds\/[0-9a-f-]{36}-MYK-Latacrete-TDS-2024-.pdf$/,
    );
    // A path, never a URL.
    expect(stored.path).not.toMatch(/^https?:/);
  });

  it("uploads the buffer with the right content type and no upsert", async () => {
    const stored = await storage.save(FILE);

    expect(from).toHaveBeenCalledWith("tds-files");
    expect(upload).toHaveBeenCalledWith(stored.path, FILE.buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("produces a distinct path for identical filenames", async () => {
    const a = await storage.save(FILE);
    const b = await storage.save(FILE);

    expect(a.path).not.toBe(b.path);
  });

  it("sanitizes traversal attempts out of the object key", async () => {
    const stored = await storage.save({
      ...FILE,
      originalName: "../../etc/passwd",
    });

    expect(stored.path).toMatch(/^tds\/[0-9a-f-]{36}-passwd$/);
    expect(stored.path).not.toContain("..");
  });

  it("throws a clear error when the upload fails", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });

    await expect(storage.save(FILE)).rejects.toThrow(/quota exceeded/);
  });
});

describe("getSignedUrl", () => {
  it("mints a signed URL with the configured TTL", async () => {
    const url = await storage.getSignedUrl("tds/abc.pdf");

    expect(createSignedUrl).toHaveBeenCalledWith("tds/abc.pdf", 3600);
    expect(url).toContain("/object/sign/");
    expect(url).toContain("token=");
  });

  it("throws when signing fails or returns nothing", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(storage.getSignedUrl("tds/missing.pdf")).rejects.toThrow(
      storage.FileStorageError,
    );

    createSignedUrl.mockResolvedValue({ data: {}, error: null });
    await expect(storage.getSignedUrl("tds/x.pdf")).rejects.toThrow(
      storage.FileStorageError,
    );
  });
});

describe("remove", () => {
  it("deletes the object from the bucket", async () => {
    await storage.remove("tds/abc.pdf");

    expect(from).toHaveBeenCalledWith("tds-files");
    expect(removeObject).toHaveBeenCalledWith(["tds/abc.pdf"]);
  });

  it("throws a clear error when deletion fails", async () => {
    removeObject.mockResolvedValue({ data: null, error: { message: "denied" } });

    await expect(storage.remove("tds/abc.pdf")).rejects.toThrow(/denied/);
  });
});

describe("secret handling", () => {
  it("never puts the service role key in an error message", async () => {
    upload.mockRejectedValue(new Error("network down"));

    const error = await storage.save(FILE).catch((e: unknown) => e as Error);

    expect(error.message).not.toContain("service-role-secret");
    expect(JSON.stringify(error.message)).not.toContain("service-role-secret");
  });
});
