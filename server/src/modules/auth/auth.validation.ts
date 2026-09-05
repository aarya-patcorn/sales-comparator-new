import { z } from "zod";

import { mobileNumberSchema } from "../../validation/common.js";

/**
 * RM passwordless login (blueprint §5.1).
 * `mobileNumber` is normalized to bare digits by mobileNumberSchema.
 */
export const loginSchema = z
  .object({
    mobileNumber: mobileNumberSchema,
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
