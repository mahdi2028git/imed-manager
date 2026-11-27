/* Receiver Coding Matcher v1 — local-only matching of the IMED receiver-coding workbook.
   Auto-apply only for exact/unique category-compatible matches. Fuzzy results
   remain review-only; no code is invented from a name or a substring.
*/
(function (root) {
  'use strict';
  const ARABIC_MARKS=/[\u064b-\u065f\u0670\u06d6-\u06ed]/g;
  const SIGNS=/\b(?:ع|س|ره|ص)\b/g;
  const PREFIX=/^(?:بیمارستان|بيمارستان|فوق تخصصی|فوقتخصصی|تخصصی|عمومی|مرکز آموزشی درمانی|مرکز درمانی|مرکز پزشکی|درمانگاه|کلینیک|کلينيک|مجتمع درمانی|مرکز|موسسه پزشکی|مؤسسه پزشکی|موسسه|پلی کلینیک|پلیکلینیک|درمانگاهی)\s+/;
  const REMOVE=new Set(['حضرت','جناب','عالی','شعبه','شماره','در','واقع','واقع در','واقع در شهر','شهر','استان','وابسته','به','آقای','خانم','دکتر']);
  const GENERIC=new Set(['بیمارستان','فوق','تخصصی','درمانگاه','مرکز','درمانی','حضرت','دکتر','شرکت','موسسه','کلینیک','مرکزدرمانی','پزشکی','س','ع','ره','شماره','واحد','آزمایشگاه','شهر','استان']);
  function norm(value){
    return String(value==null?'':value).normalize('NFKC').toLowerCase()
      .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/ۀ/g,'ه').replace(/ؤ/g,'و')
      .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(ARABIC_MARKS,'')
      .replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
      .replace(/\u200c|\u200d|\u200f|\u200e/g,' ')
      .replace(/الزهرا/g,'زهرا').replace(/اباد/g,'آباد').replace(/آباد/g,'اباد')
      .replace(/[^\u0600-\u06ff\w\s]/g,' ').replace(/\s+/g,' ').trim()
      .replace(SIGNS,'').replace(/\s+/g,' ').trim();
  }
  function typeOfName(value){
    const n=norm(value);
    if(/^(?:شرکت|صبا دارو|توزیع کننده|پخش )/.test(n))return 'distributor';
    if(/^(?:آزمایشگاه|لابراتوار)/.test(n))return 'lab';
    if(/^(?:داروخانه|داروخانه دکتر)/.test(n))return 'pharmacy';
    if(/^(?:دندانپزشک|دکتر|آقای|خانم)/.test(n))return 'person';
    if(/^(?:بیمارستان|مرکز درمانی|درمانگاه|مرکز جراحی|مرکز قلب|مرکز پزشکی|کلینیک|مجتمع درمانگاهی|فوق تخصصی)/.test(n))return 'medical';
    return 'unknown';
  }
  function typeOfCoding(value){
    const n=norm(value);
    if(n.includes('مرکزدرمانی')||n.includes('مرکز درمانی'))return 'medical';
    if(n.includes('آزمایشگاه'))return 'lab';
    if(n.includes('داروخانه'))return 'pharmacy';
    if(n.includes('توزیع'))return 'distributor';
    if(n.includes('دندانپزشک')||n.includes('پزشک')||n.includes('اصناف'))return 'person';
    return 'other';
  }
  function tokens(value){
    return norm(value).split(' ').filter(x=>x.length>1&&!GENERIC.has(x)&&!REMOVE.has(x));
  }
  function core(value){
    let n=norm(value);
    // Only strip structural institution prefixes, never remove distinguishing
    // words in the middle (e.g. نیایش, مهریز, مرکزی).
    let prev;
    do {prev=n;n=n.replace(PREFIX,'').trim()} while(prev!==n);
    n=n.replace(/^حضرت\s+/,'').replace(/\s+(?:س|ع|ره)$/,'').trim();
    return n||norm(value);
  }
  function compatible(sourceType,codingType){
    return sourceType==='unknown'||sourceType===codingType;
  }
  function codingRow(raw,rowNumber){
    const code=String(raw.code||raw.A||'').trim();
    const name=String(raw.name||raw.B||'').trim();
    const category=String(raw.category||raw.C||'').trim();
    const city=String(raw.city||raw.E||'').trim();
    const province=String(raw.province||raw.D||'').trim();
    const status=norm(raw.status||raw.J||'');
    return {code,name,category,city,province,status,
      active:status==='فعال',type:typeOfCoding(category),
      n:norm(name),c:core(name),terms:tokens(core(name)),
      row:Number(raw.row||rowNumber||0),nationalId:String(raw.nationalId||raw.F||'')};
  }
  function fromSheet(array){
    if(!Array.isArray(array))throw Error('ساختار اکسل Coding نامعتبر است');
    let h=-1,indices={};
    for(let i=0;i<Math.min(16,array.length);i++){
      const cells=(array[i]||[]).map(norm);
      const find=aliases=>cells.findIndex(c=>aliases.some(s=>c===s||c.includes(s)));
      const name=find(['نام دریافت کننده','نام دریافتکننده']);
      const code=find(['کد دریافت کننده','کد دریافتکننده']);
      if(name<0||code<0)continue;
      h=i;indices={name,code,category:find(['ماهیت دریافت کننده','ماهیت دریافتکننده']),
        city:find(['شهر دریافت کننده','شهر دریافتکننده']),province:find(['استان دریافت کننده','استان دریافتکننده']),
        status:find(['آخرین وضعیت اعتبار کد','وضعیت اعتبار کد']),nationalId:find(['شناسه ملی مرکز'])};
      break;
    }
    if(h<0)throw Error('ستون‌های کد دریافت‌کننده و نام دریافت‌کننده در اکسل پیدا نشد');
    const data=[];
    const cell=(a,i)=>i>=0?String(a[i]??'').trim():'';
    for(let i=h+1;i<array.length;i++){
      const row=array[i]||[],raw={name:cell(row,indices.name),code:cell(row,indices.code),
        category:cell(row,indices.category),city:cell(row,indices.city),
        province:cell(row,indices.province),status:cell(row,indices.status),
        nationalId:cell(row,indices.nationalId),row:i+1};
      if(/^\d{5,12}$/.test(raw.code)&&raw.name)data.push(raw);
    }
    return data;
  }
  function buildIndex(rawRows){
    const entries=[],byName=new Map(),byCore=new Map(),byTerm=new Map();
    const add=(map,key,id)=>{if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id)};
    for(let i=0;i<rawRows.length;i++){
      const e=codingRow(rawRows[i],i+1);
      if(!e.active||!e.code||!e.n)continue;
      const id=entries.length;entries.push(e);
      add(byName,e.n,id);add(byCore,e.c,id);
      for(const token of new Set(e.terms))add(byTerm,token,id);
    }
    return {entries,byName,byCore,byTerm,sourceRows:rawRows.length};
  }
  const USER_APPROVED={
    'بیمارستان عرفان':{code:'56918426',type:'medical'},
    'بیمارستان عرفان نیایش':{code:'56918426',type:'medical'},
    'بیمارستان فوق تخصصی ساسان':{code:'11501790',type:'medical'},
    'بیمارستان ساسان':{code:'11501790',type:'medical'}
  };
  function scoreCandidate(input,n,c,terms,expected,e){
    if(!compatible(expected,e.type))return null;
    const et=new Set(e.terms),src=new Set(terms);
    const inter=terms.filter(x=>et.has(x)).length;
    const overlap=src.size?inter/src.size:0;
    const denom=Math.max(1,new Set([...src,...et]).size);
    const jaccard=inter/denom;
    const exactName=e.n===n,exactCore=e.c===c;
    // A name similarity must have a distinctive shared token. Substring alone
    // is never enough for a code assignment.
    if(!exactName&&!exactCore&&!inter)return null;
    const starts=e.c.startsWith(c+' ')||c.startsWith(e.c+' ');
    let score=exactName?125:exactCore?107:Math.round(24+61*overlap+23*jaccard);
    if(starts)score+=8;
    if(expected!=='unknown'&&expected===e.type)score+=10;
    if(expected==='unknown')score-=9;
    const location=norm(e.city);
    const locationMentioned=!!location&&(n.includes(location)||terms.includes(location));
    if(locationMentioned)score+=20;
    // "مهریز" and similar explicit location hints should not be mistaken
    // for a different city's otherwise identical clinic.
    if(n.includes('مهریز')&&location&&!location.includes('مهریز'))score-=70;
    return {record:e,score,exactName,exactCore,locationMentioned,shared:inter};
  }
  function find(index,customer,options={}){
    const n=norm(customer),c=core(customer),expected=typeOfName(customer),ts=tokens(c);
    if(!n)return {status:'not_found',customer,code:'',candidates:[]};
    const approved=USER_APPROVED[n];
    if(approved){
      const entry=index.entries.find(e=>e.code===approved.code&&e.type===approved.type&&e.active);
      if(entry)return {status:'user_approved',customer,code:entry.code,type:entry.type,
        candidates:[{record:entry,score:200,reason:'تأیید مستقیم کاربر'}]};
      return {status:'review',customer,code:'',candidates:[],reason:'کد مورد تأیید کاربر در فایل فعال Coding پیدا نشد'};
    }
    const sourceIsIntermediary=expected==='distributor'&&/\bبیمارستان\b/.test(n);
    const pool=new Set([...(index.byName.get(n)||[]),...(index.byCore.get(c)||[])]);
    const rare=ts.map(t=>({term:t,hits:index.byTerm.get(t)||[]})).sort((a,b)=>a.hits.length-b.hits.length);
    // Adding rare-token hits avoids the "first occurrence" and workbook row-order bug.
    for(const item of rare.slice(0,4)){if(item.hits.length<=1500)for(const i of item.hits)pool.add(i)}
    const found=[];
    for(const id of pool){
      const e=index.entries[id];
      if(sourceIsIntermediary&&e.type!=='distributor')continue;
      const ranked=scoreCandidate(customer,n,c,ts,expected,e);
      if(ranked)found.push(ranked);
    }
    found.sort((a,b)=>b.score-a.score||Number(b.exactName)-Number(a.exactName)||a.record.code.localeCompare(b.record.code));
    const best=found[0],second=found[1],top=found.slice(0,8);
    if(!best||best.score<55)return {status:'not_found',customer,code:'',candidates:top};
    const margin=best.score-(second?.score||0);
    // Same shortened name across cities or multiple active codes is ambiguous.
    const repeatedBest=found.filter(x=>x.score>=best.score-8&&x.record.code!==best.record.code);
    const auto=expected!=='unknown'&&
      ((best.exactName&&margin>=18)||(best.exactCore&&margin>=20&&ts.length>=1))&&
      repeatedBest.length===0&&!sourceIsIntermediary;
    return {status:auto?'exact':'review',customer,code:auto?best.record.code:'',
      type:auto?best.record.type:'',candidates:top,margin,reason:auto?'تطبیق یکتای نام و ماهیت':'نیازمند بررسی بین کدهای مشابه'};
  }
  root.IMEDReceiverMatcher={norm,core,typeOfName,typeOfCoding,fromSheet,buildIndex,find,version:'1.0.0'};
  if(typeof module==='object'&&module.exports)module.exports=root.IMEDReceiverMatcher;
})(typeof globalThis!=='undefined'?globalThis:this);
