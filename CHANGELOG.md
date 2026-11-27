# Changelog

All notable user-facing changes are recorded here. Versions follow the policy in [VERSIONING.md](VERSIONING.md).

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
