import { z } from "zod";

/**
 * The Google Identity button hands the SPA an ID token; the SPA posts it here.
 * Nothing else from the client is trusted — the profile comes from the verified
 * token, never from the request body.
 */
export const googleLoginSchema = z
  .object({
    idToken: z.string().min(1, "idToken is required"),
  })
  .strict();

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
