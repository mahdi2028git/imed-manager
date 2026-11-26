# IMED Manager — Cloudflare D1 setup

This folder contains the D1 schema and a small Cloudflare Worker API for the IMED Manager project.

## Database design (six tables)

1. `products` — product master data (IRC, GTIN, name, model, manufacturer).
2. `customers` — hospitals, clinics, pharmacies and other customers.
3. `imed_distributions` — IMED distribution documents and virtual-warehouse quantities.
4. `sepidar_invoices` — Sepidar invoice headers.
5. `sepidar_invoice_items` — Sepidar invoice lines.
6. `match_allocations` — allocations connecting sold invoice lines to IMED distribution rows.

Remaining virtual stock is represented by `imed_distributions.remaining_quantity`; allocations are recorded separately in `match_allocations`.

## Create the real D1 database

A Cloudflare account owner must do this step in their own account. No credentials are stored in this repository.

1. Sign in to Cloudflare and open **Workers & Pages → D1 SQL Database**.
2. Create a database named `imed-manager-db`.
3. Copy its database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_DATABASE_ID`.
4. From this folder, apply the schema using Wrangler:

```bash
npx wrangler d1 execute imed-manager-db --remote --file=./schema.sql
```

5. Set up a Cloudflare Access application protecting the Worker hostname. Copy its team domain and application audience.
6. Add Worker variables/secrets:
   - `ACCESS_TEAM_DOMAIN`: your Cloudflare Access team domain, e.g. `your-team.cloudflareaccess.com`
   - `ACCESS_AUD`: the Access application's AUD tag
   - `APP_ORIGIN`: the exact GitHub Pages origin (origin only, no path)
7. Deploy:

```bash
npx wrangler deploy --config wrangler.jsonc
```

## API routes

All data routes require a valid Cloudflare Access JWT. The Access application must protect the Worker hostname before using this API.

- `GET /api/health` — public health check (no database data).
- `GET /api/{table}?limit=100&offset=0`
- `GET /api/{table}/{id}`
- `POST /api/{table}`
- `PATCH /api/{table}/{id}`
- `DELETE /api/{table}/{id}`

Allowed table names: `products`, `customers`, `imed_distributions`, `sepidar_invoices`, `sepidar_invoice_items`, `match_allocations`.

## Important

- The Worker is not deployed and the D1 database is not created until the account owner completes the Cloudflare steps above.
- The API deliberately denies data requests unless Cloudflare Access JWT verification is configured.
- Do not put Cloudflare API tokens, database credentials, or Access secrets in GitHub source files.
- Test Cloudflare availability and account eligibility from the intended network before importing company data.
