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
assert.match(app, /makeQuotaRows\(x\.d,false,false,usedInventory\)/, "bulk XML must share remaining InventoryID capacity across documents");
assert.match(app, /sharedInventoryUsed\|\|\{\}/, "quota generation must accept a shared inventory-capacity ledger");
// Local SQLite restore must validate a database before replacing the current handle.
assert.match(app, /sqlite_master WHERE type='table'/, "SQLite restore must reject unrelated databases");
assert.match(app, /await idbPut\('main',copy\)/, "SQLite restore must persist the validated replacement before swapping the live database");
assert.match(app, /Object\.assign\(state,previousState\)/, "SQLite restore must roll back in-memory state after a failed restore");
assert.match(app, /nextDB=new SQL\.Database\(bytes\)/);
assert.match(app, /loadStateFromSQLite\(nextDB\)/);
assert.match(app, /if\(!confirm\('پایگاه داده فعلی با فایل SQLite انتخاب‌شده جایگزین شود\؟'\)\)return/);

assert.match(quota, /hasTypeSource=String\(d\.receiverNature\|\|d\.distributionType\|\|''\)\.trim\(\)/, "explicit TypeID must not be rejected by the fallback when source type is absent");
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
assert.equal(version.trim(), "0.32.2", "VERSION must be the canonical release version");
assert.match(html, /نسخه ۰\.۳۲\.۲/);
assert.match(html, /styles\.css\?v=0\.32\.2/);
assert.match(html, /app\.js\?v=0\.32\.2/);

