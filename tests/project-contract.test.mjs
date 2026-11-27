import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [worker, schema, migration, app, html, userscript, version] = await Promise.all([
  read("../cloudflare/worker.js"),
  read("../cloudflare/schema.sql"),
  read("../cloudflare/migrations/0003_runtime_tables.sql"),
  read("../assets/js/app.js"),
  read("../index.html"),
  read("../tampermonkey/IMED_Grok_Tampermonkey.user.js"),
  read("../VERSION"),
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

assert.match(worker, /crypto\.subtle\.timingSafeEqual/, "Worker API keys must use constant-time comparison");
assert.match(worker, /crypto\.subtle\.digest\("SHA-256"/, "Worker API key comparison must hash to a fixed length");
assert.doesNotMatch(worker, /supplied\.length\s*!==\s*expected\.length/, "Worker API key validation must not early-return on secret length mismatch");

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
assert.match(quota, /total>num\(d\.quantity\)\+0\.00001/, "XML export must reject allocation totals above the distribution quantity");
assert.match(app, /if\(v\.errors\.length\)/, "XML generation must stop when any required row field is invalid");
assert.match(app, /v\.skipped\.map/, "partial quantity must be reported visibly");
assert.match(app, /فقط برای همین ردیف‌های معتبر/, "partial XML must explain its actual scope");

assert.match(app, /function quotaAllocationsFor\(d\)/, "XML preparation must share the same saved and proposed allocation list");
assert.match(app, /const alloc=quotaAllocationsFor\(d\)/, "XML UI must display automatic proposals as well as saved allocations");
assert.match(app, /inventoryId:String\(p\.inventoryId\|\|''\)/, "manual InventoryID choices for proposals must persist");
assert.match(app, /const prospectiveUsed=\{\.\.\.usedInventory\}/, "each XML document must reserve inventory in its own ledger");
assert.match(app, /makeQuotaRows\(x\.d,false,false,prospectiveUsed\)/, "bulk XML must validate each document against remaining inventory");
assert.match(app, /Object\.assign\(usedInventory,prospectiveUsed\)/, "rejected documents must not consume inventory");
assert.match(app, /sharedInventoryUsed\|\|\{\}/, "quota generation must accept a shared inventory-capacity ledger");
// Local SQLite restore must validate a database before replacing the current handle.
assert.match(app, /sqlite_master WHERE type='table'/, "SQLite restore must reject unrelated databases");
assert.match(app, /await idbPut\('main',copy\)/, "SQLite restore must persist the validated replacement before swapping the live database");
assert.match(app, /Object\.assign\(state,previousState\)/, "SQLite restore must roll back in-memory state after a failed restore");
assert.match(app, /nextDB=new SQL\.Database\(bytes\)/);
assert.match(app, /loadStateFromSQLite\(nextDB\)/);
assert.match(app, /if\(!confirm\('پایگاه داده فعلی با فایل SQLite انتخاب‌شده جایگزین شود\؟'\)\)return/);

assert.match(quota, /hasTypeSource=String\(d\.receiverNature\|\|d\.distributionType\|\|''\)\.trim\(\)/, "explicit TypeID must not be rejected by the fallback when source type is absent");

// All nine fields in each Quota XML row are mandatory: no blank, invalid IRC,
// nonpositive quantity/price, or unknown TypeID may leak into the serializer.
const fieldsSource=app.slice(app.indexOf("const QUOTA_XML_FIELDS="),app.indexOf("function makeQuotaRows("));
const serializerSource=app.slice(app.indexOf("function xmlEsc("),app.indexOf("function validateXmlDoc("));
assert.ok(fieldsSource.startsWith("const QUOTA_XML_FIELDS="),"XML required-field validation is missing");
assert.ok(serializerSource.startsWith("function xmlEsc("),"XML serializer is missing");
const {quotaXml,quotaFieldErrors}=runInNewContext(fieldsSource+"\n"+serializerSource+"\n({quotaXml,quotaFieldErrors})",{
 latin: s=>String(s??"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)),
 VALID_DISTRIBUTION_TYPE_IDS:new Set(["1","2","4","5","6","9","15","17","18","19","21"]),
});
const validQuota={TypeID:"2",IRC:"4747326544788685",Count:3,RialPrice:250000,InvoiceNo:"43",InvoiceDate:"1404/07/23",InventoryID:"inventory-01",ReceiverCode:"receiver-01",ReceiverName:"مرکز درمانی"};
const validXml=quotaXml([validQuota]);
assert.match(validXml,/<QuotaList>/);
for(const field of Object.keys(validQuota)){
 assert.ok(validXml.includes("<"+field+">"),"XML missing required element "+field);
 const blank={...validQuota,[field]:"  "};
 assert.ok(quotaFieldErrors(blank).includes(field),"blank "+field+" must be rejected");
 assert.throws(()=>quotaXml([blank]),/فیلدهای اجباری XML نامعتبرند/,field+" should block XML creation");
}
for(const field of ["Count","RialPrice"]){
 assert.ok(quotaFieldErrors({...validQuota,[field]:-1}).includes(field),"negative "+field+" must be rejected");
 assert.ok(quotaFieldErrors({...validQuota,[field]:0}).includes(field),"zero "+field+" must be rejected");
}
assert.ok(quotaFieldErrors({...validQuota,IRC:"ABC"}).includes("IRC"),"nonnumeric IRC must be rejected");
assert.ok(quotaFieldErrors({...validQuota,TypeID:"999"}).includes("TypeID"),"unknown TypeID must be rejected");
assert.throws(()=>quotaXml([]),/هیچ ردیف معتبری/);
assert.match(quota,/norm\(documentIrc\)!==norm\(sourceIrc\)/,"a conflicting sales IRC must block XML export");
assert.match(app,/IMED_XML_Rejected_Documents\.csv/,"rejected XML documents require an exception report");

// Re-importing invoice files must not collapse distinct product lines that share invoice/customer/quantity.
assert.match(app, /norm\(x\.product\)===norm\(row\.product\)/, "Sepidar import dedupe must include the product identity");
assert.match(app, /String\(x\.irc\|\|''\)===String\(row\.irc\|\|''\)/, "Sepidar import dedupe must include exact IRC");
assert.match(app, /num\(x\.unitPrice\)===num\(row\.unitPrice\)/, "Sepidar import dedupe must preserve distinct price lines");
assert.match(app, /norm\(x\.product\)===norm\(d\.product\)/, "IMED import dedupe must preserve product distinctions");

// Incomplete matches are valid partial sales, not items requiring manual review.
const reviewStatus = app.slice(app.indexOf("function needsManualReviewStatus"), app.indexOf("function refresh()"));
assert.ok(reviewStatus.includes("status==='none'||status==='over'"), "only unmatched and overallocated documents need review");
assert.ok(!reviewStatus.includes("status==='partial'"), "partial matches must not be counted as needing review");
assert.ok(app.includes("pending=state.imed.filter(d=>needsManualReviewStatus(dashboardDocStatus(d))).length"), "dashboard needs-review card must use the new classification");

// JSON exports must round-trip precomputed match suggestions across browsers.
assert.match(app, /matchProposals:state\.matchProposals\|\|null,importSources:state\.importSources\|\|\{\}/, "JSON backup must include automatic proposals");
assert.match(app, /state\.matchProposals=x\.matchProposals\|\|null/, "JSON restore must load automatic proposals");
assert.match(app, /const restored=await restoreSavedMatchProposals\(\)/, "JSON restore must validate saved matching fingerprint");

// The legacy userscript must not claim that its unverified phase two was auto-filled.
assert.doesNotMatch(userscript, /priceDone/);
assert.match(userscript, /مرحله ۲ به‌صورت خودکار انجام نمی‌شود/);
assert.match(userscript, /ثبت نهایی همچنان فقط با کلیک دستی خودت انجام می‌شود/);

// Canonical release version, app shell, and cache-busting versions stay aligned.
assert.equal(version.trim(), "0.31.1", "VERSION must be the canonical release version");
assert.match(html, /نسخه ۰\.۳۱\.۱/);
assert.match(html, /styles\.css\?v=0\.31\.1/);
assert.match(html, /app\.js\?v=0\.31\.1/);

console.log("IMED Manager contract checks passed.");
