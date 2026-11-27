# Versioning and release process

The canonical application version is stored in the root `VERSION` file. The visible version in `index.html`, asset cache-busting query strings, and the release tag must match it.

## Version format

Use Semantic Versioning: `MAJOR.MINOR.PATCH`.

While the product is in the 0.x phase:
- **0.MINOR.PATCH**: increment MINOR for a user-visible feature or a meaningful capability change.
- Increment PATCH for compatible bug fixes, documentation, and maintenance releases.
- Reserve 1.0.0 for the first production release whose supported workflows and data-safety expectations are considered stable.

## Branch and release flow

1. `main` is the production source of truth. Do not use `development`.
2. Create feature branches from `main`; run checks and merge by pull request.
3. For a release, create `release/vX.Y.Z` from the tested `main` commit.
4. Update `VERSION`, the visible version in `index.html`, asset cache-busting versions, and `CHANGELOG.md` together.
5. Run GitHub Actions quality checks. Do not publish a release with failing checks.
6. Merge the release pull request to `main`. Point the release branch and Git tag `vX.Y.Z` at the exact resulting production commit.
7. Create a GitHub Release for that tag and summarize user-visible changes, migration notes, and known limitations.
8. Never reuse or move a published version tag. For corrections, publish a new PATCH version.

## Current release

- Application version: `0.32.0`
- Intended tag: `v0.32.0`
- Production baseline before versioning metadata: `e9ee58fa5bdcbe85e4d4077012eb0f9e743e28ff`

A release branch or a version string is not itself a Git tag. The release tag must point to the final production commit after merge.
