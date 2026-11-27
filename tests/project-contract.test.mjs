import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [worker, schema, migration, app, html, userscript] = await Promise.all([
  read("../cloudflare/worker.js"),
  read("../cloudflare/schema.sql"),
  read("../cloudflare/migrations/0003_runtime_tables.sql"),
  read("../assets/js/app.js"),
  read("../index.html"),
  read("../tampermonkey/IMED_Grok_Tampermonkey.user.js"),
]);

// Worker endpoints must have matching D1 bootstrap/migration tables.
for (const table of ["app_state_uploads", "app_state_meta", "match_jobs", "match_suggestion_cache", "match_allocations"]) {
  assert.match(schema, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\b"), "schema missing " + table);
}
for (const table of ["app_state_uploads", "app_state_meta", "match_jobs", "match_suggestion_cache"]) {
  assert.match(migration, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\b"), "migration missing " + table);
}
for (const column of ["distribution_key", "sepidar_item_key", "distribution_local_id", "sepidar_item_local_id", "matched_quantity", "match_method", "status", "notes", "device_id", "updated_at", "deleted_at"]) {
  assert.match(schema, new RegExp("\\b" + column + "\\b"), "schema missing match sync column " + column);
}
assert.match(worker, /parts\[1\] === "matches" && parts\[2\] === "sync"/);
assert.match(worker, /Authorization/);
assert.match(worker, /env\.API_KEY/);

// The old numeric-ID generic CRUD route must not expose the text-key sync table.
const tableMap = worker.slice(worker.indexOf("const TABLES"), worker.indexOf("function json"));
assert.doesNotMatch(tableMap, /match_allocations/);

// Guard the two user-approved business rules against accidental regressions.
const infer = app.slice(app.indexOf("function inferTypeId"), app.indexOf("function applyKnownTypeIds"));
assert.match(infer, /if\(!type\)return'2'/);
assert.match(infer, /return '2'/);
const quota = app.slice(app.indexOf("function makeQuotaRows"), app.indexOf("function xmlEsc"));
assert.match(quota, /تطبیق ناقص/);
assert.match(quota, /skipped\.push/);

// Local SQLite restore must validate a database before replacing the current handle.
assert.match(app, /const nextDB=new SQL\.Database\(bytes\)/);
assert.match(app, /loadStateFromSQLite\(nextDB\)/);
assert.match(app, /if\(!confirm\('پایگاه داده فعلی با فایل SQLite انتخاب‌شده جایگزین شود\؟'\)\)return/);

// The legacy userscript must not claim that its unverified phase two was auto-filled.
assert.doesNotMatch(userscript, /priceDone/);
assert.match(userscript, /مرحله ۲ به‌صورت خودکار انجام نمی‌شود/);
assert.match(userscript, /ثبت نهایی همچنان فقط با کلیک دستی خودت انجام می‌شود/);

// App shell and cache-busting versions stay aligned.
assert.match(html, /نسخه ۰\.۳۱\.۰/);
assert.match(html, /styles\.css\?v=0\.31\.0/);
assert.match(html, /app\.js\?v=0\.31\.0/);

console.log("IMED Manager contract checks passed.");
