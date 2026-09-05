# Sales Comparator — Server

Node.js + Express + TypeScript backend for the Kamdhenu Sales Comparator.
Spec of record: `../REBUILD_BLUEPRINT (1).md`.

Implements blueprint build-order steps 1–10a: schema and migrations, the shared
`PARAM_FIELDS` contract, seeders, RM + admin authentication, catalog,
recommendation engine, comparison, TDS extraction, AI copy with caching, and the
admin management API.

**Not production data yet.** The seeded catalog, the Kamdhenu `technical_params`
and the recommendation rule sets are placeholders — see [Before going
live](#before-going-live).

---

## Requirements

- Node.js >= 20
- PostgreSQL 14+ (developed against 16)

## Setup

```bash
npm install                # also runs `prisma generate`
cp .env.example .env       # then fill in the values below
createdb sales_comparator
npm run db:migrate         # apply migrations
npm run db:seed            # catalog, products, example competitors, admins
npm run dev                # http://localhost:4000
curl http://localhost:4000/api/health
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with `tsx watch` (reloads on change) |
| `npm run build` | Type-check and emit to `dist/` |
| `npm start` | Run the compiled server (`dist/server.js`) |
| `npm test` | Run the vitest suite |
| `npm run lint` | ESLint over the repo |
| `npm run db:migrate` | `prisma migrate dev` — create and apply a migration |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:seed` | Run the idempotent seeder |
| `npm run db:reset` | **Destructive.** Drop, re-migrate and re-seed — dev only |
| `npm run db:studio` | Prisma Studio |

## Environment variables

Validated at startup by `src/config/env.ts` (zod). The process exits with a
per-field message if anything is missing or malformed. Blank values
(`OPENAI_API_KEY=`) count as unset for optional variables.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `APP_ENV` | no | `development` | `development` \| `staging` \| `production` — gates required integrations |
| `DATABASE_URL` | **yes** | — | Postgres connection string |
| `PORT` | no | `4000` | Bind port |
| `HOST` | no | `0.0.0.0` | Bind host |
| `CORS_ORIGINS` | no | *(empty)* | Comma-separated browser origins (admin SPA + Expo) |
| `TRUST_PROXY` | no | `false` | `false`, `true`, a hop count (`1`), or an IP/CIDR list |
| `LOG_LEVEL` | no | `info` | pino level (`fatal`…`trace`, `silent`) |
| `SESSION_TTL_DAYS` | no | `7` | RM session lifetime |
| `ADMIN_SESSION_TTL_HOURS` | no | `12` | Admin session lifetime |
| `SESSION_CLEANUP_CRON` | no | `0 * * * *` | node-cron expression for purging expired sessions |
| `AUTH_RATE_LIMIT_WINDOW_MS` | no | `900000` | Rate-limit window for credential endpoints |
| `AUTH_RATE_LIMIT_MAX` | no | `20` | Attempts allowed per window per IP |
| `ADMIN_ALLOWLIST_EMAILS` | no | *(empty)* | Comma-separated bootstrap admin emails for the seeder |
| `GOOGLE_CLIENT_ID` | **yes** | — | Google OAuth client id (also a public build var for the SPA) |
| `GOOGLE_CLIENT_SECRET` | **yes** | — | Google OAuth secret — server-side only |
| `OPENAI_API_KEY` | no | — | Enables TDS extraction and AI copy; absent ⇒ graceful degradation |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Vision-capable model |
| `SUPABASE_URL` | staging/prod | — | Supabase project URL (storage bucket only) |
| `SUPABASE_SERVICE_ROLE_KEY` | staging/prod | — | **Secret.** Server-side only — never expose to the SPA or app |
| `SUPABASE_STORAGE_BUCKET` | no | `tds-files` | Private bucket for TDS uploads |
| `SUPABASE_SIGNED_URL_TTL` | no | `3600` | Signed download URL lifetime, seconds |

The admin SPA additionally needs `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`
(blueprint §11).

> **Secrets:** `.env.example` is committed — keep placeholders only. Real values
> belong in `.env`, which is gitignored.

### CORS and Expo

`CORS_ORIGINS` should list the admin SPA origin (Vite: `http://localhost:5173`)
and the Expo dev origins (`http://localhost:8081`, `http://localhost:19006`).
Requests with no `Origin` header — native Expo, curl, mobile clients — are always
allowed; CORS is a browser mechanism and every protected route still requires a
bearer token.

### Behind a proxy

`TRUST_PROXY` defaults to `false`. Setting it to `true` lets any client spoof
`X-Forwarded-For` and bypass IP rate limiting, so behind a single load balancer
set `TRUST_PROXY=1`, or list the proxy addresses explicitly.

---

## API route map (blueprint §7)

All routes are under `/api`. "RM" and "admin" require
`Authorization: Bearer <token>` for a session of that role.

| Route | Auth | Description |
| --- | --- | --- |
| `GET /api/health` | — | Liveness + DB check + version |
| `POST /api/auth/login` | — *(rate limited)* | `{ mobileNumber }` → `{ token, user }` |
| `POST /api/auth/logout` | optional bearer | Always `204` |
| `GET /api/auth/me` | RM | `{ user }` |
| `GET /api/catalog/substrates` | RM | Ordered by `sort_order` |
| `GET /api/catalog/tile-types` | RM | `?substrate_id=` filters via `substrate_tile_map` |
| `GET /api/catalog/areas` | RM | Application areas |
| `GET /api/catalog/kamdhenu` | RM | Active, non-deleted products |
| `GET /api/catalog/competitors` | RM | Competitors + their active products |
| `POST /api/recommend` | RM | `{ substrateId, tileTypeId, tileSize, area }` → `{ product, recommendation }` |
| `POST /api/compare` | RM | `{ kamdhenuCode, competitorProductIds }` → `{ columns, rows, summary, talkingPoints }` |
| `POST /api/pitch` | RM | `{ kamdhenuCode, competitorProductId, variant? }` → `{ lines, variant, isFallback, cached }` |
| `POST /api/recommendation-text` | RM | `{ kamdhenuCode, competitorProductIds, …context }` → `{ content, isFallback, cached }` |
| `POST /api/admin/auth/google` | — *(rate limited)* | `{ idToken }` → `{ token, user }` |
| `GET /api/admin/auth/me` | admin | `{ user }` |
| `POST /api/admin/auth/logout` | optional bearer | Always `204` |
| `POST /api/admin/tds/extract` | admin | multipart `file` → `{ params, model }`, saves nothing |
| `GET /api/admin/dashboard` | admin | RM user and product counts |
| `GET POST /api/admin/users` · `PUT DELETE /:id` · `PATCH /:id/status` | admin | RM users (**hard** delete) |
| `GET POST /api/admin/admins` · `PATCH /:id/status` | admin | Administrator allow-list |
| `GET POST /api/admin/products` · `GET PUT DELETE /:id` · `PATCH /:id/status` | admin | Kamdhenu products (**soft** delete) |
| `GET POST /api/admin/competitors` · `PUT DELETE /:id` · `PATCH /:id/status` | admin | Competitors (**soft**, cascades) |
| `GET POST /api/admin/competitor-products` · `GET PUT DELETE /:id` · `PATCH /:id/status` | admin | Competitor products (**soft**) |

List endpoints accept `?page=&pageSize=&search=&isActive=` (`pageSize` capped at
100) and return a `pagination` object.

### Errors

Every failure returns the same envelope:

```json
{ "error": { "code": "validation_error", "message": "Request validation failed", "details": [] } }
```

| Status | Codes |
| --- | --- |
| 400 | `validation_error`, `unknown_reference`, `invalid_upload`, `bad_request` |
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `duplicate_product_code`, `duplicate_competitor_slug`, `duplicate_competitor_product`, `duplicate_mobile_number`, `duplicate_admin`, `cannot_deactivate_self`, `recommended_product_unavailable` |
| 422 | `extraction_failed` |
| 429 | `rate_limited` |
| 503 | `ai_unavailable` |
| 500 | `internal_error` |

`details` carries field-level issues for validation failures. A 500 never
exposes the underlying message or stack in production — the real error is logged
server-side. Outside production the cause is included in `details` for debugging.

---

## Architecture

```
src/
  config/      env loading + validation (zod)
  db/          Prisma client singleton, seeder
  generated/   Prisma Client output (gitignored)
  middleware/  auth, errorHandler, rateLimit, upload
  validation/  shared zod schemas (pagination, ids, technicalParams)
  modules/
    auth/          RM passwordless login + session service
    admin-auth/    Google ID-token verify + allow-list
    catalog/       substrates, tile types, areas, products, competitors
    recommend/     pure rule engine + DB product resolution
    compare/       comparison table + advantage detection
    ai/            pitch + recommendation letter + caching
    tds-extract/   OpenAI structured extraction (prefill only)
    admin/         dashboard, users, products, competitors CRUD
  jobs/        node-cron session cleanup
  lib/         logger, tokens, googleAuth, openaiClient, fileStorage (Supabase),
               paramFields, units, specHash
  app.ts       express wiring
  server.ts    bootstrap + listen
```

### Sessions

Both roles end at an app-issued opaque bearer token (not a JWT). Only its
SHA-256 hash is stored in `sessions.token_hash`; the plaintext is returned once.
RM sessions last 7 days, admin 12 hours. Expired rows are purged on access and
hourly by the cron job. Deactivating or deleting a user revokes their sessions
immediately.

### Admin login (Google OAuth)

Google proves *identity*; this server decides *authorization* and owns the
session. The ID token is verified server-side (signature, `aud`, `iss`, `exp`)
and `email_verified` must be true. An active `role = 'admin'` row must already
exist, matched by `google_sub` or case-insensitive email — OAuth alone grants
nothing. `google_sub` is bound on first login.

### Recommendation engine

`src/modules/recommend/rules.ts` is pure: same input → same code and reasons. It
returns a product **code**; the controller resolves it against live products and
returns **409** if it is missing or inactive rather than substituting.

| # | Rule | Outcome |
| --- | --- | --- |
| 1 | difficult / flexible substrate | K90, or KX at ≥ 1000 mm |
| 2 | pool or industrial | KX |
| 3 | outdoor / facade | K90, or KX at ≥ 800 mm |
| 4 | natural stone | K80, or K90 at ≥ 1000 mm |
| 5 | porcelain / vitrified | K60 → K80 → K90 → KX at 600 / 800 / 1200 mm |
| 6 | ceramic, mosaic, glass, other | K50 under 600 mm, else K80 |
| 7 | nothing matched | K60 |

Size = largest integer in the label, treated as inches, converted to mm. A label
with no digits (`"Slab"`) is treated as large format and says so in `reasons`.

### Comparison and advantage detection

`kamdhenuAdvantage` is a **presentation hint, not a standards calculation**: it
means one printed number beats another in the same unit, not that a product
outperforms another under EN 12004 / IS 15477. Ambiguous parameters are
`neutral`; no claim is made for null, non-numeric or non-comparable units
(`src/lib/units.ts` folds MPa ↔ N/mm² and time to minutes, but refuses N/mm² vs
kg/cm²). The six talking points are deterministic and fact-only, and the last is
always the "compared as printed" caveat.

### TDS extraction — AI prefills, the admin confirms

`POST /api/admin/tds/extract` returns prefill values and **saves nothing**.
`POST /api/admin/competitor-products` saves the row; with a file it stores the
document, sets `spec_source = 'tds_ai'` and keeps the untouched model output in
`ai_raw_extraction`. **In both modes the saved `technical_params` are the
admin-confirmed body values** — the model never writes to that column. A failed
extraction still saves the row; only the audit trail is lost.

### File storage (Supabase)

Uploaded TDS documents live in a **private Supabase Storage bucket**. Supabase is
used for the bucket only — the database stays on Neon/Postgres via
`DATABASE_URL`.

- `src/lib/fileStorage.ts` exposes `save()`, `getSignedUrl()`, `remove()` and
  `activeBackend()`. The client is built from `${SUPABASE_URL}/storage/v1` with
  the service role key as both `apikey` and bearer, and is cached on `globalThis`
  so hot reloads reuse it. The bucket is created on first use if missing
  (`{ public: false }`); an "already exists" race is ignored.
- **`competitor_products.tds_file_url` stores the object PATH, not a URL**
  (`tds/{uuid}-{sanitized-name}`). Signed URLs expire, so they are minted on
  demand and never persisted. `GET /api/admin/competitor-products/:id` returns
  `tdsFileSignedUrl` alongside the path; a signing failure logs a warning and
  returns `null` rather than hiding the whole record.
- `DELETE /api/admin/competitor-products/:id?purge=true` hard-deletes the row and
  removes the stored object. Without `purge` the delete stays soft and the file
  is kept for audit.
- **Local development fallback:** with no `SUPABASE_URL` and
  `APP_ENV=development`, files are written to `./uploads` and `getSignedUrl()`
  returns a `file://` URL, so the app runs without Supabase. The active backend
  is logged at startup. Outside development both Supabase variables are
  required, so a misconfigured deploy fails fast instead of silently writing to
  a disk that disappears on the next release.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security: server-side only, never
shipped to the admin panel or the mobile app.

### AI copy and caching

Cache keys embed a SHA-256 hash of the exact spec values plus the prompt
version, so an edit or a prompt change misses the cache (defect #6). Admin spec
edits additionally delete matching rows. On failure the endpoints still answer
200 with deterministic, data-only copy stored with `is_fallback = true` and a
15-minute `expires_at` (defect #7); successful copy has no expiry.

### Delete semantics (defect #9)

| Entity | Delete |
| --- | --- |
| RM users | hard (`sessions` cascade via FK) |
| Products, competitors, competitor products | soft (`deleted_at`, `is_active = false`) |
| Competitor products with `?purge=true` | hard, plus the stored TDS is deleted |
| Sessions | hard |

Soft-deleting a product frees its code for reuse: `uq_products_code_active` only
covers live rows.

---

## Database

- **Prisma 7** with the node-postgres driver adapter (`@prisma/adapter-pg`).
- Schema: `prisma/schema.prisma`, a direct translation of blueprint §2.
- CLI config: `prisma7.config.ts` (reads `DATABASE_URL` from `.env`).

### Constraints applied as raw SQL

At the bottom of `prisma/migrations/20260905000000_init/migration.sql`:

| Object | Why raw |
| --- | --- |
| `CREATE EXTENSION pgcrypto` | needed for `gen_random_uuid()` |
| `uq_products_code_active`, `uq_competitors_slug_active`, `uq_comp_products_name_active` | partial unique — `WHERE deleted_at IS NULL` |
| `uq_users_email` | partial unique — `WHERE email IS NOT NULL AND role = 'admin'` |
| `chk_tds_file` | `CHECK (spec_source <> 'tds_ai' OR tds_file_url IS NOT NULL)` |
| `products.application_areas SET NOT NULL` | Prisma omits `NOT NULL` on scalar list columns |

Prisma's diff engine ignores these, so `migrate dev` does not drop them, and
`migrate reset` replays them. Do **not** use `prisma db push`, which builds from
the schema alone and would skip them.

`uq_users_mobile` and `uq_users_google_sub` are plain `@unique`: in Postgres a
unique index over a nullable column already treats NULLs as distinct.

---

## Testing

```bash
npm test
```

272 tests. Most use an in-memory Prisma fake, but `*.db.test.ts` files talk to a
real Postgres and **skip with a warning** unless `TEST_DATABASE_URL` points at a
migrated database:

```powershell
createdb sales_comparator_test
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sales_comparator_test"
npx prisma migrate deploy      # once, with DATABASE_URL set to the same value
npm test
```

They truncate every table, so point them at a throwaway database only. Cross-file
parallelism is disabled (`fileParallelism: false`) because of that.

`npm run build` type-checks `src/` but excludes `*.test.ts`. To type-check tests
too:

```bash
npx tsc --noEmit -p tsconfig.json
```

---

## Before going live

1. **Rotate the Google client secret** — a real value was previously committed to
   `.env.example`.
2. **Reconcile the placeholder catalog** in `src/db/seed.ts` (substrate and tile
   type slugs, sizes, the substrate→tile map, application areas) against the
   original app's `seed_data.py`.
3. **Fill the Kamdhenu `technical_params`** from the real TDS sheets. Every value
   is `null` today, deliberately — invented spec figures would be quoted to
   customers.
4. **Confirm the rule-engine sets** in `src/modules/recommend/rules.ts`
   (`DIFFICULT_SUBSTRATES`, `NATURAL_STONE_TILE_TYPES`, `VITRIFIED_TILE_TYPES`,
   pool/outdoor areas). A missing id falls through to a weaker adhesive.
5. **Confirm `PARAM_DIRECTION`** in `src/modules/compare/advantage.ts` with the
   technical team.
6. **Replace the example competitors** with real data entered through the admin
   panel.
7. Set `TRUST_PROXY`, `CORS_ORIGINS`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and a real
   `OPENAI_API_KEY` for the target environment.

## Remaining work (blueprint §12)

- Admin panel: React + Vite + shadcn/ui (§8)
- Mobile app: React Native / Expo (§9)
