import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

const StorageClient = vi.fn();

vi.mock("@supabase/storage-js", () => ({ StorageClient }));

// No SUPABASE_URL + APP_ENV=development -> local disk fallback.
vi.mock("../config/env.js", () => ({
  env: {
    APP_ENV: "development",
    NODE_ENV: "development",
    LOG_LEVEL: "silent",
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_STORAGE_BUCKET: "tds-files",
    SUPABASE_SIGNED_URL_TTL: 3600,
  },
}));

const storage = await import("./fileStorage.js");

const UPLOADS = path.resolve("./uploads");

const FILE = {
  buffer: Buffer.from("%PDF-1.4 local fake"),
  originalName: "local-tds.pdf",
  mimeType: "application/pdf",
};

afterAll(async () => {
  await rm(UPLOADS, { recursive: true, force: true });
});

describe("local development fallback", () => {
  it("reports the local backend and never constructs a Supabase client", () => {
    expect(storage.activeBackend()).toBe("local");
    expect(StorageClient).not.toHaveBeenCalled();
  });

  it("writes the file to ./uploads and returns its path", async () => {
    const stored = await storage.save(FILE);

    expect(stored.originalName).toBe("local-tds.pdf");
    expect(stored.path).toMatch(/^tds\/[0-9a-f-]{36}-local-tds\.pdf$/);

    await expect(readFile(path.join(UPLOADS, stored.path))).resolves.toEqual(
      FILE.buffer,
    );
  });

  it("returns a file:// URL from getSignedUrl", async () => {
    const stored = await storage.save(FILE);
    const url = await storage.getSignedUrl(stored.path);

    expect(url).toMatch(/^file:\/\/.+local-tds\.pdf$/);
    expect(url).toContain(stored.path);
  });

  it("deletes the file on remove and tolerates a missing one", async () => {
    const stored = await storage.save(FILE);
    const onDisk = path.join(UPLOADS, stored.path);

    await storage.remove(stored.path);
    await expect(readFile(onDisk)).rejects.toThrow();

    // Removing again is a no-op, not an error.
    await expect(storage.remove(stored.path)).resolves.toBeUndefined();
  });
});
