// Isolated server-side matcher. It writes suggestions only; it never writes match_allocations.
const latin = s => String(s ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const num = v => { const n = Number(latin(v).replace(/[٬,\s]/g,"").replace(/[٫]/g,".")); return Number.isFinite(n) ? n : 0; };
const norm = s => latin(String(s ?? "").toLowerCase()).replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[\u200c\s\-_/،,().]/g,"").trim();
const tokens = value => {
 let raw=String(value||"").toLowerCase().replace(/[يى]/g,"ی").replace(/ك/g,"ک");
 raw=raw.replace(/ویتال ?تک|ویتالکت|ويتالكت|vital ?tec|vitaltec/g," vitaltec ")
 .replace(/ساکشن|ساكشن|ساکشن/g," suction ").replace(/کتتر|کاتتر|کاتر/g," catheter ")
 .replace(/تراکئوستومی|تراکستومی|تراکئوستومی/g," tracheostomy ").replace(/لوله\s*تراشه/g," et tube ");
 const stop=new Set(["عدد","سایز","size","مدل","کالا","محصول","دستگاه","سیستم","بسته","مجموعه","with","for","and","the"]);
 return [...new Set(raw.replace(/[^\u0600-\u06ffa-z0-9]+/g," ").split(/\s+/).map(x=>x.trim()).filter(x=>x.length>1&&!stop.has(x)))];
};
const similarity=(a,b)=>{const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;if(x.includes(y)||y.includes(x))return .96;const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let c=0;A.forEach(t=>{if(B.has(t))c++});return Math.max(2*c/(A.size+B.size),c/Math.max(1,Math.min(A.size,B.size))*.88)};
const month=v=>{const x=latin(String(v||"")).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);if(!x)return null;const y=+x[1],m=+x[2];return m>=1&&m<=12?y*12+m:null};
const dateValue=v=>{const a=(latin(String(v||"")).match(/\d+/g)||[]).map(Number);return a.length>=3?a[0]*10000+a[1]*100+a[2]:0};
const grams=value=>{const z=norm(value).replace(/[^\u0600-\u06ffa-z0-9]/g,""),out=new Set();for(const n of [2,3])for(let i=0;i<=z.length-n;i++)out.add(z.slice(i,i+n));return out};
function descriptors(d, inventory, refs) {
 const di=norm(d.irc),dp=norm(d.product);let rows=di?inventory.filter(v=>norm(v.irc)===di):[];
 if(!rows.length&&dp) rows=inventory.filter(v=>{const vp=norm(v.persianName||v.product);if(!vp)return false;const A=new Set(tokens(d.product)),B=new Set(tokens(v.persianName||v.product));let n=0;A.forEach(t=>{if(B.has(t))n++});return similarity(dp,vp)>=.38||(n>=2&&n/Math.max(1,Math.min(A.size,B.size))>=.5)});
 if(!rows.length){const rr=refs.filter(r=>norm(r.distributionNo)===norm(d.distributionNo));rows=rr.map(r=>({persianName:r.imedProduct||d.product,persianDistinction:r.distinction||""}))}
 const fields=["persianDistinction","persianName","product","model","mainGroup","subGroup","legalCompany","manufacturerCountry","mainSupplier"],values=[];
 rows.forEach(v=>fields.forEach(k=>{const z=String(v[k]||"").trim();if(z&&!values.includes(z))values.push(z)}));
 const allTerms=[...new Set(values.flatMap(tokens))];return {rows,values,allTerms,termSet:new Set(allTerms)};
}
function distinctive(name,d) {
 if(!d.values.length)return {score:0,matched:[],count:0,mismatch:false,sizeMatch:false};
 const target=tokens(name),matched=target.filter(t=>d.termSet.has(t)),ratio=d.allTerms.length?matched.length/d.allTerms.length:0,targetRatio=target.length?matched.length/target.length:0;
 const src=String(name||"").toLowerCase().replace(/[يى]/g,"ی").replace(/ك/g,"ک"),desc=d.values.join(" ").toLowerCase().replace(/[يى]/g,"ی").replace(/ك/g,"ک");
 const rx=/(?:سایز|size)\s*[:：-]?\s*(\d+(?:\.\d+)?)/g, sizes=t=>[...t.matchAll(rx)].map(m=>m[1]),ds=sizes(desc),ss=sizes(src),sizeMatch=ds.length>0&&ss.length>0&&ds.some(x=>ss.includes(x)),mismatch=ds.length>0&&ss.length>0&&!sizeMatch;
 let score=Math.min(1,Math.max(ratio,targetRatio*.9));if(sizeMatch)score=Math.min(1,score+.22);if(mismatch)score=Math.max(0,score-.55);if(matched.length>=2&&!mismatch)score=Math.max(score,.42);
 return {score,matched,count:matched.length,mismatch,sizeMatch};
}
function signals(d,s,free,desc) {
 const di=norm(d.irc),si=norm(s.irc),ircMatch=!!di&&!!si&&di===si,ircConflict=!!di&&!!si&&di!==si,nameScore=similarity(d.product,s.product),exactName=!!norm(d.product)&&norm(d.product)===norm(s.product),dist=distinctive(s.product,desc);
 const dm=month(d.distributionDate),sm=month(s.invoiceDate),dateGap=dm!==null&&sm!==null?sm-dm:null,dateValid=dm===null||sm===null||sm>=dm,dateKnown=dm!==null&&sm!==null;
 const qty=num(d.quantity),qtyExact=qty>0&&Math.abs(free-qty)<.00001,qtyCanCover=qty>0&&free>=qty,customerScore=similarity(d.receiver,s.customer);
 let score=0,notes=[];if(ircMatch){score+=120;notes.push("IRC دقیق")}if(ircConflict){score-=18;notes.push("IRC متفاوت؛ کنترل شود")}
 if(exactName){score+=65;notes.push("نام کالا دقیق")}else if(nameScore>=.5){score+=Math.round(nameScore*60);notes.push("شباهت نام "+Math.round(nameScore*100)+"٪")}
 if(dist.count){score+=Math.round(dist.score*85);notes.push("وجه افتراق فارسی: "+dist.matched.slice(0,6).join("، "))}
 if(qtyExact){score+=22;notes.push("مقدار دقیق")}else if(qtyCanCover){score+=12;notes.push("مانده فاکتور کافی")}else if(free>0){score+=4;notes.push("تخصیص جزئی")}
 if(dateValid&&dateKnown){score+=Math.max(0,15-Math.min(15,Math.abs(dateGap)));notes.push(dateGap===0?"همان ماه":"ماه‌های بعد")}else if(!dateKnown){score+=2;notes.push("تاریخ ناقص")}
 if(customerScore>=.7){score+=8;notes.push("شباهت مشتری و دریافت‌کننده")}if(!free||!dateValid)score=-999;
 if(dist.sizeMatch)notes.push("سایز فنی دقیق");if(dist.mismatch)notes.push("⚠ سایز وجه افتراق مغایر");
 const hasEvidence=nameScore>=.52||dist.score>=.35,plausible=ircMatch||hasEvidence||nameScore>=.25||dist.score>=.15;
 return {score,notes,ircConflict,dateGap,eligible:!!free&&dateValid&&plausible};
}
function refMatch(d,s,refs) {
 for(const r of refs.filter(x=>norm(x.distributionNo)===norm(d.distributionNo))){
  if(!norm(s.invoiceNo)||norm(s.invoiceNo)!==norm(r.invoiceNo))continue;
  const rp=norm(r.actualProduct),prod=norm(s.product),rc=norm(r.actualCustomer),cust=norm(s.customer),day=dateValue(s.invoiceDate);
  if(!rp||!prod||(rp!==prod&&!(rp.length>24&&prod.length>24&&(rp.includes(prod)||prod.includes(rp)))))continue;
  if(rc&&cust&&rc!==cust)continue;const rd=dateValue(r.actualDate);if(day&&rd&&day!==rd)continue;
  const qOk=num(r.actualQty)<=0||Math.abs(num(s.quantity)-num(r.actualQty))<.00001;
  if(["تطبیق دقیق","تطبیق کالا/مشتری/فی","تطبیق کالا/مشتری/تعداد"].includes(r.status))return {kind:"positive",exact:r.status==="تطبیق دقیق"&&qOk&&cust===rc&&day===rd,status:r.status};
  if(r.status==="فاکتور/تاریخ پیدا شد؛ وجه افتراق نامنطبق")return {kind:"rejected"};
 }
 return null;
}
function allocationTotals(allocations){const bySource=new Map(),byDoc=new Map();for(const list of Object.values(allocations||{}))for(const a of list||[]){const q=num(a.allocatedQty);const sid=String(a.sourceId);bySource.set(sid,(bySource.get(sid)||0)+q)}return bySource}
export async function processBackgroundMatch(db, jobId, queue) {
 const job=await db.prepare("SELECT * FROM background_match_jobs WHERE id=?").bind(jobId).first();if(!job||job.status!=="running")return;
 const input=JSON.parse(job.input_json), docs=[...(input.imed||[])].sort((a,b)=>String(a.distributionDate||"").localeCompare(String(b.distributionDate||""))), sepidar=input.sepidar||[], inventory=input.virtualInventory||[], refs=input.references||[];
 const allocations=input.allocations||{},used=allocationTotals(allocations),free=new Map(sepidar.map(s=>[String(s.id),Math.max(0,num(s.quantity)-(used.get(String(s.id))||0))]));
 let cursor=Number(job.cursor||0);if(job.state_json){const saved=JSON.parse(job.state_json);for(const [k,v] of saved.freeById||[])free.set(k,num(v))}
 if(cursor>=docs.length){await db.prepare("UPDATE background_match_jobs SET status='completed',percent=100,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(jobId).run();return}
 const d=docs[cursor],already=(allocations[String(d.id)]||[]).reduce((n,a)=>n+num(a.allocatedQty),0),target=Math.max(0,num(d.quantity)),need=Math.max(0,target-already),desc=descriptors(d,inventory,refs);
 const candidates=new Map(),add=(s)=>candidates.set(String(s.id),s),di=norm(d.irc),terms=new Set([...tokens(d.product),...desc.allTerms]);
 for(const s of sepidar){if(di&&norm(s.irc)===di)add(s);if(tokens(s.product).some(t=>terms.has(t)))add(s);if([...grams(s.product)].some(g=>grams([d.product,...desc.values].join(" ")).has(g)))add(s)}
 if(candidates.size===0&&terms.size===0)for(const s of sepidar)add(s);\n for(const r of refs.filter(x=>norm(x.distributionNo)===norm(d.distributionNo)))for(const s of sepidar)if(norm(s.invoiceNo)===norm(r.invoiceNo))add(s);
 const pool=[];for(const s of candidates.values()){const f=free.get(String(s.id))||0;if(f<=0)continue;const ref=refMatch(d,s,refs);if(ref?.kind==="rejected")continue;const sig=signals(d,s,f,desc);if(ref?.kind==="positive"){sig.eligible=true;sig.score+=ref.exact?220:130;sig.notes.push(ref.exact?"تأیید دقیق در جدول مرجع":"تأیید در جدول مرجع")}if(sig.eligible&&sig.score>=20)pool.push({s,free:f,...sig})}
 pool.sort((a,b)=>b.score-a.score||(a.dateGap??999)-(b.dateGap??999));
 let left=need,planned=[];for(const c of pool){if(left<=0)break;const q=Math.min(left,c.free);if(q>0){planned.push({sourceId:String(c.s.id),q,score:c.score,signals:c.notes,ircConflict:!!c.ircConflict});free.set(String(c.s.id),Math.max(0,c.free-q));left-=q}}
 const result={distributionId:String(d.id),distributionNo:d.distributionNo||"",already,target,got:planned.reduce((n,p)=>n+p.q,0),left:Math.max(0,left),status:already+planned.reduce((n,p)=>n+p.q,0)>=target?"کامل":planned.length?"ناقص":already>0?"دارای تخصیص قبلی":"بدون تطبیق",planned};
 await db.prepare("INSERT INTO background_match_results (job_id,doc_index,result_json) VALUES (?,?,?) ON CONFLICT(job_id,doc_index) DO UPDATE SET result_json=excluded.result_json").bind(jobId,cursor,JSON.stringify(result)).run();
 cursor++;const percent=Math.round(cursor/Math.max(1,docs.length)*100),state=JSON.stringify({freeById:[...free.entries()]});
 await db.prepare("UPDATE background_match_jobs SET cursor=?,percent=?,state_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(cursor,percent,state,jobId).run();
 if(cursor>=docs.length)await db.prepare("UPDATE background_match_jobs SET status='completed',percent=100,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(jobId).run();
 else await queue.send({jobId});
}
