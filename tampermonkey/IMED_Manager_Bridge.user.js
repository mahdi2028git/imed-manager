// ==UserScript==
// @name         IMED Manager — Invoice Bridge
// @namespace    https://github.com/mahdi2028git/imed-manager
// @version      0.31.2
// @description  Receives an invoice from IMED Manager and assists with IRC selection and form fields; never submits.
// @match        https://register.imed.ir/SaleDistribution/Dist/Dist_QuotaDistribution.aspx*
// @match        https://register.imed.ir/SaleDistribution/Dist/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function () {
  'use strict';
  const STORAGE_KEY = 'imed-manager-bridge-v1';
  const HASH_PREFIX = '#imed-manager-v1=';
  const MAX_LENGTH = 120000;
  function valid(rows) {
    return Array.isArray(rows) && rows.length > 0 && rows.length <= 300 &&
      rows.every(r => r && typeof r === 'object' &&
        /^[0-9]{1,30}$/.test(String(r.IRC ?? r.irc ?? '')) &&
        /^[0-9]{1,30}$/.test(String(r.InvoiceNo ?? '')) &&
        String(r.InvoiceDate ?? '').length <= 20 &&
        Number.isFinite(Number(r.Count)) && Number(r.Count) > 0 &&
        Number.isFinite(Number(r.RialPrice)) && Number(r.RialPrice) > 0 &&
        String(r.TypeID ?? '').length <= 8);
  }
  let rows = null;
  if (location.hash.startsWith(HASH_PREFIX)) {
    try {
      const encoded = location.hash.slice(HASH_PREFIX.length);
      if (encoded.length > MAX_LENGTH) throw Error('Payload too large');
      const incoming = JSON.parse(decodeURIComponent(encoded));
      if (!valid(incoming)) throw Error('Invalid invoice rows');
      rows = incoming;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      history.replaceState(history.state, '', location.pathname + location.search);
    } catch (err) {
      console.warn('IMED Manager bridge: rejected payload', err);
      alert('اطلاعات فاکتور قابل استفاده نیست؛ لطفاً دوباره از IMED Manager ارسال کن.');
      return;
    }
  } else {
    try { const stored = sessionStorage.getItem(STORAGE_KEY); if (stored) { const parsed = JSON.parse(stored); if (valid(parsed)) rows = parsed; } } catch {}
  }
  if (!rows) return;
  const panel = document.createElement('div');
  panel.dir = 'rtl';
  panel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483646;background:white;color:#182b40;border:1px solid #7e98bb;border-radius:12px;padding:12px;max-width:350px;box-shadow:0 4px 20px #0004;font:13px Tahoma,sans-serif;line-height:1.9';
  const title = document.createElement('strong');
  title.textContent = 'IMED Manager — فاکتور ' + String(rows[0].InvoiceNo);
  const note = document.createElement('p');
  note.textContent = rows.length + ' ردیف آماده است. برای پرکردن مرحلهٔ فعلی فرم، اجرا را بزن. ثبت نهایی خودکار نیست.';
  const run = document.createElement('button');
  run.textContent = 'اجرای کمک‌فرم';
  run.style.cssText = 'padding:5px 10px;margin:4px';
  const clear = document.createElement('button');
  clear.textContent = 'پاک‌کردن دادهٔ موقت';
  clear.style.cssText = 'padding:5px 10px;margin:4px';
  clear.onclick = () => { sessionStorage.removeItem(STORAGE_KEY); panel.remove(); };
  run.onclick = async () => { run.disabled = true; try { await fill(rows); } catch (err) { console.error(err); alert('اجرای کمک‌فرم با خطا روبه‌رو شد؛ ثبت نهایی را انجام نده و فرم را بررسی کن.'); } finally { run.disabled = false; } };
  panel.append(title, note, run, clear);
  document.body.appendChild(panel);

  async function fill(rows) {
    /* IMED multi-product helper — distribution BRIDGE
       Each run handles ONE invoice group (invoice number + date), selected in a prompt when needed.
       Phase 1: paste on IMED form; fills header and checks all matching IRC products.
       Then click "افزودن به سند توزیع" manually; after reload paste the same code and choose the SAME invoice group for Phase 2.
       Phase 2: after the page reloads and products appear in the lower grid, paste the SAME code again.
       It fills per-product sold quantities and attempts unit prices when the price column can be identified.
       It never clicks final submit. */
    (async()=>{
    'use strict';
    const ALL_ROWS=rows;
    let ROWS=ALL_ROWS;
    const FORM={date:'ctl00_MainContent_Date_InvoiceDate',invoice:'ctl00_MainContent_txt_InvoiceNo',radio:'ctl00_MainContent_rbtnCenterTypeLevel1',add:'ctl00_MainContent_Btn_Add',temp:'ctl00_MainContent_btn_Temp'};
    const norm=s=>String(s??'').toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s_\-،,().]/g,'').replace(/٫/g,'.');
    const digits=s=>String(s??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
    const ircOf=r=>digits(r.IRC??r.irc??'').replace(/\D/g,'');
    const unique=a=>[...new Set(a.filter(Boolean).map(String))];
    const groupKey=r=>digits(r.InvoiceNo??'').trim()+'||'+digits(r.InvoiceDate??'').trim();
    const groupMap=new Map();
    for(const r of ALL_ROWS){const k=groupKey(r);if(!groupMap.has(k))groupMap.set(k,[]);groupMap.get(k).push(r)}
    const GROUPS=[...groupMap.entries()].map(([key,rows])=>({key,rows,invoice:digits(rows[0].InvoiceNo??'').trim(),date:digits(rows[0].InvoiceDate??'').trim()}));
    if(GROUPS.length>1){const choices=GROUPS.map((g,i)=>(i+1)+') فاکتور '+(g.invoice||'—')+' | تاریخ '+(g.date||'—')+' | '+g.rows.length+' ردیف').join('\n');const answer=prompt('چند فاکتور در این سند وجود دارد. فقط یکی را برای این نوبت انتخاب کن؛ پس از بررسی و ثبت موقت، همین کد را دوباره اجرا کن و فاکتور بعدی را انتخاب کن.\n\n'+choices+'\n\nشماره فاکتور موردنظر را وارد کن:','1');if(answer===null){console.info('[IMED helper] انتخاب فاکتور لغو شد');return}const n=Number(digits(answer).trim());if(!Number.isInteger(n)||n<1||n>GROUPS.length){alert('شماره انتخابی معتبر نیست.');return}ROWS=GROUPS[n-1].rows;}
    const ircs=unique(ROWS.map(ircOf));
    const invoices=unique(ROWS.map(r=>digits(r.InvoiceNo??'').trim()));
    const dates=unique(ROWS.map(r=>digits(r.InvoiceDate??'').trim()));
    const types=unique(ROWS.map(r=>String(r.TypeID??'').trim()));
    const log=(...x)=>console.log('[IMED helper]',...x);
    function setValue(el,v){if(!el)return false;const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(el,String(v??''));else el.value=String(v??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:' ',code:'Space'}));el.dispatchEvent(new Event('change',{bubbles:true}));return true}
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    function exactCellHasIrc(tr,irc){return [...tr.querySelectorAll('td')].some(td=>digits(td.textContent).replace(/\D/g,'')===irc)}
    function setRadio(type){const el=document.querySelector('input[name="ctl00$MainContent$rbtnCenterTypeLevel1"][value="'+CSS.escape(type)+'"]');if(!el)return false;el.click();return true}
    function makePanel(message){let p=document.getElementById('imedMultiHelperPanel');if(!p){p=document.createElement('div');p.id='imedMultiHelperPanel';p.dir='rtl';p.style.cssText='position:fixed;z-index:2147483647;top:14px;right:14px;width:340px;max-width:calc(100vw - 36px);background:#fff;color:#172b43;border:1px solid #8ca6c4;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:12px;font:13px Tahoma,sans-serif;line-height:1.8';document.body.appendChild(p)}p.innerHTML='<b>IMED — ثبت چندکالایی</b><div style="margin:8px 0">'+message+'</div><button id="imedMultiClose" style="padding:6px 12px">بستن</button>';p.querySelector('#imedMultiClose').onclick=()=>p.remove()}
    if(!ROWS.length){makePanel('هیچ ردیف تخصیصی در کد وجود ندارد.');return}
    if(invoices.length>1||dates.length>1){makePanel('این سند شامل بیش از یک شماره فاکتور یا تاریخ است. چون سربرگ ایمد فقط یک شماره و تاریخ دارد، اجرای خودکار متوقف شد. فاکتورها را جداگانه به سندهای مستقل تقسیم کنید.');console.error('Mixed invoice header values',invoices,dates);return}
    const validTypes=['1','2','4','5','6','9','15','17','18','19','21'];
    if(!ircs.length||ircs.some(x=>!/^\d+$/.test(x))){makePanel('کد IRC معتبر برای همه ردیف‌ها موجود نیست؛ هیچ تغییری در فرم انجام نشد.');return}
    if(invoices.length!==1||!invoices[0]||dates.length!==1||!dates[0]){makePanel('شماره فاکتور و تاریخ باید برای این گروه مشخص و یکتا باشند؛ هیچ تغییری در فرم انجام نشد.');return}
    if(types.length!==1||!validTypes.includes(types[0])){makePanel('TypeID معتبر و یکتا در داده‌های این گروه پیدا نشد. نوع گیرنده/توزیع را در برنامه اصلاح کن؛ هیچ تغییری در فرم انجام نشد.');console.error('Invalid TypeID:',types);return}
    if(ROWS.some(r=>!Number.isFinite(Number(r.Count))||Number(r.Count)<=0||!Number.isFinite(Number(r.RialPrice))||Number(r.RialPrice)<=0)){makePanel('تعداد یا فی قیمت در یک یا چند ردیف معتبر نیست. داده‌ها را در برنامه اصلاح کن؛ هیچ تغییری در فرم انجام نشد.');return}
    const date=document.getElementById(FORM.date),invoice=document.getElementById(FORM.invoice);
    if(!date||!invoice){makePanel('فیلد تاریخ یا شماره فاکتور در فرم پیدا نشد؛ ساختار صفحه ممکن است تغییر کرده باشد. هیچ تغییری انجام نشد.');return}
    const radioElement=document.querySelector('input[name="ctl00$MainContent$rbtnCenterTypeLevel1"][value="'+CSS.escape(types[0])+'"]');
    if(!radioElement){makePanel('گزینه TypeID '+types[0]+' در فرم پیدا نشد؛ هیچ تغییری انجام نشد.');return}
    setValue(date,dates[0]);
    setValue(invoice,invoices[0]);
    const radioOk=setRadio(types[0]);
    const lowerQty=[...document.querySelectorAll('input[id*="GV_transfer"][id$="txt_comment"]')];
    if(lowerQty.length){
     // Phase 2: product rows are already in the lower transfer grid.
     const grouped=new Map();
     for(const r of ROWS){const k=ircOf(r);if(!k)continue;const old=grouped.get(k)||{irc:k,qty:0,prices:[]};old.qty+=Number(r.Count||0);old.prices.push(Number(r.RialPrice||0));grouped.set(k,old)}
     const report=[];
     for(const [irc,rec] of grouped){
       const tr=lowerQty.map(q=>q.closest('tr')).find(t=>t&&exactCellHasIrc(t,irc));
       if(!tr){report.push('IRC '+irc+': ردیف پایین پیدا نشد');continue}
       const q=tr.querySelector('input[id*="txt_comment"]');if(q)setValue(q,rec.qty);
       let priceDone=false;
       const priceVals=unique(rec.prices.map(x=>String(x)));
       if(priceVals.length===1){
         const table=tr.closest('table');const cells=[...tr.children].filter(x=>x.matches('td,th'));
         let priceIndex=-1;
         if(table){const headers=[...table.querySelectorAll('tr')].filter(x=>x.querySelector('th')).flatMap(x=>[...x.children].filter(c=>c.matches('th,td')));priceIndex=headers.findIndex(c=>norm(c.textContent).includes(norm('فی قیمت'))||norm(c.textContent).includes(norm('فی')));}
         if(priceIndex>=0&&cells[priceIndex]){const inp=cells[priceIndex].querySelector('input:not([type=hidden])');if(inp){setValue(inp,priceVals[0]);priceDone=true}}
       }
       report.push('IRC '+irc+': تعداد '+rec.qty+(priceDone?'، فی قیمت وارد شد':priceVals.length>1?'، چند فی قیمت متفاوت؛ فی را دستی بررسی کن':'، فی قیمت پیدا/وارد نشد؛ دستی کنترل کن'));
     }
     makePanel('مرحله دوم فاکتور '+(invoices[0]||'—')+' انجام شد. تعدادها در ردیف‌های پایین وارد شدند. '+report.join(' | ')+'<br><b>اکنون ذخیره موقت را دستی بزنید و نتیجه را کنترل کنید. صدور نهایی خودکار نیست.</b>');
     log('Phase 2 report',report);return;
    }
    // Phase 1: exact IRC field, exactly ONE trailing space, then explicitly
    // click the page's search button before reading the refreshed product grid.
    const checked=[],missing=[];
    const ircInput=document.getElementById('ctl00_MainContent_txt_IRC');
    function findIrcSearchButton(input){
     const isSearchLabel=el=>/جست.?وجو|جستجو|search|اعمال فیلتر/i.test(String(el.innerText||el.value||el.getAttribute('title')||el.getAttribute('aria-label')||'').replace(/s+/g,' ').trim());
     let scope=input?.closest('tr, fieldset, .form-group, .row, table, form')||input?.parentElement?.parentElement||document;
     for(let depth=0;scope&&depth<5;depth++,scope=scope.parentElement){
       const candidates=[...scope.querySelectorAll('button,input[type="button"],input[type="submit"],a')];
       const found=candidates.find(el=>isSearchLabel(el)&&!el.disabled);
       if(found)return found;
     }
     return [...document.querySelectorAll('button,input[type="button"],input[type="submit"],a')].find(el=>isSearchLabel(el)&&!el.disabled)||null;
    }
    for(const irc of ircs){
     if(!ircInput){missing.push(irc+' (فیلد جست‌وجوی IRC با ID دقیق پیدا نشد)');continue}
     setValue(ircInput,irc+' ');
     ircInput.focus();
     await wait(150);
     const searchButton=findIrcSearchButton(ircInput);
     if(!searchButton){missing.push(irc+' (دکمه جست‌وجو پیدا نشد)');continue}
     searchButton.click();
     await wait(500);
     let trs=[];
     const deadline=Date.now()+6000;
     do{
       trs=[...document.querySelectorAll('tr')].filter(tr=>tr.querySelector('input[type="checkbox"][id*="GV_IRC"][id$="CHBox"]')&&exactCellHasIrc(tr,irc));
       if(trs.length)break;
       await wait(300);
     }while(Date.now()<deadline);
     if(trs.length!==1){missing.push(irc+' ('+trs.length+' ردیف پس از کلیک جست‌وجو پیدا شد)');continue}
     const cb=trs[0].querySelector('input[type="checkbox"][id*="GV_IRC"][id$="CHBox"]');
     if(!cb.checked)cb.click();checked.push(irc);
    }
    const headerOk=!!date&&!!invoice&&!!radioOk;
    const msg='مرحله اول: '+checked.length+' کالا از '+ircs.length+' IRC انتخاب شد. '+(missing.length?'موارد پیدا نشده/مبهم: '+missing.join('، '):'همه IRCها پیدا شدند.')+'<br>شماره فاکتور، تاریخ و TypeID وارد شدند: '+(headerOk?'بله':'خیر؛ سربرگ را بررسی کن')+'<br><b>اگر حتی یک IRC پیدا نشده یا TypeID درست نیست، افزودن را نزن. در غیر این صورت دکمه «افزودن به سند توزیع» را دستی بزنید. پس از بارگذاری مجدد صفحه، همین کد را دوباره اجرا کنید.</b>';
    makePanel(msg);log('Phase 1 checked IRCs',checked,'missing',missing,'headerOk',headerOk);
    })();
  }
})();