// Financial fields are optional, separate across source systems, and totals are shown for review.
assert.match(app, /imedUnitPrice/);
assert.match(app, /imedTotalAmount/);
assert.match(app, /function renderDist\(/);
assert.match(app, /computedLineTotal\(a\.allocatedQty,a\.unitPrice\)/);
assert.match(app, /RialPrice:num\(a\.unitPrice\)/, "IMED XML rial price must come from the Sepidar allocation");
assert.match(app, /کمترین مانده کافی برای همان IRC/, "inventory candidate selection must use remaining balance");
assert.match(html, /statFinancialCoverage/);
// The current stock-clearance workflow must never search IMED documents
// whose IRC has no positive balance in the latest inventory snapshot.
assert.match(app, /function positiveInventoryByIrc\(rows\)/);
assert.match(app, /state\.imed\.filter\(d=>remainingCapacityByIrc\.has\(norm\(d\.irc\)\)\)/);
assert.match(app, /if\(num\(v\.remainingQty\)<=0\)continue/, "zero-balance stock descriptors must not be indexed");
assert.match(app, /if\(left>0&&stockRemaining>0\)/, "no proposals may be calculated for a depleted IRC");
assert.match(app, /Math\.min\(left,c\.free,stockRemaining\)/, "new proposals must not exceed remaining inventory");
assert.match(app, /if\(x\.irc&&x\.irc!==di\)continue/, "different explicit IRCs cannot be treated as the same item");
assert.match(app, /matcherVersion:5/, "stock-rule changes must invalidate old matching results");
assert.match(app, /status==='out-of-scope'/, "historical zero-stock documents must remain visible but out of scope");
assert.match(app, /const excludedDocs=state\.imed\.length-allAutoRows\.length/);

// Exercise the pure inventory-budget helper, including duplicate snapshots
// whose last record reports zero (old positive stock must not be reused).
const helperSource = app.slice(app.indexOf("function positiveInventoryByIrc"), app.indexOf("async function calculateAllAutoMatches"));
const positiveInventoryByIrc = runInNewContext(
  helperSource + "\npositiveInventoryByIrc",
  { norm: (v) => String(v ?? "").trim(), num: (v) => Number(v) || 0, Map },
);
const balances = positiveInventoryByIrc([
  { irc: "IRC-A", inventoryId: "old", remainingQty: 30 },
  { irc: "IRC-A", inventoryId: "old", remainingQty: 0 },
  { irc: "IRC-A", inventoryId: "new", remainingQty: 70 },
  { irc: "IRC-B", inventoryId: "zero", remainingQty: 0 },
  { irc: "IRC-C", inventoryId: "negative", remainingQty: -10 },
  { irc: "IRC-D", inventoryId: "active", remainingQty: 12 },
  { irc: "IRC-A", inventoryId: "", remainingQty: 900 },
]);
assert.equal(balances.get("IRC-A"), 70);
assert.equal(balances.get("IRC-D"), 12);
assert.equal(balances.has("IRC-B"), false);
assert.equal(balances.has("IRC-C"), false);
assert.equal(balances.size, 2);

// Stock scope must also block direct XML and form-script paths, not only the matcher.
const quotaHotfix = app.slice(app.indexOf("function makeQuotaRows"), app.indexOf("function xmlEsc"));
assert.match(quotaHotfix, /positiveInventoryByIrc\(state\.virtualInventory\)/);
assert.match(quotaHotfix, /inventoryCapacity<=0/);
assert.match(quotaHotfix, /if\(forForm&&requestedForForm>availableForForm/);
assert.match(quotaHotfix, /used\[formIrcKey\]=/, "shared batch scripts must reserve IRC capacity");
assert.match(app, /state\.imed\.filter\(d=>inScope\.has\(norm\(d\.irc\)\)\)/, "bulk scripts must skip out-of-scope documents");
assert.match(app, /if\(v\.rows\.length&&!v\.errors\.length\)/, "invalid form-script documents must never be queued");
assert.match(app, /const blocked=!v\.rows\.length\|\|v\.errors\.length>0/, "direct script must block invalid amounts");

// The download center must expose real, connected XML/Excel/Console JS actions.
for(const id of ["downloadReadyExcel","downloadReadyXml","downloadReadyJs"])assert.match(html,new RegExp('id="'+id+'"'));
assert.match(app, /function downloadPositiveStockExcel\(/, "Excel export must build a real workbook");
assert.match(app, /XLSX\.writeFile\(book,'IMED_Positive_Inventory_Matches\.xlsx'\)/);
assert.match(app, /latestPositiveVirtualInventoryRows\(state\.virtualInventory\)/);
assert.match(app, /function downloadCenterMessage\(/);
assert.match(app, /\$\('downloadReadyExcel'\)\?\.addEventListener\('click',downloadPositiveStockExcel\)/);
assert.match(app, /\$\('downloadReadyXml'\)\?\.addEventListener\('click'/);
assert.match(app, /\$\('downloadReadyJs'\)\?\.addEventListener\('click'/);
assert.match(app, /buildAllDocumentsBatchScript\(\)/, "JavaScript export must use the safeguarded batch script");
assert.match(app, /IMED_XML_Rejected_Documents\.txt/, "XML export must report excluded documents");
assert.match(app, /return \{downloaded:false,error:err\.message\}/, "XML failures must not be presented as successful downloads");
// Positive inventory snapshots use the latest entry for each IRC and InventoryID.
const latestSource=app.slice(app.indexOf("function latestPositiveVirtualInventoryRows"),app.indexOf("async function calculateAllAutoMatches"));
const latestPositiveVirtualInventoryRows=runInNewContext(latestSource+"\nlatestPositiveVirtualInventoryRows",{
 norm:v=>String(v??"").trim(),num:v=>Number(v)||0,Map
});
const live=latestPositiveVirtualInventoryRows([
 {irc:"A",inventoryId:"1",remainingQty:100},
 {irc:"A",inventoryId:"1",remainingQty:0},
 {irc:"A",inventoryId:"2",remainingQty:4},
 {irc:"B",inventoryId:"3",remainingQty:-5},
]);
assert.deepEqual(Array.from(live.map(v=>v.inventoryId)),["2"]);


// Persian Coding search must operate over the complete workbook, not its first
// matching text row, and must reject incompatible categories and ambiguous names.
const receiverModule=await read("../assets/js/receiver-matcher.js");
const matcher=runInNewContext(receiverModule+"\nIMEDReceiverMatcher",{});
const receiverRows=[
 {code:"82081002",name:"ساسان",category:"آزمایشگاه",city:"تهران",status:"فعال"},
 {code:"11501790",name:"ساسان",category:"مرکزدرمانی",city:"تهران",status:"فعال"},
 {code:"99065020",name:"عرفان",category:"مرکزدرمانی",city:"تهران",status:"فعال"},
 {code:"56918426",name:"بیمارستان عرفان نیایش",category:"مرکزدرمانی",city:"تهران",status:"فعال"},
 {code:"37222343",name:"حضرت فاطمه الزهرا (س) مهریز",category:"مرکزدرمانی",city:"مهریز",status:"فعال"},
 {code:"31331421",name:"حضرت فاطمه زهرا (س)",category:"مرکزدرمانی",city:"نقده",status:"فعال"},
 {code:"10100001",name:"بیمارستان غدیر",category:"مرکزدرمانی",city:"تهران",status:"غیرفعال"},
 {code:"10100002",name:"بیمارستان غدیر",category:"مرکزدرمانی",city:"تهران",status:"فعال"},
 {code:"88990011",name:"صبا داروی میلاد",category:"توزیع کننده",city:"تهران",status:"فعال"}
];
const receiverIndex=matcher.buildIndex(receiverRows);
assert.equal(receiverIndex.entries.length,8,"inactive codes must not be considered candidates");
assert.equal(matcher.find(receiverIndex,"بیمارستان فوق تخصصی ساسان").code,"11501790");
assert.equal(matcher.find(receiverIndex,"بیمارستان عرفان").code,"56918426","user-approved hospital alias must win over the different short-name clinic");
assert.equal(matcher.find(receiverIndex,"عرفان").code,"","the short 'Erfan' name cannot silently inherit a hospital code");
assert.equal(matcher.find(receiverIndex,"بیمارستان غدیر").code,"10100002","inactive code must not be selected");
assert.equal(matcher.find(receiverIndex,"بیمارستان حضرت فاطمه زهرا در مهریز").candidates[0].record.code,"37222343");
assert.notEqual(matcher.find(receiverIndex,"صبا داروی میلاد (بیمارستان عرفان)").code,"56918426");
assert.equal(matcher.norm("  بيمارستانِ ساسان  "),matcher.norm("بیمارستان ساسان"),"Arabic/Persian variants must normalize");
const codingExcelRows=[
 ["Column1","Column2","Column3","Column4","Column5","Column6","Column7","Column8","Column9","Column10"],
 ["کد دریافت کننده","نام دریافت کننده","ماهیت دریافت کننده","استان دریافت کننده","شهر دریافت کننده","شناسه ملی مرکز","نام دانشگاه","شرح آخرین تغییرات","کد جایگزین","آخرین وضعیت اعتبار کد"],
 ["11501790","ساسان","مرکزدرمانی","تهران","تهران","","","","","فعال"]
];
assert.equal(matcher.fromSheet(codingExcelRows)[0].code,"11501790","header detection must support the real workbook layout");
assert.match(app,/state\.receiverMappings/,"confirmed mappings must persist in app state");
assert.match(app,/receiverCodingRun\(\)/);
assert.match(app,/receiverApplySafe\(\)/);
assert.match(app,/RECEIVER_CODING_CACHE_KEY/,"workbook should be cached locally");
assert.match(app,/approvedReceiverCodeForCustomer\(customerNameForCoding\)/,"XML must resolve the actual invoice customer");
assert.match(html,/id="receiverCodingFile"/);
assert.match(html,/receiver-matcher\.js\?v=0\.32\.3/);

console.log("IMED Manager contract checks passed.");
