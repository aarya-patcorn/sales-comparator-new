# Staging runbook

## URLs

- Backend: https://kamdhenu-server-staging.onrender.com
- Admin: https://kamdhenu-admin-staging.onrender.com

## Deploy

1. Push to `main`.
2. Render auto-deploys both Blueprint services from that branch.
3. Wait for the backend health check, then check the admin site.

The Blueprint uses Render Postgres for staging. The backend's `start:prod`
command applies migrations before starting the server.

## Secrets

Keep secrets out of git. Set or rotate `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_ALLOWLIST_EMAILS` in the Render
dashboard. Set the matching Google OAuth value in Google Cloud Console and the
Supabase credentials in Supabase. After changing a Render variable, redeploy
the backend; the Vite `VITE_*` values require an admin site rebuild.

## Database

- Migration: open a Render Shell for the backend and run `npx prisma migrate deploy`.
- Reset: for staging only, remove/recreate the Render database from the Render
  dashboard, then run `npx prisma migrate deploy` (or redeploy) so migrations
  run again. This is destructive.
- Optional demo data: run `npm run db:seed` only with `APP_ENV=development` on a
  disposable staging database. Never use the demo seed against production.

The free Render Postgres plan expires 30 days after creation and has a 14-day
grace period before deletion. Upgrade the database to a paid plan before then
to keep staging data.

## Cold starts

Free Render web services sleep after about 15 minutes without traffic. The next
request cold-starts the service and can take about one minute. Upgrade the
backend web service to a paid plan if this interrupts mobile-app development.

## Health check

`GET https://kamdhenu-server-staging.onrender.com/api/health/ready` should return
HTTP 200 when the backend and database are ready.
