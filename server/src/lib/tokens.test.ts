import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  generateToken,
  hashToken,
  hashesEqual,
  redactToken,
} from "./tokens.js";

describe("generateToken", () => {
  it("returns a url-safe opaque string", () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only
    expect(token).toHaveLength(43); // 32 bytes, unpadded
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("produces unique tokens", () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateToken));

    expect(tokens.size).toBe(2000);
  });
});

describe("hashToken", () => {
  it("is stable for the same input", () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("is a sha256 hex digest", () => {
    expect(hashToken("hunter2")).toBe(
      createHash("sha256").update("hunter2", "utf8").digest("hex"),
    );
    expect(hashToken(generateToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different tokens", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("never returns the plaintext", () => {
    const token = generateToken();

    expect(hashToken(token)).not.toContain(token);
  });
});

describe("hashesEqual", () => {
  it("compares hashes", () => {
    const hash = hashToken("x");

    expect(hashesEqual(hash, hashToken("x"))).toBe(true);
    expect(hashesEqual(hash, hashToken("y"))).toBe(false);
    expect(hashesEqual(hash, "short")).toBe(false);
  });
});

describe("redactToken", () => {
  it("never leaks the plaintext", () => {
    const token = generateToken();
    const redacted = redactToken(token);

    expect(redacted).not.toContain(token);
    expect(redacted).toBe(`<token:${hashToken(token).slice(0, 8)}>`);
    expect(redactToken("")).toBe("<empty>");
  });
});
