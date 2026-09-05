import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // *.db.test.ts files truncate every table, so they must not run alongside
    // each other. Cross-file parallelism is off; the suite is fast enough.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // *.db.test.ts talk to a real Postgres. Point TEST_DATABASE_URL at a
      // migrated throwaway database to enable them; they self-skip otherwise.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/sales_comparator_test",
      LOG_LEVEL: "silent",
      // Pinned so TTL assertions do not depend on a developer's .env.
      SESSION_TTL_DAYS: "7",
      ADMIN_SESSION_TTL_HOURS: "12",
      GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "gpt-4o-mini",
      // No SUPABASE_URL: the suite exercises the local-disk fallback, and
      // fileStorage.supabase.test.ts mocks the env module for the real backend.
      APP_ENV: "development",
      // Effectively disabled for the suite; rateLimit.test.ts builds its own
      // limiter with a low ceiling to test the behaviour directly.
      AUTH_RATE_LIMIT_MAX: "100000",
    },
  },
});
