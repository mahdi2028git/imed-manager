# IMED Manager — Cloudflare D1

The Cloudflare resources for this project have been created in the connected account.

## Deployed resources

- D1 database: `imed-manager-db`
- Worker: `imed-manager-api`
- Worker URL: https://imed-manager-api.mahdigithub28.workers.dev
- Public health endpoint: https://imed-manager-api.mahdigithub28.workers.dev/api/health
- D1 binding: `DB`
- GitHub Pages origin allowlist: `https://mahdi2028git.github.io`

The D1 schema has six core tables: `products`, `customers`, `imed_distributions`, `sepidar_invoices`, `sepidar_invoice_items`, and `match_allocations`.

## API routes

All data routes require a valid Cloudflare Access JWT:

- `GET /api/{table}?limit=100&offset=0`
- `GET /api/{table}/{id}`
- `POST /api/{table}`
- `PATCH /api/{table}/{id}`
- `DELETE /api/{table}/{id}`

Allowed tables: `products`, `customers`, `imed_distributions`, `sepidar_invoices`, `sepidar_invoice_items`, `match_allocations`.

## Remaining setup

1. Configure a Cloudflare Access application and policy for the Worker hostname.
2. Add Worker variables `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` using the values from that Access application.
3. Configure the browser app to authenticate through Access and call this API.
4. Migrate the existing browser-local SQLite data only after verifying the mapping and taking a backup.

Until Access is configured, the health endpoint is public but data endpoints intentionally return HTTP 401. The current frontend still uses its existing browser-local SQLite storage; it has not yet been migrated to this API.

Never commit API tokens, passwords, or Access secrets to this repository.


## Local-first match sync (implementation branch)

The intended data boundary is deliberately small:

- The browser's existing SQLite database in IndexedDB remains the primary store for IMED distributions, Sepidar rows, imports, and virtual inventory.
- D1 stores only synchronized match allocations.
- Stable business keys (`distribution_key`, `sepidar_item_key`) identify source rows across devices; device-local row IDs are informational only.
- The Worker exposes `GET /api/matches/sync?since=<ISO timestamp>` and `POST /api/matches/sync` (batches of up to 100). Requests still require Cloudflare Access.
- `deleted_at` is a tombstone field so a future client can propagate deletions without silently losing history.

Before enabling production sync, the frontend must generate deterministic business keys from imported source rows, maintain a durable local outbox/tombstones, merge remote changes into local SQLite, and handle conflicts. Do not enable writes or apply the schema migration until those client-side pieces and Cloudflare Access are configured and tested. The app's current local SQLite data must be backed up before any migration or sync rollout.
