# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally simple and release-focused so it can double as GitHub release notes.


## [1.2.1] - 2026-06-23

### Fixed

- Rounded the payment history chart Y-axis to integer tick values so the min and max labels no longer show long floating-point decimals.
- Tightened the Bills dashboard card header layout so category icons, titles, and recurring/autopay badges align more consistently across mixed bill types.

### Notes

- Release tag: `v1.2.1`
- App version: `1.2.1`

## [1.2.0] - 2026-06-12

### Changed

- Renamed the app from `Billzzz` to `BillTrack` across the UI, Docker image references, export filenames, and repository metadata.
- Updated local and deployment-facing naming to use `billtrack`, including container and compose service names.
- Switched the Unraid/Dockhand host data path in `docker-compose.yml` to `/mnt/user/appdata/billtrack`.

### Added

- Added `RELEASE.md` to document the required release process.
- Added an explicit rule that `package.json` version must match the git tag version before creating a release tag.

### Notes

- Release tag: `v1.2.0`
- App version: `1.2.0`

## [1.1.0] - 2026-06-12

### Changed

- Refined the Bills dashboard by removing summary cards and replacing the filter area with a cleaner, more modern toolbar layout.
- Redesigned the bill detail page to emphasize the current cycle, clarify primary actions, and improve payment history presentation.
- Reworked the create/edit bill form into a clearer step-by-step flow with better billing, amount mode, cycle anchor, and payment sections.
- Reorganized the Settings page into clearer groups: Appearance, Payment Setup, Bill Metadata, and Data Management.
- Restyled the top navigation bar to better match the rest of the refreshed UI.

### Added

- Added a reusable status system for bill and cycle states, including shared status mapping and badge presentation.
- Added dynamic Y-axis padding in the payment history line chart so values render more naturally in the chart area.

### Fixed

- Improved consistency of bill and cycle status display across cards, detail views, and filters.
- Improved title presentation on the main top-level pages by matching page headers with their navigation icons.

### Notes

- Release tag: `v1.1.0`
- App version at release time should match `1.1.0`

## [1.0.0] - 2026-06-11

### Added

- Added a formal Docker image publishing workflow for GitHub Container Registry.
- Added version-aware image publishing for `latest`, `main`, `sha-*`, and semantic version release tags.
- Added app version display support in the UI.

### Changed

- Switched deployment guidance and compose configuration toward published GHCR images instead of repo-sync rebuilds.
- Documented a release-oriented deployment flow for Unraid / Dockhand.

### Included From Earlier Work

- Unified time storage/handling so the app can use a more consistent date format strategy.
- Fixed modal close behavior when dragging outside edit/add bill dialogs.
- Redesigned bill cycle handling and bill forms around cycle-based billing data.
- Added payment editing support and improved cycle recalculation behavior.
- Reworked payment history presentation, including the shift back to a line chart-based view.

### Notes

- Release tag: `v1.0.0`
- This was the first formal tagged release using the new versioned image workflow.
