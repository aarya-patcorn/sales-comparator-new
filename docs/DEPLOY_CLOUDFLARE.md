# Deploying To Cloudflare

`server/src/worker.ts` runs the existing Express application through Cloudflare's
Node HTTP bridge. The normal Node entrypoint (`src/server.ts`) remains unchanged
for local development and non-Worker deployments.

## 1. Authenticate And Create Hyperdrive

Use the direct hosted PostgreSQL connection string. Do not use a pooled connection string and do not commit it.

```powershell
cd server
npx wrangler login
npx wrangler hyperdrive create kamdhenu-hd --connection-string="<DIRECT_DATABASE_URL>"
```

Copy the returned Hyperdrive ID into the `HYPERDRIVE` binding in `wrangler.jsonc`.

## 2. Configure Worker Secrets

Set every value interactively. Never put any secret in `wrangler.jsonc`, `.env.example`, source files, documentation, or Git.

```powershell
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_ALLOWLIST_EMAILS
```

The Worker maps `env.HYPERDRIVE.connectionString` to `DATABASE_URL` before the
app and Prisma factory load. Do not configure `DATABASE_URL` as a Worker secret
when using Hyperdrive; retain the direct URL only outside Workers for Prisma CLI
migrations.

Set the non-secret `vars.CORS_ORIGINS` in `server/wrangler.jsonc` to the deployed
admin origin before deployment. Replace only the placeholder Hyperdrive ID in the
same file; it is an identifier, not a database credential.

## 3. Apply Database Migrations

Migrations never run in a Worker and must complete before `wrangler deploy`.
Run `prisma migrate deploy` in a protected CI migration job that has a direct
database URL, or use the manual fallback below. This repository does not include
a GitHub Actions migration workflow, so do not assume one exists.

```powershell
cd server
$env:DATABASE_URL = "<DIRECT_DATABASE_URL>"
npx prisma migrate deploy
```

The migration job may hold `DATABASE_URL` as its CI secret. The value must not be
copied into Worker secrets or `wrangler.jsonc`; runtime database access is through
the Hyperdrive binding. For a schema migration, merge the migration files first,
run the migration job once against the intended database, verify the job output,
then deploy the Worker. Never run `prisma migrate dev`, `migrate reset`, or seeding
from a Worker or against production as part of the deployment command.

## 4. Seed Production Safely

Production seeding may only create allow-listed admin users. Do not insert example catalog or competitor records into production. The current seed script does not yet support an allow-list-only command, so do not run the full seed against production until that mode has been implemented.

```powershell
cd server
$env:APP_ENV = "production"
$env:DATABASE_URL = "<DIRECT_DATABASE_URL>"
# Required after an allow-list-only seed mode is implemented:
npm run db:seed -- --allow-list-only
```

Run sample/catalog data only against an explicitly designated staging database.

## 5. Deploy

```powershell
cd server
npx wrangler deploy
```

Record the URL returned by Wrangler, normally `https://kamdhenu-server.<account>.workers.dev`.

## 6. Verify The Live Service

```powershell
Invoke-WebRequest https://<worker>.workers.dev/api/health/live
Invoke-WebRequest https://<worker>.workers.dev/api/health/ready
```

Both endpoints must return HTTP 200. Readiness must report a successful database connection through the configured Worker adapter/Hyperdrive binding.

Then validate a protected endpoint with a real token. For example, after an RM has authenticated:

```powershell
$headers = @{ Authorization = "Bearer <RM_SESSION_TOKEN>" }
Invoke-WebRequest https://<worker>.workers.dev/api/catalog/substrates -Headers $headers
```

Confirm the response is HTTP 200 and contains live catalog rows from the hosted database.

## Failure Recovery

- `Authentication error`: run `npx wrangler login` and verify with `npx wrangler whoami`.
- `Hyperdrive binding missing`: ensure the `HYPERDRIVE` binding name and ID in `wrangler.jsonc` match the Worker code.
- `Database unavailable`: run migrations with the direct URL, verify Hyperdrive points to the same database, then redeploy.
- `Missing secret`: set it with `npx wrangler secret put <NAME>` and redeploy.
- `Readiness returns 503`: inspect `npx wrangler tail kamdhenu-server`, correct the binding or migration issue, and redeploy.

## Deploy The Admin To Cloudflare Pages

Create a Pages project connected to this GitHub repository with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `admin` |
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

The committed `admin/public/_redirects` file copies to `dist/_redirects` during the Vite build and makes all client routes fall back to `index.html` with HTTP 200.

Set the following **Pages build-time** environment variables for production and preview environments:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The deployed Worker URL, for example `https://kamdhenu-server.<account>.workers.dev` |
| `VITE_GOOGLE_CLIENT_ID` | The Google OAuth web client ID |

`VITE_*` variables are included in the browser bundle. Never set Worker or Supabase service-role secrets as Pages environment variables.

Deploy from the Pages dashboard, or after authentication with Wrangler:

```powershell
cd admin
npm ci
npm run build
npx wrangler pages deploy dist --project-name=<pages-project-name>
```

Record the resulting URL as `https://<pages-project-name>.pages.dev`.

## Cross-Service Wiring

After the Pages URL is known, add its exact origin, with no trailing slash, to the Worker's `CORS_ORIGINS` variable and redeploy the Worker. Include the Expo web origin if it is known.

Update `vars.CORS_ORIGINS` in the deployed Worker's `wrangler.jsonc`, then redeploy:

```powershell
cd server
npx wrangler deploy
```

Add the same exact Pages origin to the Google OAuth client's **Authorized JavaScript origins** in Google Cloud Console. Google Console changes require an account with permission to edit that OAuth client and cannot be made by Wrangler.

## Mobile Backend Configuration

Set `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_BACKEND_URL` in the mobile build environment to the Worker URL, without the `/api` suffix:

```text
EXPO_PUBLIC_API_URL=https://kamdhenu-server.<account>.workers.dev
```

The shared mobile API client appends `/api` and attaches the stored bearer token to protected requests. Rebuild the Expo application after changing this public build-time value.

## End-To-End Release Check

1. Sign in to the deployed admin site with Google and create or update one Kamdhenu product and one competitor product.
2. Upload a real TDS and confirm extraction succeeds and its object appears in the configured private Supabase bucket.
3. Sign in to the mobile app as an RM and complete the recommendation, comparison, pitch, and PDF-share flow.
4. Confirm `GET /api/health/ready` returns HTTP 200 before marking the release complete.

## Scheduled Cleanup

`wrangler.jsonc` includes the hourly trigger `0 * * * *`. Its `scheduled()`
handler calls the database-backed expired-session cleanup function through the
same Prisma/Hyperdrive adapter used for HTTP requests. It does not run migrations
or seed data.

## Worker Compatibility Notes

The Worker enables `nodejs_compat` and `enable_nodejs_http_server_modules`, then
adapts Express with `node:http` and `cloudflare:node`'s `httpServerHandler`.
The existing Multer memory-storage middleware continues to parse multipart
`FormData` through that Node request stream. Keep TDS uploads at or below the
existing 10 MB limit. This is a best-effort compatibility path and should be
validated with a real multipart upload in the target Workers account before a
production rollout.
