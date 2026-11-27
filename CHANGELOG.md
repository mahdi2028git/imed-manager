# Changelog

All notable user-facing changes are recorded here. Versions follow the policy in [VERSIONING.md](VERSIONING.md).

## [0.31.2] - 2026-11-27

### Added
- A Tampermonkey bridge that transfers the selected Sepidar invoice from GitHub Pages to IMED without copying code manually.
- Refresh-safe IRC search, exact IRC and virtual inventory ID matching, capacity checks, lower-grid quantity and price preparation, and a guarded temporary-save action.
- Installation instructions, live-form caveats, and safe manual fallback in IMED_BRIDGE_SETUP.md.

### Safety
- Final issuance remains manual; no live IMED account, inventory or permission state was modified during development.
- The IMED live DOM still needs one supervised browser verification before production use; ambiguous or insufficient stock is not auto-selected.

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
