(function (root) {
  'use strict';

  // Data never leaves the browser here. Only files explicitly downloaded by the user are created.
  const XML_FIELDS = ['TypeID', 'IRC', 'Count', 'RialPrice', 'InvoiceNo', 'InvoiceDate', 'InventoryID', 'ReceiverCode', 'ReceiverName'];
  const xmlEscape = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const normalizedNumber = value => String(value == null ? '' : value)
    .replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
  const invoiceKey = row => normalizedNumber(row.invoiceNo ?? row.InvoiceNo) + '|' +
    normalizedNumber(row.invoiceDate ?? row.InvoiceDate);

  function quotaXml(rows) {
    if (!rows.length) return null;
    const quota = rows.map(row =>
      '  <Quota>\n' + XML_FIELDS.map(field => '    <' + field + '>' +
        xmlEscape(row[field]) + '</' + field + '>').join('\n') + '\n  </Quota>'
    ).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<QuotaList>\n' + quota + '\n</QuotaList>\n';
  }

  function consoleCode(sourceInvoices, jobs) {
    // Embed a snapshot of ALL source Sepidar records, including those not yet matched.
    // No invoices or credentials are fetched from GitHub or a remote API at execution time.
    const payload = JSON.stringify({ sourceInvoices, jobs })
      .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return [
      '/* IMED Manager: offline export from the local browser database.',
      '   Contains ALL Sepidar source rows; only fully checked jobs can fill the IMED form.',
      '   Log in to register.imed.ir first. No final submit is automated. */',
      '(function () {',
      '  "use strict";',
      '  const DATA = ' + payload + ';',
      '  window.IMEDOfflineData = DATA;',
      '  console.info("IMED Manager: Sepidar rows", DATA.sourceInvoices.length, "form-ready documents", DATA.jobs.length);',
      '  if (location.hostname !== "register.imed.ir") {',
      '    alert("این کد را فقط پس از ورود، در صفحه register.imed.ir اجرا کن. اطلاعات برای بررسی در IMEDOfflineData آماده است.");',
      '    return;',
      '  }',
      '  if (!DATA.jobs.length) { alert("هیچ فاکتور آمادهٔ کمک‌فرم وجود ندارد؛ گزارش مشکلات را در برنامه بررسی کن."); return; }',
      '  const first = DATA.jobs.slice(0, 20).map((j, i) => (i + 1) + ") " + j.label).join("\\n");',
      '  const raw = prompt("شماره فاکتور سپیدار یا شماره سند IMED را وارد کن. برای انتخاب از فهرست، شماره ردیف را بزن.\\n\\n" + first + (DATA.jobs.length > 20 ? "\\n... و " + (DATA.jobs.length - 20) + " سند دیگر" : ""), "");',
      '  if (raw === null) return;',
      '  const term = String(raw).trim();',
      '  if (!term) { alert("شماره فاکتور یا سند را وارد کن."); return; }',
      '  let matches = DATA.jobs.filter(j => j.invoiceNos.includes(term) || j.distributionNo === term);',
      '  if (!matches.length && /^\\d+$/.test(term) && Number(term) >= 1 && Number(term) <= DATA.jobs.length) matches = [DATA.jobs[Number(term) - 1]];',
      '  if (!matches.length) { alert("سند آماده‌ای برای این شماره پیدا نشد. گزارش خروجی را بررسی کن."); return; }',
      '  if (matches.length > 1) {',
      '    const answer = prompt("چند سند برای این شماره پیدا شد. شماره گزینه را انتخاب کن:\\n" + matches.slice(0, 30).map((j, i) => (i + 1) + ") " + j.label).join("\\n"), "1");',
      '    if (answer === null) return;',
      '    const n = Number(answer); if (!Number.isInteger(n) || n < 1 || n > Math.min(matches.length, 30)) { alert("گزینه نامعتبر است"); return; }',
      '    matches = [matches[n - 1]];',
      '  }',
      '  const chosen = matches[0];',
      '  if (!confirm("کمک‌فرم " + chosen.label + " اجرا شود؟ ثبت نهایی خودکار نیست.")) return;',
      '  console.info("IMED Manager: running", chosen.label);',
      '  (0, eval)(chosen.code);',
      '})();',
      ''
    ].join('\n');
  }

  function build({ sourceInvoices = [], documents = [] } = {}) {
    if (!Array.isArray(sourceInvoices) || !Array.isArray(documents)) throw new TypeError('Invalid IMED offline export input');
    const jobs = [];
    const xmlRows = [];
    const details = [];
    for (const doc of documents) {
      const scriptRows = Array.isArray(doc.scriptRows) ? doc.scriptRows : [];
      const readyJs = scriptRows.length > 0 && typeof doc.code === 'string' && doc.code.length > 0 && !(doc.scriptErrors || []).length;
      const readyXml = Array.isArray(doc.xmlRows) && doc.xmlRows.length > 0 && !(doc.xmlErrors || []).length;
      const invoiceNos = [...new Set(scriptRows.map(r => normalizedNumber(r.InvoiceNo)).filter(Boolean))];
      if (readyJs) jobs.push({
        label: String(doc.label || doc.distributionNo || 'سند بدون نام'),
        distributionNo: String(doc.distributionNo || ''),
        invoiceNos,
        code: doc.code
      });
      if (readyXml) xmlRows.push(...doc.xmlRows);
      details.push({
        distributionNo: String(doc.distributionNo || ''),
        label: String(doc.label || ''),
        scriptReady: readyJs,
        xmlReady: readyXml,
        scriptRowCount: readyJs ? scriptRows.length : 0,
        xmlRowCount: readyXml ? doc.xmlRows.length : 0,
        scriptErrors: doc.scriptErrors || [],
        xmlErrors: doc.xmlErrors || [],
        warnings: doc.warnings || []
      });
    }
    const sourceKeys = new Set(sourceInvoices.map(invoiceKey));
    const usedKeys = new Set(documents.flatMap(doc =>
      Array.isArray(doc.scriptRows) && !(doc.scriptErrors || []).length ? doc.scriptRows.map(invoiceKey) : []));
    const missing = [...sourceKeys].filter(k => !usedKeys.has(k));
    const report = {
      createdAt: new Date().toISOString(),
      source: 'IMED Manager local SQLite (browser)',
      sepidarSourceRows: sourceInvoices.length,
      sepidarInvoiceGroups: sourceKeys.size,
      formReadyDocuments: jobs.length,
      validXmlRows: xmlRows.length,
      totalDistributionDocuments: documents.length,
      invoiceGroupsNotInReadyScripts: missing,
      documents: details,
      notes: [
        'JavaScript includes ALL imported Sepidar rows, but only checked allocation/match jobs can fill the IMED form.',
        'XML includes ONLY valid allocations with InventoryID, receiver data, and sufficient stock information.',
        'This export does not log in, bypass maintenance, submit, or finalize any IMED document.',
        'Re-export after modifying local invoices or matches. Do not publish these files; they may contain private invoices.'
      ]
    };
    return { js: consoleCode(sourceInvoices, jobs), xml: quotaXml(xmlRows), report: JSON.stringify(report, null, 2), summary: report };
  }

  const api = { build, quotaXml };
  root.IMEDOfflineExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
