# Kamdhenu Sales Comparator — Rebuild Blueprint

Target stack:

- **Mobile app:** React Native (Expo recommended)
- **Admin panel:** React + TypeScript (Vite), **shadcn/ui** components
- **Server:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (with JSONB for technical specs)
- **ORM:** Prisma (recommended) or Drizzle
- **Admin auth:** Google OAuth (Sign in with Google) + app-issued session token
- **RM auth:** passwordless mobile-number login
- **AI:** OpenAI SDK — TDS extraction, sales pitch, recommendation letter (with fallbacks)
- **Dev tooling:** opencode with an MCP server wired to shadcn/ui for component scaffolding

---

## 1. Why PostgreSQL over MongoDB

| Concern | Postgres verdict |
| --- | --- |
| Competitors → competitor products | Natural parent/child with foreign keys; cascade deletes are trivial. |
| The original app's #1 bug (admin competitors never linked to comparisons) | FK relationships make this disconnect structurally impossible. |
| Unique active product codes, unique competitor/product pairs | Partial unique indexes (`WHERE deleted_at IS NULL`). |
| Fixed 20-field spec set, same for all products | `JSONB` column with a canonical key set (see §3). |
| Technical specs captured once from a TDS or manual entry | Values live on the product row; no separate sync table. |
| Node + TypeScript everywhere | Prisma/Drizzle give compile-time types from DB to UI. |
| Session TTL (Mongo had TTL indexes) | Expiry timestamp column + a scheduled cleanup job (pg_cron or node-cron). |
| RM + admin identities | One `users` table with a `role` column; one `sessions` table. Admin via Google `sub`, RM via mobile. |

**Rule of thumb applied here:** relational core + one flexible field = Postgres with JSONB. Reach for Mongo only when the *whole* domain is schema-less document data, which this is not.

---

## 2. PostgreSQL schema (DDL)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

CREATE TYPE spec_source AS ENUM ('tds_ai', 'manual');
CREATE TYPE user_role   AS ENUM ('rm', 'admin');

-- ========================= REFERENCE / CATALOG =========================
-- Static in the old app; kept as tables so admin can manage them later.

