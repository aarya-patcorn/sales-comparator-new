import { OAuth2Client } from "google-auth-library";

import { env } from "../config/env.js";

/** Google's two accepted `iss` values. */
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

/** Raised for any token that cannot be trusted. Mapped to a 401 by callers. */
export class GoogleAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoogleAuthError";
  }
}

export type GoogleProfile = {
  /** Google's stable subject id — the value we bind to `users.google_sub`. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

/**
 * The client secret is held server-side only; it is not needed to verify an ID
 * token but is configured here so the OAuth client is complete and the secret
 * never has to be read anywhere else.
 */
const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
});

/**
 * Verifies a Google ID token server-side (blueprint §5.2 step 3).
 *
 * `verifyIdToken` checks the RS256 signature against Google's published keys,
 * the `aud` claim against our client id, and `exp`. The `iss` check below is
 * belt-and-braces. A token that fails any of these is never trusted — the
 * client's copy of the payload is irrelevant.
 */
export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleProfile> {
  if (typeof idToken !== "string" || idToken.trim().length === 0) {
    throw new GoogleAuthError("Missing Google ID token");
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    // Never echo the library message to the client: it can contain token bytes.
    throw new GoogleAuthError("Google ID token verification failed", {
      cause: error,
    });
  }

  if (!payload) {
    throw new GoogleAuthError("Google ID token had no payload");
  }

  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw new GoogleAuthError(`Unexpected token issuer: ${payload.iss}`);
  }

  if (!payload.sub) {
    throw new GoogleAuthError("Google ID token has no subject");
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
