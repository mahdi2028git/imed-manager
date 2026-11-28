// IMED background matching: read-only suggestions, never registers sales or changes stock.
// Scheduled runs require server-side D1 data in products, invoices, invoice items and distributions.
const normalize = v => String(v ?? "").normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[\u064B-\u065F\u200C]/g," ").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim().toLowerCase();
const words = v => new Set(normalize(v).split(" ").filter(x=>x.length>1 && !["شرکت","بیمارستان","مرکز","درمان","تجهیزات","پزشکی","سهامی"].includes(x)));
const score = (a,b) => {const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let common=0;for(const w of A)if(B.has(w))common++;return common/Math.max(A.size,B.size)};
const json = (v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8"}});
async function run(env) {
  if(!env.DB)throw Error("D1 binding DB is required");
  // The live D1 business tables are empty while the actual app data is stored in
  // app_state_uploads. Never report zero matches as a successful completed run.
  const counts = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM sepidar_invoice_items) AS items, (SELECT COUNT(*) FROM imed_distributions) AS distributions, (SELECT COUNT(*) FROM app_state_meta) AS snapshots").first();
  if (!Number(counts?.items) || !Number(counts?.distributions)) {
    throw new Error("Background matching paused: business tables have no rows; " + Number(counts?.snapshots || 0) + " snapshot(s) require a validated importer");
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS background_match_suggestions (item_id INTEGER PRIMARY KEY, invoice_no TEXT, irc TEXT, inventory_id TEXT, receiver_code TEXT, confidence REAL NOT NULL DEFAULT 0, status TEXT NOT NULL, reason TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const invoices=await env.DB.prepare("SELECT i.id AS item_id, i.item_name, i.product_id, s.invoice_no, s.customer_id, p.irc AS product_irc, c.name AS customer_name, c.customer_code AS customer_code FROM sepidar_invoice_items i JOIN sepidar_invoices s ON s.id=i.invoice_id LEFT JOIN products p ON p.id=i.product_id LEFT JOIN customers c ON c.id=s.customer_id ORDER BY i.id").all();
  const stocks=await env.DB.prepare("SELECT d.id, d.product_id, d.remaining_quantity, d.raw_json, p.irc, p.name FROM imed_distributions d LEFT JOIN products p ON p.id=d.product_id").all();
  const customers=await env.DB.prepare("SELECT customer_code, name FROM customers WHERE customer_code IS NOT NULL AND TRIM(customer_code) <> ''").all();
  let processed=0,review=0,matched=0;
  for(const row of invoices.results||[]) {
    const irc=String(row.product_irc||"").trim();
    const candidates=(stocks.results||[]).filter(s=>irc && String(s.irc||"").trim()===irc && score(row.item_name,s.name)>=0.35).sort((a,b)=>score(row.item_name,b.name)-score(row.item_name,a.name));
    const receiver=(customers.results||[]).map(c=>({...c,match:score(row.customer_name,c.name)})).filter(c=>c.match>=0.85).sort((a,b)=>b.match-a.match)[0];
    // Distribution row ID is not necessarily IMED InventoryID. Extract only an explicit original field.
    let inventoryId="";
    if(candidates.length){try {const raw=JSON.parse(candidates[0].raw_json||"{}");inventoryId=String(raw.InventoryID??raw.inventoryId??raw.inventory_id??"").trim()}catch{}}
    const receiverCode=receiver?.customer_code?String(receiver.customer_code).trim():"";
    const status=irc&&inventoryId&&receiverCode?"candidate":"review";
    const reason=[!irc&&"IRC missing",!candidates.length&&"No verified product/IRC match",!inventoryId&&"Original InventoryID unavailable",!receiverCode&&"Receiver code not verified"].filter(Boolean).join("; ")||"Suggested only; requires approval";
    await env.DB.prepare("INSERT INTO background_match_suggestions(item_id,invoice_no,irc,inventory_id,receiver_code,confidence,status,reason,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(item_id) DO UPDATE SET invoice_no=excluded.invoice_no,irc=excluded.irc,inventory_id=excluded.inventory_id,receiver_code=excluded.receiver_code,confidence=excluded.confidence,status=excluded.status,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP").bind(row.item_id,String(row.invoice_no||""),irc,inventoryId,receiverCode,Math.min(candidates.length?score(row.item_name,candidates[0].name):0,receiver?.match||0),status,reason).run();
    processed++;if(status==="review")review++;else matched++;
  }
  return {processed,matched,review,at:new Date().toISOString()};
}
export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(run(env).catch(e=>console.error("background match failed",e)))},
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true,service:"imed-background-matcher"});
    return json({error:"Not found"},404);
  }
};
