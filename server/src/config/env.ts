import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

/** Splits a comma-separated env value into a trimmed, non-empty list. */
const commaSeparatedList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

/**
 * An optional variable. An empty value in a .env file (`OPENAI_API_KEY=`) means
 * "not configured", not "invalid" — otherwise shipping a commented-out template
 * stops the server from booting.
 */
const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * Deployment stage, distinct from NODE_ENV (which is also "production" in a
   * staging build). Drives which integrations are mandatory.
   */
  APP_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  // Consumed by both the Prisma CLI (via prisma7.config.ts) and the runtime
  // driver adapter in src/db/client.ts.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (Postgres connection string)")
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  CORS_ORIGINS: commaSeparatedList,
  // Optional bootstrap admins for the seeder (blueprint §11). Empty is valid:
  // admins can also be added later by an existing admin.
  ADMIN_ALLOWLIST_EMAILS: commaSeparatedList
    .pipe(z.array(z.email("ADMIN_ALLOWLIST_EMAILS must contain valid emails")))
    .transform((emails) => emails.map((email) => email.toLowerCase())),
  // Session lifetimes (blueprint §5): RM 7 days, admin 12 hours.
  SESSION_TTL_DAYS: z.coerce.number().positive().max(365).default(7),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(12),
  // How often the node-cron job purges expired sessions.
  SESSION_CLEANUP_CRON: z.string().min(1).default("0 * * * *"),
  // Rate limiting for the credential endpoints (login / Google sign-in).
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /**
   * Express `trust proxy`. Defaults to "false": trusting every hop lets a
   * client spoof X-Forwarded-For and bypass IP rate limiting. Behind one known
   * load balancer set "1"; or give an explicit comma-separated IP/CIDR list.
   */
  TRUST_PROXY: z.string().default("false"),
  // Google OAuth (blueprint §5.2). The client id is also shipped to the admin
  // SPA as a public build var; the secret must never leave the server.
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1, "GOOGLE_CLIENT_ID is required (Google OAuth client id)"),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1, "GOOGLE_CLIENT_SECRET is required (server-side only)"),
  // OpenAI (blueprint §3a). The key is optional so the rest of the server runs
  // without it; TDS extraction fails gracefully with a 503 when it is absent.
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  // Supabase Storage holds uploaded TDS documents. The database stays on
  // Neon/Postgres (DATABASE_URL) — Supabase is used for the bucket only.
  SUPABASE_URL: optionalString,
  /** Server-side secret. Never expose to the admin SPA or the mobile app. */
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("tds-files"),
  /** Lifetime of on-demand signed download URLs, in seconds. */
  SUPABASE_SIGNED_URL_TTL: z.coerce
    .number()
    .int()
    .positive()
    .max(604800)
    .default(3600),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

/**
 * Supabase Storage is mandatory outside development: a staging or production
 * deployment that silently fell back to local disk would lose every uploaded
 * TDS on the next deploy.
 */
const envSchemaWithRules = envSchema.superRefine((value, ctx) => {
  if (value.APP_ENV === "development") return;

  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required when APP_ENV is '${value.APP_ENV}'`,
      });
    }
  }
});

export type Env = Readonly<z.infer<typeof envSchema>>;

function loadEnv(): Env {
  const parsed = envSchemaWithRules.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    // Logger depends on env, so this must go straight to stderr.
    process.stderr.write(
      `\nInvalid environment configuration:\n${details}\n\n` +
        "Check your .env file against .env.example.\n\n",
    );
    process.exit(1);
  }

  return Object.freeze({
    ...parsed.data,
    CORS_ORIGINS: Object.freeze([...parsed.data.CORS_ORIGINS]) as string[],
    ADMIN_ALLOWLIST_EMAILS: Object.freeze([
      ...parsed.data.ADMIN_ALLOWLIST_EMAILS,
    ]) as string[],
  });
}

export const env: Env = loadEnv();
