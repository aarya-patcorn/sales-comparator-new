import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes of entropy -> 43 base64url characters. */
const TOKEN_BYTES = 32;

/**
 * App-issued bearer token (blueprint §5): an opaque random string, not a JWT.
 * The plaintext is returned to the client exactly once and is NEVER stored or
 * logged — only `hashToken()` output goes into `sessions.token_hash`.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of the token, hex encoded. Stable for a given input. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two token hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Safe representation for logs and error messages. Never interpolate a raw
 * token into a log line — use this instead.
 */
export function redactToken(token: string): string {
  if (token.length === 0) return "<empty>";
  return `<token:${hashToken(token).slice(0, 8)}>`;
}
