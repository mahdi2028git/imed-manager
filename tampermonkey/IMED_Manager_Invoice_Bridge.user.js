// ==UserScript==
// @name         IMED Manager - Sepidar to IMED bridge
// @namespace    https://github.com/mahdi2028git/imed-manager
// @version      0.1.0
// @description  Transfer a selected invoice to IMED, search IRCs across postbacks and prepare draft distribution. Never issue final document.
// @match        https://mahdi2028git.github.io/imed-manager/*
// @match        https://register.imed.ir/SaleDistribution/Dist/Dist_QuotaDistribution.aspx*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  const KEY = 'imed-manager:invoice-bridge-v1';
  const MESSAGE = 'imed-manager:invoice-bridge-v1';
  const ACK = 'imed-manager:invoice-bridge-ack-v1';
  const MAX_AGE = 30 * 60 * 1000;
  const FORM = {
    irc: 'ctl00_MainContent_txt_IRC',
    date: 'ctl00_MainContent_Date_InvoiceDate',
    invoice: 'ctl00_MainContent_txt_InvoiceNo',
    add: 'ctl00_MainContent_Btn_Add',
    temporary: 'ctl00_MainContent_btn_Temp',
    typeName: 'ctl00$MainContent$rbtnCenterTypeLevel1'
  };
  const digits = x => String(x == null ? '' : x).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const justDigits = x => digits(x).replace(/\D/g, '');
  const norm = x => digits(x).toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c_:،\-()]/g, '');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const store = value => GM_setValue(KEY, value);
  const load = () => GM_getValue(KEY, null);
  const clear = () => GM_deleteValue(KEY);
  const unique = list => [...new Set(list)];
  function setValue(el, val) {
    if (!el) return false;
    const descriptor = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, String(val));
    else el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function validate(raw) {
    if (!raw || raw.version !== 1 || typeof raw.requestId !== 'string' || raw.requestId.length < 16 ||
        !Number.isFinite(raw.createdAt) || Date.now() - raw.createdAt > MAX_AGE ||
        raw.createdAt - Date.now() > 60_000 || !Array.isArray(raw.rows) ||
        !raw.rows.length || raw.rows.length > 250) throw Error('درخواست فاکتور معتبر نیست یا منقضی شده است.');
    const rows = raw.rows.map(r => ({
      IRC: justDigits(r.IRC),
      Count: Number(r.Count),
      RialPrice: Number(r.RialPrice),
      InvoiceNo: digits(r.InvoiceNo).trim(),
      InvoiceDate: digits(r.InvoiceDate).trim(),
      TypeID: String(r.TypeID || '2').trim(),
      InventoryID: justDigits(r.InventoryID || '')
    }));
    if (rows.some(r => !/^\d{8,25}$/.test(r.IRC) || !Number.isFinite(r.Count) ||
      r.Count <= 0 || !Number.isFinite(r.RialPrice) || r.RialPrice <= 0 ||
      !r.InvoiceNo || !r.InvoiceDate || !/^\d{1,2}$/.test(r.TypeID))) {
      throw Error('IRC، تعداد، فی یا شماره/تاریخ فاکتور معتبر نیست.');
    }
    if (unique(rows.map(r => r.InvoiceNo + '|' + r.InvoiceDate)).length !== 1 ||
        unique(rows.map(r => r.TypeID)).length !== 1) {
      throw Error('هر نوبت فقط یک فاکتور با تاریخ و TypeID واحد قابل ثبت است.');
    }
    return { ...raw, rows };
  }
  if (location.hostname === 'mahdi2028git.github.io') {
    window.addEventListener('message', event => {
      if (event.source !== window || event.origin !== location.origin ||
          !event.data || event.data.type !== MESSAGE) return;
      try {
        const job = validate(event.data.job);
        store({ job, phase: 'ready', selected: [], searchIndex: 0, lastIrc: '', error: '' });
        window.postMessage({ type: ACK, requestId: job.requestId, ok: true }, location.origin);
      } catch (err) {
        window.postMessage({ type: ACK, requestId: event.data.job?.requestId || '', ok: false, error: String(err.message || err) }, location.origin);
      }
    });
    return;
  }
  if (location.hostname !== 'register.imed.ir') return;
  let state = load();
  if (!state) return;
  try { state.job = validate(state.job); }
  catch (err) { clear(); console.warn('[IMED bridge]', err); return; }

  const el = (id) => document.getElementById(id);
  let busy = false;
  const panel = document.createElement('aside');
  panel.id = 'imed-manager-bridge-panel';
  panel.dir = 'rtl';
  panel.style.cssText = 'position:fixed;z-index:2147483647;right:12px;top:12px;max-width:350px;width:calc(100vw - 30px);padding:14px;border:2px solid #245c91;border-radius:10px;background:#fff;color:#172333;font:13px/1.9 Tahoma,Arial,sans-serif;box-shadow:0 8px 28px #0004;text-align:right;';
  panel.innerHTML = '<strong>IMED Manager — انتقال فاکتور سپیدار</strong><div id="imed-bridge-status"></div><button id="imed-bridge-next" type="button" style="padding:7px 12px;margin:5px;background:#1461ac;color:white;border:0;border-radius:6px;cursor:pointer">ادامه</button><button id="imed-bridge-cancel" type="button" style="padding:7px 10px;margin:5px;cursor:pointer">لغو</button><p style="color:#b02020;font-size:11px;margin:4px">صدور نهایی سند توزیع هرگز خودکار انجام نمی‌شود.</p>';
  document.body.appendChild(panel);
  const status = panel.querySelector('#imed-bridge-status');
  const next = panel.querySelector('#imed-bridge-next');
  function persist(phase, props = {}) { state = { ...state, ...props, phase }; store(state); }
  function show(message, action = 'ادامه', enabled = true) {
    status.textContent = 'فاکتور ' + state.job.rows[0].InvoiceNo + ' | ' + message;
    next.textContent = action;
    next.disabled = !enabled;
  }
  function fail(message) { persist('paused', { error: message }); show(message, 'تلاش مجدد پس از بررسی', true); }
  panel.querySelector('#imed-bridge-cancel').onclick = () => {
    if (!confirm('درخواست انتقال این فاکتور حذف شود؟ ردیف‌هایی که در IMED ذخیره شده‌اند حذف نخواهند شد.')) return;
    clear(); panel.remove();
  };
  function headerIndex(table, parts) {
    const headers = [...table.querySelectorAll('tr')].find(tr => tr.querySelector('th'));
    if (!headers) return -1;
    const cells = [...headers.children].filter(c => c.matches('th,td'));
    return cells.findIndex(cell => parts.some(word => norm(cell.textContent).includes(norm(word))));
  }
  function exactCell(tr, code) {
    return [...tr.querySelectorAll('td')].some(c => justDigits(c.textContent) === code);
  }
  function firstNumber(s) {
    const v = digits(s).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return v ? Number(v[0]) : NaN;
  }
  function gridRows(irc) {
    const results = [];
    for (const tr of document.querySelectorAll('tr')) {
      const checkbox = tr.querySelector('input[type=checkbox][id*="GV_IRC"][id$="CHBox"]');
      if (!checkbox || !exactCell(tr, irc)) continue;
      const table = tr.closest('table');
      if (!table) continue;
      const cells = [...tr.children].filter(c => c.matches('td,th'));
      const idCol = headerIndex(table, ['کد انبار مجازی', 'کدانبارمجازی', 'inventoryid']);
      const capCol = headerIndex(table, ['تعداد کل انبار مجازی', 'مانده انبار مجازی', 'تعداد باقی مانده', 'موجودی']);
      const inventoryId = idCol >= 0 ? justDigits(cells[idCol]?.textContent) : '';
      const capacity = capCol >= 0 ? firstNumber(cells[capCol]?.textContent) : NaN;
      results.push({ checkbox, inventoryId, capacity });
    }
    return results;
  }
  function searchButton() {
    const input = el(FORM.irc);
    if (!input) return null;
    const textIsSearch = e => /جست.?وجو|جستجو|search/i.test(String(e.textContent || e.value || e.title || ''));
    const candidates = [...document.querySelectorAll('button,input[type=submit],input[type=button],a')].filter(e => !e.disabled && textIsSearch(e));
    // Prefer an explicit search control near the IRC field, not an unrelated control.
    return candidates.find(e => e.closest('form') === input.closest('form')) || null;
  }
  function requestedIrcs() { return unique(state.job.rows.map(r => r.IRC)); }
  async function beginSearch() {
    const ircs = requestedIrcs();
    if (state.searchIndex >= ircs.length) { persist('lower'); return fillLower(); }
    const irc = ircs[state.searchIndex];
    const input = el(FORM.irc), button = searchButton();
    if (!input || !button) return fail('فیلد IRC یا دکمه جست‌وجو پیدا نشد؛ شناسه صفحه باید بررسی شود.');
    setValue(input, irc + ' ');
    persist('search-wait', { lastIrc: irc });
    show('در حال جست‌وجوی IRC ' + irc, 'در انتظار بارگذاری', false);
    button.click(); // May cause a full ASP.NET postback.
  }
  function allocate(irc) {
    const desired = state.job.rows.filter(r => r.IRC === irc);
    const candidates = gridRows(irc).filter(x => x.inventoryId && Number.isFinite(x.capacity) && x.capacity > 0);
    if (!candidates.length) throw Error('ردیف دارای شناسه انبار و موجودی معتبر برای IRC ' + irc + ' شناسایی نشد.');
    const used = new Map();
    const allocations = [];
    for (const request of desired) {
      let left = request.Count;
      const choices = candidates
        .filter(c => !request.InventoryID || request.InventoryID === c.inventoryId)
        .sort((a, b) => b.capacity - a.capacity || a.inventoryId.localeCompare(b.inventoryId));
      // An inventory row cannot represent two different unit prices at once.
      for (const c of choices) {
        if (left <= 0.000001) break;
        if (used.has(c.inventoryId)) continue;
        const qty = Math.min(left, c.capacity);
        if (qty <= 0) continue;
        allocations.push({ IRC: irc, InventoryID: c.inventoryId, Count: qty, RialPrice: request.RialPrice });
        used.set(c.inventoryId, qty);
        left -= qty;
      }
      if (left > 0.000001) throw Error('موجودی قابل شناسایی برای IRC ' + irc + ' به اندازه تعداد فاکتور نیست. کمبود: ' + left);
    }
    for (const a of allocations) {
      const row = candidates.find(c => c.inventoryId === a.InventoryID);
      if (!row) throw Error('کد انبار ' + a.InventoryID + ' پس از تطبیق پیدا نشد.');
      if (!row.checkbox.checked) row.checkbox.click();
    }
    return allocations;
  }
  function processResults() {
    const irc = state.lastIrc;
    try {
      if (justDigits(el(FORM.irc)?.value) !== irc) throw Error('پس از بارگذاری، فیلتر IRC با درخواست قبلی مطابقت ندارد.');
      const plan = allocate(irc);
      const add = el(FORM.add);
      if (!add) throw Error('دکمه «افزودن به سند توزیع» با شناسه شناخته‌شده پیدا نشد.');
      const selected = [...state.selected, ...plan];
      persist('add-wait', { selected });
      show(plan.length + ' ردیف انبار مجازی انتخاب شد؛ افزودن به سند', 'در انتظار بارگذاری', false);
      add.click();
    } catch (err) { fail(err.message || String(err)); }
  }
  function lowerRows() {
    const entries = [];
    for (const input of document.querySelectorAll('input[id*="GV_transfer"][id$="txt_comment"]')) {
      const tr = input.closest('tr');
      if (tr) entries.push({ tr, qtyInput: input });
    }
    return entries;
  }
  function priceInput(tr) {
    const table = tr.closest('table');
    const cells = [...tr.children].filter(c => c.matches('td,th'));
    const priceCol = table ? headerIndex(table, ['فی قیمت ریالی', 'فی قیمت', 'قیمت ریالی']) : -1;
    if (priceCol < 0 || !cells[priceCol]) return null;
    return cells[priceCol].querySelector('input:not([type=hidden])');
  }
  function fillLower() {
    const entries = lowerRows();
    if (!entries.length) return fail('جدول تعداد توزیع و فی ریالی پیدا نشد. اطلاعات فعلی را بررسی کن.');
    const matched = [];
    try {
      for (const a of state.selected) {
        const matches = entries.filter(({ tr }) => exactCell(tr, a.IRC) && exactCell(tr, a.InventoryID));
        if (matches.length !== 1) throw Error('ردیف پایین برای IRC ' + a.IRC + ' / انبار ' + a.InventoryID + ' یکتا نیست.');
        const entry = matches[0], price = priceInput(entry.tr);
        if (!price) throw Error('فیلد فی قیمت ریالی برای انبار ' + a.InventoryID + ' شناسایی نشد.');
        matched.push({ entry, a, price });
      }
      for (const { entry, a, price } of matched) {
        setValue(entry.qtyInput, a.Count);
        setValue(price, a.RialPrice);
      }
      persist('prepared');
      show('تعداد و فی ریالی ' + matched.length + ' ردیف وارد شد؛ شماره و تاریخ فاکتور را هم کنترل کن.', 'ذخیره موقت پس از کنترل', true);
    } catch (err) { fail(err.message || String(err)); }
  }
  function fillHeader() {
    const r = state.job.rows[0];
    const date = el(FORM.date), invoice = el(FORM.invoice);
    const radio = [...document.querySelectorAll('input[type=radio]')].find(x => x.name === FORM.typeName && x.value === r.TypeID);
    if (!date || !invoice || !radio) throw Error('شماره، تاریخ یا گزینه نوع توزیع در فرم پیدا نشد.');
    if (!radio.checked) {
      // A radio choice may trigger an ASP.NET postback, so persist before clicking.
      persist('header-wait');
      radio.click();
      show('نوع توزیع انتخاب شد؛ پس از بارگذاری شماره و تاریخ را بررسی کن.', 'ادامه ثبت موقت');
      return false;
    }
    setValue(date, r.InvoiceDate);
    setValue(invoice, r.InvoiceNo);
    if (digits(date.value).trim() !== r.InvoiceDate || digits(invoice.value).trim() !== r.InvoiceNo) throw Error('شماره یا تاریخ فاکتور در فرم ثبت نشد.');
    return true;
  }
  function saveTemporary() {
    try {
      if (!fillHeader()) return;
      const button = el(FORM.temporary);
      if (!button) throw Error('دکمه ذخیره موقت با شناسه فعلی پیدا نشد.');
      if (!confirm('شماره، تاریخ، TypeID، تعداد و فی را بررسی کردی؟ فقط «ذخیره موقت لیست کالا» زده شود؟')) return;
      persist('temp-wait');
      show('در حال ذخیره موقت؛ وضعیت نهایی را پس از بارگذاری کنترل کن.', 'در انتظار بارگذاری', false);
      button.click();
    } catch (err) { fail(err.message || String(err)); }
  }
  async function advance() {
    if (busy) return;
    busy = true; next.disabled = true;
    try {
      if (state.phase === 'ready') { persist('search-ready'); await beginSearch(); }
      else if (state.phase === 'search-ready') await beginSearch();
      else if (state.phase === 'search-wait') processResults();
      else if (state.phase === 'add-wait') {
        const current = lowerRows();
        if (!current.length || state.selected.some(a =>
          current.filter(({ tr }) => exactCell(tr, a.IRC) && exactCell(tr, a.InventoryID)).length !== 1)) {
          throw Error('همه کالاهای انتخاب‌شده هنوز در جدول سند دیده نمی‌شوند؛ افزودن موفق را قبل از ادامه بررسی کن.');
        }
        persist('search-ready', { searchIndex: state.searchIndex + 1 });
        await beginSearch();
      } else if (state.phase === 'lower') fillLower();
      else if (state.phase === 'prepared' || state.phase === 'header-wait') saveTemporary();
      else if (state.phase === 'temp-wait') {
        persist('saved-check');
        show('ذخیره موقت درخواست شد. موفقیت را در سایت IMED بررسی کن؛ صدور نهایی دستی است.', 'پایان', false);
      } else if (state.phase === 'paused') {
        const previous = state.lastIrc ? 'search-wait' : 'ready';
        persist(previous, { error: '' });
        if (previous === 'search-wait') processResults(); else await beginSearch();
      }
    } finally { busy = false; if (!['search-wait', 'add-wait', 'temp-wait', 'saved-check'].includes(state.phase)) next.disabled = false; }
  }
  next.onclick = () => advance().catch(err => fail(err.message || String(err)));
  if (state.phase === 'ready') show('اطلاعات منتقل شد. برای آغاز جست‌وجوی IRC کلیک کن.', 'شروع تکمیل فاکتور');
  else if (state.phase === 'search-wait') {
    show('صفحه پس از جست‌وجوی IRC بارگذاری شد؛ نتایج آماده بررسی هستند.', 'بررسی و انتخاب کد انبار');
  } else if (state.phase === 'add-wait') {
    show('افزودن کالا درخواست شده؛ بعد از کنترل وضعیت، به IRC بعدی برو.', 'IRC بعدی');
  } else if (state.phase === 'search-ready') show('آماده جست‌وجوی IRC بعدی', 'جست‌وجوی بعدی');
  else if (state.phase === 'lower') show('کالاها باید در جدول پایین دیده شوند.', 'ورود تعداد و فی');
  else if (state.phase === 'prepared' || state.phase === 'header-wait') show('فیلدها را قبل از ذخیره موقت کنترل کن.', 'ذخیره موقت پس از کنترل');
  else if (state.phase === 'temp-wait') show('درخواست ذخیره موقت ارسال شد؛ نتیجه سرور را بررسی کن.', 'تأیید مشاهده', true);
  else if (state.phase === 'paused') show(state.error || 'اتصال متوقف شد؛ نیاز به بررسی', 'تلاش مجدد');
  else show('برای ادامه، وضعیت سند را کنترل کن.', 'پایان', false);
})();