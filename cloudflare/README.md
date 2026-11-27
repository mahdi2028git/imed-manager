# IMED Manager — Cloudflare D1 and Worker

## Deployed resources

- D1 database: `imed-manager-db`
- Worker: `imed-manager-api`
- Worker URL: https://imed-manager-api.mahdigithub28.workers.dev
- Health endpoint: https://imed-manager-api.mahdigithub28.workers.dev/api/health
- D1 binding: `DB`
- Allowed browser origin: `https://mahdi2028git.github.io` (Worker variable `APP_ORIGIN`)

## Authentication (current implementation)

The Worker currently validates `Authorization: Bearer <API_KEY>` against the Worker secret `API_KEY`. It does **not** currently validate Cloudflare Access JWTs. Configure the secret with:

```sh
npx wrangler secret put API_KEY --config cloudflare/wrangler.jsonc
```

The app stores the key entered in its settings in browser localStorage. Treat it as a shared client credential, not as a secret that can be hidden from a browser user. Never commit the key to Git or put it in `.env.example`. For a public multi-user deployment, replace this shared-key model with per-user authentication (for example Cloudflare Access/JWT validation) before broad rollout.

The health endpoint is public. Data and snapshot endpoints require the bearer key. CORS only controls browser access; it is not an authentication boundary.

## D1 schema and migrations

- For a **new empty database**, initialize with `cloudflare/schema.sql`.
- For an existing database that already has migration `0002_local_first_matches.sql`, apply the non-destructive runtime-table migration:

```sh
npx wrangler d1 execute imed-manager-db --remote --file=cloudflare/migrations/0003_runtime_tables.sql --config cloudflare/wrangler.jsonc
```

- Migration `0002_local_first_matches.sql` drops and recreates `match_allocations`; it was intended only for the previously verified empty table. **Do not rerun it against a populated database.**
- Do not apply schema changes to production until a D1 backup has been taken and the migration target has been verified.

The bootstrap schema includes the six business tables plus the runtime tables used by the current Worker: `app_state_uploads`, `app_state_meta`, `match_jobs`, and `match_suggestion_cache`.

## API routes

All routes except `GET /api/health` require the bearer API key.

- `GET /api/state`
- `POST /api/state/chunk`
- `POST /api/state/commit`
- `POST /api/match-jobs`, `GET /api/match-jobs?baseHash=...`, `PATCH /api/match-jobs/:id`
- `GET /api/match-cache?baseHash=...`, `POST /api/match-cache`
- `GET /api/matches/sync?since=<ISO timestamp>`
- `POST /api/matches/sync` (up to 100 allocations per batch)
- Generic CRUD: `GET /api/{table}`, `GET /api/{table}/{id}`, `POST /api/{table}`, `PATCH /api/{table}/{id}`, `DELETE /api/{table}/{id}` for `products`, `customers`, `imed_distributions`, `sepidar_invoices`, and `sepidar_invoice_items`.

The local-first boundary remains: the browser's SQLite database is the primary store for imported IMED/Sepidar data and virtual inventory. D1 snapshot and match-sync features are separate mechanisms; do not treat the sync endpoint as a replacement for a tested local database backup.

## Operational checks

1. Verify `GET /api/health` returns `{ "ok": true }`.
2. Verify an unauthenticated `GET /api/state` returns HTTP 401.
3. Verify an authenticated `GET /api/state` returns either HTTP 200 or the expected empty-state HTTP 404.
4. Test chunk upload and commit using a disposable snapshot before enabling cloud sync on production data.
5. Export a local `.sqlite` backup before restoring or changing devices.
