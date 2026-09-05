import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { StorageClient } from "@supabase/storage-js";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

export type UploadInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

export type StoredFile = {
  /**
   * The storage object key — this is what goes into
   * `competitor_products.tds_file_url`. It is a PATH, never a URL: signed URLs
   * expire, so they are generated on demand at read time instead.
   */
  path: string;
  /** Original filename, kept for display and re-download. */
  originalName: string;
};

/** Raised for any storage failure, with the provider detail attached as cause. */
export class FileStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FileStorageError";
  }
}

const OBJECT_PREFIX = "tds";
const LOCAL_DIR = "./uploads";

/** True when running without Supabase in local development. */
function usingLocalFallback(): boolean {
  return !env.SUPABASE_URL && env.APP_ENV === "development";
}

// --------------------------------------------------------------- object keys

/** Strips directories and anything awkward, so the key is safe and readable. */
function sanitizeName(originalName: string): string {
  const base = path.basename(originalName);
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+/g, "-");

  return (cleaned.length > 0 ? cleaned : "upload").slice(0, 120);
}

function buildObjectPath(originalName: string): string {
  return `${OBJECT_PREFIX}/${randomUUID()}-${sanitizeName(originalName)}`;
}

// ------------------------------------------------------------ supabase client

/**
 * Cached on globalThis so `tsx watch` reloads reuse one client instead of
 * leaking a new one (and repeating the bucket check) on every edit.
 */
const globalForStorage = globalThis as unknown as {
  __supabaseStorage?: StorageClient;
  __supabaseBucketReady?: Promise<void> | undefined;
};

function getClient(): StorageClient {
  if (globalForStorage.__supabaseStorage) return globalForStorage.__supabaseStorage;

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new FileStorageError(
      "Supabase Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  // The service role key authenticates the server; it is sent as both the
  // apikey and the bearer token, and must never be logged or returned.
  const client = new StorageClient(`${url.replace(/\/+$/, "")}/storage/v1`, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });

  globalForStorage.__supabaseStorage = client;
  return client;
}

/**
 * Ensures the private bucket exists. Runs once per process; a concurrent
 * creation by another instance surfaces as "already exists" and is ignored.
 */
function ensureBucket(): Promise<void> {
  globalForStorage.__supabaseBucketReady ??= (async () => {
    const client = getClient();
    const bucket = env.SUPABASE_STORAGE_BUCKET;

    const existing = await client.getBucket(bucket);
    if (!existing.error) return;

    const created = await client.createBucket(bucket, { public: false });

    if (created.error) {
      const message = created.error.message.toLowerCase();
      // Another process won the race — that is the desired end state.
      if (message.includes("already exists") || message.includes("duplicate")) {
        return;
      }
      throw new FileStorageError(
        `Could not create Supabase bucket '${bucket}': ${created.error.message}`,
        { cause: created.error },
      );
    }

    logger.info({ bucket }, "Created private Supabase storage bucket");
  })().catch((error: unknown) => {
    // Do not cache a failure: the next request should retry.
    globalForStorage.__supabaseBucketReady = undefined;
    throw error;
  });

  return globalForStorage.__supabaseBucketReady;
}

// -------------------------------------------------------------------- local

function localPathFor(objectPath: string): string {
  return path.join(path.resolve(LOCAL_DIR), objectPath);
}

async function saveLocal(input: UploadInput): Promise<StoredFile> {
  const objectPath = buildObjectPath(input.originalName);
  const destination = localPathFor(objectPath);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, input.buffer);

  return { path: objectPath, originalName: input.originalName };
}

// ---------------------------------------------------------------- public API

/**
 * Persists an uploaded TDS and returns its storage path.
 *
 * Backends: Supabase Storage (private bucket) when SUPABASE_URL is set;
 * otherwise a local ./uploads directory, which is only permitted in
 * development so a misconfigured deploy cannot silently lose files.
 */
export async function save(input: UploadInput): Promise<StoredFile> {
  if (usingLocalFallback()) {
    const stored = await saveLocal(input);

    logger.info(
      { backend: "local", path: stored.path, bytes: input.buffer.byteLength },
      "Stored uploaded file",
    );
    return stored;
  }

  await ensureBucket();

  const objectPath = buildObjectPath(input.originalName);

  try {
    const { error } = await getClient()
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, input.buffer, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new FileStorageError(`Upload failed: ${error.message}`, {
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof FileStorageError) throw error;
    throw new FileStorageError("Upload to Supabase Storage failed", {
      cause: error,
    });
  }

  logger.info(
    {
      backend: "supabase",
      bucket: env.SUPABASE_STORAGE_BUCKET,
      path: objectPath,
      bytes: input.buffer.byteLength,
    },
    "Stored uploaded file",
  );

  return { path: objectPath, originalName: input.originalName };
}

/**
 * Mints a short-lived download URL for a stored object.
 *
 * Always call this at request time. Signed URLs expire, so they must never be
 * persisted in the database or cached in an API response.
 */
export async function getSignedUrl(objectPath: string): Promise<string> {
  if (usingLocalFallback()) {
    return `file://${localPathFor(objectPath).replace(/\\/g, "/")}`;
  }

  try {
    const { data, error } = await getClient()
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(objectPath, env.SUPABASE_SIGNED_URL_TTL);

    if (error || !data?.signedUrl) {
      throw new FileStorageError(
        `Could not sign '${objectPath}': ${error?.message ?? "no URL returned"}`,
        { cause: error },
      );
    }

    return data.signedUrl;
  } catch (error) {
    if (error instanceof FileStorageError) throw error;
    throw new FileStorageError(
      `Could not create a signed URL for '${objectPath}'`,
      { cause: error },
    );
  }
}

/** Deletes a stored object. Used when a competitor product is hard-deleted. */
export async function remove(objectPath: string): Promise<void> {
  if (usingLocalFallback()) {
    try {
      await unlink(localPathFor(objectPath));
    } catch (error) {
      // Already gone is the desired end state.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new FileStorageError(`Could not delete '${objectPath}'`, {
          cause: error,
        });
      }
    }
    return;
  }

  try {
    const { error } = await getClient()
      .from(env.SUPABASE_STORAGE_BUCKET)
      .remove([objectPath]);

    if (error) {
      throw new FileStorageError(
        `Could not delete '${objectPath}': ${error.message}`,
        { cause: error },
      );
    }
  } catch (error) {
    if (error instanceof FileStorageError) throw error;
    throw new FileStorageError(`Could not delete '${objectPath}'`, {
      cause: error,
    });
  }
}

/** Which backend is active, for startup logging and diagnostics. */
export function activeBackend(): "supabase" | "local" {
  return usingLocalFallback() ? "local" : "supabase";
}

logger.info(
  usingLocalFallback()
    ? { backend: "local", directory: path.resolve(LOCAL_DIR) }
    : { backend: "supabase", bucket: env.SUPABASE_STORAGE_BUCKET },
  usingLocalFallback()
    ? "File storage: local development fallback (files are NOT durable)"
    : "File storage: Supabase Storage (private bucket)",
);
