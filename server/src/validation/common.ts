import { z } from "zod";

// ---------------------------------------------------------------- pagination

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?page=&pageSize=` — query values arrive as strings, so they are coerced. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Translates a validated page/pageSize pair into Prisma's skip/take. */
export function toSkipTake({ page, pageSize }: Pagination): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

// --------------------------------------------------------------- identifiers

export const uuidSchema = z.uuid();

/** For `/:id` route params. */
export const uuidParamSchema = z.object({ id: uuidSchema });

export type UuidParam = z.infer<typeof uuidParamSchema>;

/** For slug/text primary keys (substrates, tile types, application areas). */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "must be lowercase letters, digits or underscores");

// ------------------------------------------------------------- mobile number

export const MOBILE_MIN_DIGITS = 7;
export const MOBILE_MAX_DIGITS = 15; // E.164 upper bound

/**
 * RM login identifier. Accepts whatever the user typed (`+91 98765-43210`) and
 * reduces it to bare digits, which is what `users.mobile_number` stores.
 */
export const mobileNumberSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine(
    (digits) =>
      digits.length >= MOBILE_MIN_DIGITS && digits.length <= MOBILE_MAX_DIGITS,
    `mobile number must contain ${MOBILE_MIN_DIGITS}-${MOBILE_MAX_DIGITS} digits`,
  );

/**
 * Strips every non-digit and validates the 7-15 digit range.
 * Throws a ZodError when the input cannot be a mobile number.
 */
export function normalizeMobile(input: string): string {
  return mobileNumberSchema.parse(input);
}

/** Non-throwing variant: returns null instead of raising. */
export function safeNormalizeMobile(input: string): string | null {
  const result = mobileNumberSchema.safeParse(input);
  return result.success ? result.data : null;
}
