# Changelog

All notable user-facing changes are recorded here. Versions follow the policy in [VERSIONING.md](VERSIONING.md).

## [0.33.0] - 2026-11-28

### Changed
- Replaced all-time sales dashboard amounts with two stock-clearance-focused values: remaining positive IMED virtual inventory, and matched Sepidar invoice quantities in the queue for registration, both in **Iranian rials**.
- IMED inventory valuation uses a valid IMED unit rate when present; otherwise it transparently estimates using the weighted unit price of Sepidar invoice lines matched to that same IRC.
- The summary explicitly shows how many inventory records use direct IMED rates, estimated Sepidar rates, or lack a valid price. Unpriced inventory is shown as unavailable ("—"), never as an invented zero.
- Sepidar amount uses only invoice quantities allocated or proposed against positive virtual-inventory balances, and caps planned quantities by remaining stock and source invoice availability. Years of unrelated historical sales are excluded.
- Dashboard distinguishes the planned-sale amount from actual completed registration; counts lines still requiring ReceiverCode.

### Safety
- No currency conversion is performed and no toman label is used. Prices and values remain in rials.
- Pricing-source fallback is an *estimate*, not a substitute for an official IMED unit price.
- Existing XML form submission and inventory snapshots are unchanged.

## [0.32.3] - 2026-11-28

### Fixed
- Applied a user-approved exact customer-name alias for Sepidar “بیمارستان عرفان” and “بیمارستان عرفان نیایش” to active receiver code 56918426 and TypeID 2.
- Prevented the short name “عرفان” (a different coding identity) and intermediary names such as “صبا داروی میلاد (بیمارستان عرفان)” from inheriting the hospital's code.
- Rechecked the entire 88,038-row receiver-coding workbook instead of selecting the first substring match; the active hospital coding record is distinct from the short-name coding record.

### Safety
- Only exact normalized customer names receive the user-confirmed override. Other receivers still require verified mapping; an unverified full upload remains blocked by XML validation.
- Zero-balance inventory exclusions and manual final submission remain unchanged.

## [0.32.2] - 2026-11-28

### Added
- Dashboard download buttons together: Excel (.xlsx), XML (.xml), and Console JavaScript (.js).
- Excel shows positive remaining inventory and proposed matching details with an exclusion summary.
- XML outputs valid matched rows and provides rejected-document reasons separately.
- JavaScript prepares eligible invoices one by one; final form submission stays manual.

### Fixed
- Latest inventory snapshots supersede older duplicate InventoryID values when calculating positive stock candidates.

### Safety
- No automatic final submission until IMED second-step and final-submit selectors have been verified in a real browser.
- Historical sales and zero-remaining inventory records are preserved in the data model.

## [0.32.1] - 2026-11-28

### Fixed
- Prevented single and bulk IMED form-script generation for IRCs with zero or missing remaining virtual inventory.
- Prevented form-script counts exceeding the remaining positive stock in the snapshot, including across batch documents sharing one IRC.
- Limited the current form-script picker to in-scope positive-stock distribution documents; historical sales and allocations remain stored.

### Safety
- Final submission in register.imed.ir remains manual, and no live inventory quantity is changed by this update.
- Snapshot balances must be refreshed and validated before actual registration.

## [0.32.0] - 2026-11-28

### Added
- Preserved optional IMED rial unit-price and source row total on import, separate from Sepidar prices.
- Displayed source and calculated rial amounts in IMED/Sepidar tables, financial dashboard, exports, XML preparation and invoice selection.
- Reported unit-price versus supplied line-total differences without changing source fields.
- Deterministic candidate selection from the same IRC using the smallest sufficient remaining inventory balance when multiple inventories qualify; equal exact balances remain manually reviewable.
- Scoped new automatic invoice matching to IRCs with positive virtual-inventory remaining balances; zero-stock or absent-stock documents stay stored but are excluded from the current stock-clearance queue.
- Capped new matching suggestions to available remaining quantity per IRC, rather than initial inventory, with updated cache keys and a separate out-of-scope dashboard status.

### Safety
- Missing IMED prices are not silently filled from Sepidar, and the XML RialPrice continues to be sourced from Sepidar.
- Approved partial-sale and TypeID=2 rules, pre-submit validation, and final IMED manual submission remain unchanged.
- No sensitive customer data or live inventory snapshot is committed.

## [0.31.1] - 2026-11-27

### Fixed
- XML validation now distinguishes partial quantity from a fully matched document and blocks rows with missing required data.
- Prevented over-allocation beyond a distribution's target and shared InventoryID capacity across bulk XML documents.
- Displayed automatic match proposals in XML preparation and persisted their InventoryID choices.
- Hardened SQLite restore validation and made the IndexedDB replacement atomic.
- Preserved distinct invoice product lines during re-import.
- Allowed explicit TypeID when there is no source distribution type to compare.
- Used fixed-length timing-safe comparison for Worker API keys.

### Safety
- Partial allocation and the approved TypeID=2 fallback remain unchanged.
- No live IMED submission, D1 migration, or Worker deployment was performed.

## [0.31.0] - 2026-11-27

### Added
- Automated syntax and project contract checks in GitHub Actions.
- Regression guards for the approved partial-allocation behavior and TypeID fallback.
- D1 runtime-table migration for the current Worker endpoints.

### Changed
- Aligned the D1 bootstrap schema with the current Worker API.
- Corrected Cloudflare authentication and migration documentation.
- Removed the legacy generic CRUD route for match allocations; the dedicated stable-key sync route remains.
- Clarified that the legacy Tampermonkey lower-grid phase is manual until the live IMED field mapping is verified.
- Aligned the app shell and static asset cache-busting version to 0.31.0.

### Safety
- Final IMED submission remains a manual user action.
- No production Cloudflare migration or Worker deployment is included in this release entry.
- Real-browser Excel import, SQLite restore, XML validation, and live IMED submission still require operational verification.
