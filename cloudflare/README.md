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
