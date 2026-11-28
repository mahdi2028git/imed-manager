# Background matching jobs (experimental)

This feature is **not yet deployed or end-to-end verified**. The existing full browser matcher remains the authoritative workflow. The server matcher only produces **review-only, scored IRC, Persian descriptor, model and product-attribute suggestions**. It does not implement fuzzy product/reference/date rules, cannot confirm allocations, and never submits IMED documents.

## Deployment prerequisites

1. Back up D1. Apply `cloudflare/migrations/0005_server_match_jobs.sql` to the configured production D1 database.
2. Deploy the Worker with `cloudflare/wrangler.jsonc`, which schedules a Cron Trigger every minute. Confirm the cron trigger is active in Cloudflare.
3. Confirm the API secret and CORS origin. Synchronize all IMED, Sepidar and virtual inventory data to the cloud snapshot before starting a job.
4. On the reconciliation page, choose **شروع Job سرور (IRC دقیق)**. Closing the browser after successful job creation does not cancel the scheduled processing. Reopen the page and use **وضعیت Job**.
5. Test on a copy of production data: create job, close browser, wait for cron, reopen, inspect `GET /api/server-match-jobs/:id` and paginated `/:id/results?offset=0`.

## Current limitations

- This server implementation deliberately refuses ambiguous matches and rejects conflicting explicit IRCs and uses Persian descriptors, model and product attributes when exact IRC matching is unavailable, constrained to positive virtual inventory IRCs. This is **not parity with the existing full browser matcher**.
- The snapshot must remain unchanged during a job; a change marks it failed rather than using inconsistent input. A new job can then be started.
- Each scheduled invocation processes 10 IMED rows, approximately 10 per minute; no guarantees on scheduling delay.
- No automatic allocations. Review suggestions before manually applying anything.
- The UI currently shows job status and count of the first page of results, not a full result review table.
- Do not merge or deploy without syntax/contract tests and a real Cloudflare cron test.