CREATE TABLE substrates (
  id          TEXT PRIMARY KEY,              -- stable slug e.g. 'concrete'
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tile_types (
  id          TEXT PRIMARY KEY,              -- 'vitrified'
  name        TEXT NOT NULL,
  category    TEXT,                          -- porcelain / ceramic / natural_stone ...
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tile_type_sizes (
  id            BIGSERIAL PRIMARY KEY,
  tile_type_id  TEXT NOT NULL REFERENCES tile_types(id) ON DELETE CASCADE,
  size_label    TEXT NOT NULL,               -- '24 x 48 in'
  UNIQUE (tile_type_id, size_label)
);

CREATE TABLE substrate_tile_map (            -- which tile types apply to a substrate
  substrate_id  TEXT NOT NULL REFERENCES substrates(id) ON DELETE CASCADE,
  tile_type_id  TEXT NOT NULL REFERENCES tile_types(id) ON DELETE CASCADE,
  PRIMARY KEY (substrate_id, tile_type_id)
);

CREATE TABLE application_areas (
  id          TEXT PRIMARY KEY,              -- 'living_room'
  name        TEXT NOT NULL,                 -- 'Living Room'
  sort_order  INT  NOT NULL DEFAULT 0
);

-- ========================= KAMDHENU PRODUCTS =========================

CREATE TABLE products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL,          -- 'K90'
  name               TEXT NOT NULL,
  description        TEXT,
  en_classification  TEXT,                   -- 'C2TE S1' etc.
  application_areas  TEXT[] NOT NULL DEFAULT '{}',
  technical_params   JSONB  NOT NULL DEFAULT '{}',   -- canonical 20-field set (see §3)
  is_active          BOOLEAN NOT NULL DEFAULT true,
  deleted_at         TIMESTAMPTZ,            -- soft delete
  created_by         UUID,
  updated_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_products_code_active
  ON products (code) WHERE deleted_at IS NULL;   -- one live product per code
CREATE INDEX idx_products_params ON products USING GIN (technical_params);

-- ========================= COMPETITORS =========================
-- These MUST be the single source of truth for comparisons (fixes bug #1).

CREATE TABLE competitors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,                 -- 'myk_laticrete'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_competitors_slug_active
  ON competitors (slug) WHERE deleted_at IS NULL;

-- Specs are captured ONCE at creation, two ways:
--   'tds_ai' : admin uploads a TDS file, AI extracts the 20 params, admin confirms
--   'manual' : admin types the params into the form
-- No scheduler, no re-sync, no hashes, no review state machine. A TDS is treated
-- as constant once created. ai_raw_extraction keeps the untouched AI output so a
-- later data question can distinguish an AI mistake from an admin edit.

CREATE TABLE competitor_products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id      UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  en_classification  TEXT,
  technical_params   JSONB NOT NULL DEFAULT '{}',   -- final, admin-confirmed 20-field set
  spec_source        spec_source NOT NULL,          -- 'tds_ai' | 'manual'
  tds_file_url       TEXT,        -- object-storage reference to the uploaded TDS (null if manual)
  tds_file_name      TEXT,        -- original filename, for display/re-download
  ai_raw_extraction  JSONB,       -- exactly what the AI returned, before admin edits
  ai_model           TEXT,        -- model + version used, for audit
  is_active          BOOLEAN NOT NULL DEFAULT true,
  deleted_at         TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- an AI-sourced product must have a stored file reference
  CONSTRAINT chk_tds_file CHECK (spec_source <> 'tds_ai' OR tds_file_url IS NOT NULL)
);
CREATE UNIQUE INDEX uq_comp_products_name_active
  ON competitor_products (competitor_id, name) WHERE deleted_at IS NULL;

-- ========================= USERS & SESSIONS =========================
-- One table for both RM and admin (role column separates them).
--   RM    : passwordless login via mobile_number.
--   admin : Google OAuth. We store Google's stable subject id (google_sub),
--           NOT a password. Google proves identity; our app authorizes (allow-list)
--           and issues its own session token. Session TTL (RM 7d, admin 12h) is app logic.

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role           user_role NOT NULL,
  name           TEXT,
  email          TEXT,
  mobile_number  TEXT,                     -- RM login (null for admin)
  google_sub     TEXT,                     -- Google subject id (admin; null for RM)
  avatar_url     TEXT,                     -- optional, from Google profile
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_mobile     ON users (mobile_number) WHERE mobile_number IS NOT NULL;
CREATE UNIQUE INDEX uq_users_google_sub ON users (google_sub)    WHERE google_sub    IS NOT NULL;
CREATE UNIQUE INDEX uq_users_email      ON users (email)         WHERE email IS NOT NULL AND role = 'admin';

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,              -- app-issued token, stored as SHA-256 (never plaintext)
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_sessions_hash   ON sessions (token_hash);
CREATE INDEX        idx_sessions_expiry ON sessions (expires_at);

-- ========================= AI CACHES =========================
-- Improvement over the old app: cache_key includes a spec hash so edits
-- naturally miss the cache; is_fallback + expires_at stop fallbacks sticking.

CREATE TABLE pitch_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key    TEXT NOT NULL,             -- code|competitor|specHash|promptVer|variant
  lines        JSONB NOT NULL,           -- array of strings (max 3)
  is_fallback  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ               -- short TTL for fallbacks
);
CREATE UNIQUE INDEX uq_pitch_cache_key ON pitch_cache (cache_key);

CREATE TABLE recommendation_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key    TEXT NOT NULL,
  content      TEXT NOT NULL,
  is_fallback  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_reco_cache_key ON recommendation_cache (cache_key);
```

### Optional: normalized parameter table

If you later want to query/aggregate across a single spec (e.g. "all products with
adhesion > 1.0 N/mm²"), add a normalized table alongside JSONB:

```sql
CREATE TABLE product_parameters (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,      -- 'adhesion'
  value_text  TEXT,               -- '1.2 N/mm²' (as displayed)
  value_num   NUMERIC,            -- 1.2 (parsed, for comparison)
  unit        TEXT,               -- 'N/mm²'
  UNIQUE (product_id, key)
);
```

Recommendation: **start with JSONB only.** It matches the source app, keeps writes
simple, and covers the comparison flow (union of keys + per-key compare). Add the
normalized table only when a real query needs it.

---

## 3. Technical parameters (canonical field set)

Both Kamdhenu products and competitor products use the **same fixed set of 20 fields**,
stored in `technical_params` (JSONB). Same keys everywhere means comparison columns line
up automatically. All values are **strings**, kept exactly as they appear on the sheet
(ranges, `≥`/`≤`, and units are preserved); a missing spec is `null`.

Define this list **once in code** as `PARAM_FIELDS`. The server, the admin form, and the
AI extraction prompt all read from it, so adding or renaming a spec is a one-line change.

| Key | Display label | Example value |
| --- | --- | --- |
| `open_time` | Open Time | `20-30 minutes` |
| `pot_life` | Pot Life | `2-3 hours` |
| `adjustability_time` | Adjustability Time | `10-15 minutes` |
| `tensile_adhesion_is` | Initial Tensile Adhesion (IS) | `≥ 0.5 N/mm²` |
| `tensile_adhesion_water` | Tensile Adhesion after Water Immersion | `0.45-0.55 N/mm²` |
| `tensile_adhesion_heat` | Tensile Adhesion after Heat Aging | `0.50-0.60 N/mm²` |
| `tensile_adhesion_freeze_thaw` | Tensile Adhesion after Freeze-Thaw | `0.50-0.55 N/mm²` |
| `slip_resistance` | Slip Resistance | `≤ 0.5 mm` |
| `shear_adhesion_dry` | Shear Adhesion (Dry) | `1.0-1.2 N/mm²` |
| `shear_adhesion_wet` | Shear Adhesion (Wet) | `0.9-1.1 N/mm²` |
| `mixing_ratio` | Mixing Ratio (powder:water) | `1 : 0.25` |
| `coverage` | Coverage | `4-5 m² per 20kg @ 3mm bed` |
| `setting_time` | Setting Time | `24 hours` |
| `adhesive_thickness` | Adhesive Thickness | `3-10 mm` |
| `mixed_density` | Mixed Density | `1.6-1.8 kg/L` |
| `application_temp` | Application Temp | `5°C to 35°C` |
| `voc_content` | VOC Content | `< 5 g/kg` |
| `shelf_life` | Shelf Life | `9-12 months` |
| `packaging` | Packaging | `20 KG bag` |
| `color` | Color | `Grey` |

### Shared definition + zod schema

```typescript
// src/lib/paramFields.ts — single source of truth
export const PARAM_FIELDS = [
  ["open_time", "Open Time"],
  ["pot_life", "Pot Life"],
  ["adjustability_time", "Adjustability Time"],
  ["tensile_adhesion_is", "Initial Tensile Adhesion (IS)"],
  ["tensile_adhesion_water", "Tensile Adhesion after Water Immersion"],
  ["tensile_adhesion_heat", "Tensile Adhesion after Heat Aging"],
  ["tensile_adhesion_freeze_thaw", "Tensile Adhesion after Freeze-Thaw"],
  ["slip_resistance", "Slip Resistance"],
  ["shear_adhesion_dry", "Shear Adhesion (Dry)"],
  ["shear_adhesion_wet", "Shear Adhesion (Wet)"],
  ["mixing_ratio", "Mixing Ratio (powder:water)"],
  ["coverage", "Coverage"],
  ["setting_time", "Setting Time"],
  ["adhesive_thickness", "Adhesive Thickness"],
  ["mixed_density", "Mixed Density"],
  ["application_temp", "Application Temp"],
  ["voc_content", "VOC Content"],
  ["shelf_life", "Shelf Life"],
  ["packaging", "Packaging"],
  ["color", "Color"],
] as const;

import { z } from "zod";
export const technicalParamsSchema = z.object(
  Object.fromEntries(PARAM_FIELDS.map(([k]) => [k, z.string().nullable()]))
);
export type TechnicalParams = z.infer<typeof technicalParamsSchema>;
```

The same object shape is passed to the OpenAI call as the structured-output JSON schema,
forcing the model to return exactly these 20 keys and `null` for anything not found.

---

## 3a. Adding a competitor product (AI upload OR manual)

Both paths end at the same place: an admin-confirmed 20-field `technical_params` object.

```
                        ┌─ Upload TDS (PDF/image) ─┐
Admin opens the form ───┤                           ├─→ Prefilled 20-field form
                        └─ (or) start blank ────────┘        │
                                                             │ admin reviews / edits
                                                             ▼
                                              Save → technical_params (+ file ref if AI)
```

1. **AI path (`spec_source = 'tds_ai'`):** admin uploads the TDS. The backend stores the
   file in object storage, sends it to the model with `PARAM_FIELDS` and a
   structured-output schema, and returns the extracted JSON. That JSON **prefills** the
   form. The raw output is saved to `ai_raw_extraction`; `ai_model` records the model used.
2. **Manual path (`spec_source = 'manual'`):** admin fills the same form by hand;
   `tds_file_url` and `ai_raw_extraction` stay null.
3. Either way, the admin confirms and the final values save to `technical_params`.

**Key principle: AI prefills, the admin confirms.** Models can misread a spec sheet
(wrong column, unit confusion, wrong product variant), so a human confirmation step keeps
the data trustworthy — and it's nearly free since the form already exists. Nothing the AI
returns is treated as final until saved through the form.

There is **no scheduler, no re-sync, no hashing, and no pending/approved review** — a TDS
is constant once created. To correct a product later, edit it or replace it; the file
reference and raw extraction remain for audit.

---

## 4. Recommendation rules

The old app hardcodes rules in `seed_data.py` (priority order + mm thresholds). Two options:

1. **Keep the rule engine in code** (recommended). It is deterministic priority logic
   that is awkward to express fully as data. Put it in `services/recommendation.ts`
   as a pure function; resolve the chosen product code from the DB.
2. **Move thresholds to a `recommendation_rules` table** if the business wants admins
   to tune size thresholds without a deploy. Heavier; only do this if asked.

Either way, **product resolution reads the DB** — no static fallback that can resurrect
a deactivated product (fixes bug #5). If a rule points at a missing/inactive code,
return a clear error rather than silently substituting.

---

## 5. Authentication

Two separate paths, both ending in an **app-issued bearer token** backed by the
`sessions` table. The token is a random string; only its SHA-256 hash is stored, and the
plaintext is returned to the client exactly once.

### 5.1 RM login (passwordless, unchanged)

1. Client posts `{ mobileNumber }` to `POST /api/auth/login`.
2. Number normalized to 7-15 digits; find an active RM in `users` (`role = 'rm'`).
3. Create a session, return the plaintext token once.
4. Client sends `Authorization: Bearer <token>` on protected RM endpoints.
5. `GET /api/auth/me` resolves the hashed session, checks expiry and `is_active`.
   RM sessions default to 7 days.

### 5.2 Admin login (Google OAuth)

Google proves **identity**; our app decides **authorization** and owns the session.
We never use Google's token as our API token.

```
Admin app ──"Sign in with Google"──▶ Google ──ID token (JWT)──▶ Admin app
Admin app ──POST /api/admin/auth/google { idToken } ──▶ Backend
Backend: verify JWT (signature, aud, iss, exp) with google-auth-library
       → check email_verified === true
       → authorize against the admin allow-list
       → upsert users row by google_sub, set last_login_at
       → create session, return app bearer token (once)
Admin app stores token → Authorization: Bearer <token> on all admin calls
```

1. Admin clicks **Sign in with Google**; Google returns an **ID token** to the SPA.
2. SPA posts it to `POST /api/admin/auth/google`.
3. Backend **verifies the ID token** against Google's public keys and checks `aud`
   (our client ID), `iss`, and expiry. A token that isn't verified server-side is never
   trusted.
4. Backend requires `email_verified === true`, then extracts `sub`, `email`, `name`,
   `picture`.
5. **Authorization — allow-list (chosen approach).** Admins are pre-seeded in `users`
   with `role = 'admin'` and their email. Login succeeds only if an active admin row
   matches; on first successful login we bind that row's `google_sub`. Anyone without a
   row is rejected — OAuth alone does not grant admin access. New admins are added by an
   existing admin (email + `role: admin`).
6. Backend upserts the row (by `google_sub`), sets `last_login_at`, creates a session,
   and returns the app bearer token once. Admin sessions default to 12 hours.
7. `GET /api/admin/auth/me` and `POST /api/admin/auth/logout` behave as before, keyed on
   the app session — no Google round-trip.

**Notes**

- The Google **client secret** stays server-side only; the SPA holds just the public
  client ID.
- Matching on `google_sub` (stable) rather than email means an admin's email can change
  without breaking login.
- This removes all password handling: the old `ADMIN_PASSWORD_HASH_ITERATIONS`,
  `ADMIN_DEFAULT_PASSWORD`, and password seeding are gone. Admin seeding is just
  email + `role: admin`.
- `google-auth-library` replaces the PBKDF2/argon2 dependency.

---

## 6. Server structure (Node + Express + TypeScript)

```
server/
  src/
    config/          env loading + validation (zod), db client
    db/              prisma schema / drizzle schema, migrations, seeders
    middleware/      rmAuth, adminAuth, errorHandler, requestLogger
    validation/      zod request schemas (replaces Pydantic)
    modules/
      auth/          rm passwordless login/logout/me
      admin-auth/    google id-token verify + allow-list + session issue
      catalog/       substrates, tile-types, areas, kamdhenu, competitors
      recommend/     rule engine + product resolution
      compare/       spec table builder + advantage detection
      ai/            pitch + recommendation-text (OpenAI + fallbacks)
      tds-extract/   upload -> AI structured extraction -> prefill (creation only)
      admin/         dashboard, users, products, competitors CRUD
    jobs/            node-cron: session cleanup
    lib/             openai client, googleAuth, paramFields, unit parsing, file storage
    app.ts           express app wiring
    server.ts        bootstrap (validate env -> connect DB -> seed -> listen)
```

Replacements from the old stack:

| Old (Python) | New (Node) |
| --- | --- |
| Pydantic v2 | zod |
| Motor / PyMongo | Prisma / Drizzle |
| pypdf + BeautifulSoup (TDS scraping) | OpenAI structured extraction from the uploaded file |
| APScheduler-style loop | removed (session cleanup via node-cron only) |
| PBKDF2 admin passwords | Google OAuth (`google-auth-library`) |
| Uvicorn | express + node |

---

## 7. API surface (keep the contract, fix the auth)

Keep the same routes so the mobile flow maps cleanly, with these changes:

- **Require RM auth** on `/recommend`, `/compare`, `/pitch`, `/recommendation-text`
  (they were public in the old app — bug #4).
- **Admin login is Google OAuth:** `POST /api/admin/auth/google` (verify ID token,
  allow-list, issue session) replaces the old user-id/password login.
- **Comparisons read `competitor_products`**, never a static array (fixes bug #1).
  `spec_source` on each product tells the UI whether specs came from a TDS or manual entry.
- **Competitor-product create supports file upload.** `POST /api/admin/competitor-products`
  accepts either a manual body or a multipart upload; a separate
  `POST /api/admin/tds/extract` takes a file and returns the prefilled 20-field JSON
  without saving.

Route groups: `/api/auth/*`, `/api/catalog/*`, `/api/recommend`, `/api/compare`,
`/api/pitch`, `/api/recommendation-text`, `/api/admin/auth/google|me|logout`,
`/api/admin/*` (users, products, competitors, competitor-products),
`/api/admin/tds/extract`, `/api/health`.

---

## 8. Admin panel (React + TypeScript + shadcn/ui)

- Vite + React + TS + Tailwind, React Router, **React Query** for server state,
  a small typed fetch/axios client with the app bearer token in memory + refresh from storage.
- **UI:** shadcn/ui components (Radix + Tailwind, copied into the repo under
  `src/components/ui`, fully ownable/themeable). Scaffolded via the shadcn **MCP server
  wired into opencode** — generate/add components through MCP rather than hand-copying,
  and keep a single `components.json` + Tailwind theme as the design source of truth.
- **Login:** a single "Sign in with Google" screen (Google Identity button) → posts the
  ID token to `/api/admin/auth/google` → stores the returned app token. No password UI.
- **Pages:** Login, Dashboard, RM Users, Products, Competitors + Competitor Products.
- Suggested shadcn pieces: `table` + `data-table` (lists), `dialog`/`sheet` (create/edit),
  `form` + `input`/`select` + `sonner` toasts (the 20-field spec form), `card` (dashboard),
  `dropdown-menu` (row actions), `tabs` (upload-vs-manual), `badge` (`spec_source`).
- The competitor-product form renders the **fixed 20 `PARAM_FIELDS`** (not a free
  key/value editor), with two tabs:
  - **Upload TDS** → `/api/admin/tds/extract` → fields prefill → admin edits → save.
  - **Enter manually** → admin types the fields → save.
- The Kamdhenu product form reuses the same 20-field layout for consistent comparison columns.

---

## 9. Mobile app (React Native / Expo)

Screens follow the sales journey:

`Login (mobile number)` → `Substrate` → `Tile Type` → `Tile Size` → `Application Area`
→ `Recommendation` → `Compare` (select competitors) → `Pitch / Recommendation Letter`.

- React Navigation (stack), React Query for data, `expo-secure-store` for the bearer
  token, a shared typed API client (ideally generated from the same zod schemas).

---

## 10. Known defects to fix during the rebuild

| # | Old defect | Fix in rebuild |
| --- | --- | --- |
| 1 | Admin competitors never used by comparisons | Comparisons read `competitor_products` via FK. |
| 2 | TDS review RM-protected / stale scheduler | Removed entirely; specs captured once at creation (AI or manual). |
| 3 | Admin password handling / weak seeds | Google OAuth + allow-list; no passwords stored. |
| 4 | Sales APIs unauthenticated | Require RM auth. |
| 5 | Static fallback resurrects deactivated products | DB is the only source of truth. |
| 6 | Cache not invalidated on product edits | Spec hash in cache key. |
| 7 | AI fallbacks cached permanently | `is_fallback` + short `expires_at`. |
| 8 | Advantage detection ignores units | Parse number + unit from the string; treat as a hint. |
| 9 | Inconsistent soft/hard deletes | Products/competitors soft, sessions hard. |

---

## 11. Configuration (.env)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `PORT`, `HOST` | Server bind. |
| `CORS_ORIGINS` | Admin + Expo origins, comma-separated. |
| `SESSION_TTL_DAYS` | RM session lifetime (default 7). |
| `ADMIN_SESSION_TTL_HOURS` | Admin session lifetime (default 12). |
| `GOOGLE_CLIENT_ID` | Google OAuth client id (also exposed to the admin SPA as a public build var). |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret — server only. |
| `ADMIN_ALLOWLIST_EMAILS` | Optional comma-separated bootstrap admins for first seed. |
| `OPENAI_API_KEY` | TDS extraction, pitch, recommendation. |
| `OPENAI_MODEL` | Model id (default a current vision-capable model). |
| `FILE_STORAGE_*` | Object-storage (S3) bucket/keys for uploaded TDS files. |
| `LOG_LEVEL` | Backend log level. |

Admin SPA build var: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.

---

## 12. Suggested build order

1. Postgres schema + Prisma/Drizzle models + migrations.
2. `PARAM_FIELDS` + zod schemas (shared by server, admin, extraction).
3. Seeders (substrates, tile types, areas, 5 Kamdhenu products, competitors, allow-list admins).
4. RM auth (passwordless) + admin auth (Google OAuth) + session middleware.
5. Catalog endpoints.
6. Recommendation engine.
7. Comparison + advantage detection (DB-backed competitors).
8. TDS AI extraction endpoint + competitor-product create (upload + manual).
9. AI pitch + recommendation (with fallbacks + smart cache keys).
10. Admin panel: shadcn/ui scaffold via MCP, Google login, then CRUD screens.
11. Mobile app screens.
