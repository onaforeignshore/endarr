## [0.1.6] - 2026-06-11

### Added

- **Deprecation banner** – warns when legacy seeding policy fields (ratio_goal, seed_time_seconds, etc.) are detected in the config.
- **One‑click migration** – removes deprecated fields from config.yaml while preserving comments and formatting.
- **API endpoints** – `/api/v1/config/deprecated` (check) and `/api/v1/config/migrate_legacy` (clean).

### Changed

- Remove legacy seeding fields from `DEFAULT_CONFIG`; new configs no longer include them.

### Fixed

- Global notification banner now appears in the correct position (inside `.main`) with improved button styling for both light and dark themes.

## [0.1.5] - 2026-06-11

### Added

- **Global notification banner** – displays configuration issues and API key onboarding messages across all pages (replaces dashboard‑only banners). (#feat)
- **Pending imports table** – stores Download webhooks that arrive before the torrent is seen in the download client, preventing race conditions. (#fix)
- Configuration option `pending_imports_cleanup_hours` (default 1) to automatically remove stale pending imports. (#fix)

### Fixed

- Race condition where a Download webhook could arrive before the watchdog matched the torrent, causing `import_completed_at` to never be set. The pending imports table now captures the event, and the watchdog applies it when the torrent appears. (#fix)

## v0.1.4 (2026-06-06)

### Added

- Unified numeric helper (`initNumericHelpers`) to replace duration/byte helpers.
- Tooltips for Policy Mode dropdown and problematic torrent numeric fields.
- `.max-download-group` CSS class to separate Maximum Download Time from error state checkbox.

### Changed

- `formatDuration` now outputs multi‑unit compact strings (e.g., `1d 2h 3m 4s`).
- Settings pages now use `data-numeric-helper` attributes for consistent helper text.
- `retentionDays` shows `(Never)` when disabled; other fields show `(Disabled)` when zero.

### Removed

- Old `initDurationInputs`, `initByteInputs`, `parseDurationToSeconds`, `parseBytesToNumber`, `formatSeconds`, and duplicate `formatBytes`.

### Fixed

- Redundant helper text (e.g., `(7 days)` next to `7 days` label) no longer appears.
- Zero values without `data-zero-label` now show no helper text (unit label remains visible).

## v0.1.3 (2026-06-05)

### Security

- Upgraded `flask` to 3.1.3 (fixes missing `Vary: Cookie` header), `requests` to 2.33.0 (fixes `.netrc` credential leak and insecure temp file reuse), and `gunicorn` to 23.0.0 (fixes request smuggling). All Dependabot alerts are now resolved.

## v0.1.2 (2026-06-05)

### Security

- **Dependency updates**: Upgraded `gunicorn` to 23.0.0, `requests` to 2.32.3, and `flask` to 3.1.0 to fix known vulnerabilities (request smuggling, credential leak, temp file reuse, etc.).

## v0.1.1 (2026-06-05)

### Fixed

- **Integrations page**: Restored missing download client modal fields and Test button.
- **qBittorrent authentication**: Added `Referer` header and handle `204 No Content` response (API v2 compatibility).
- **Password handling**: Test button now uses existing password when editing a client.
- **CSS**: Added success/error styles for test icons.

### Changed

- None.

### Removed

- None.

## v0.1.0 (2026-05-16)

### Added

- **Generic DataTable component**: replaces ad‑hoc tables in Queue, History, Blacklist, and Dashboard activity feed. Supports sorting, filtering, column toggles, pagination, and detail modals.
- **Unified SettingsToolbar**: single “Save Changes” button with dirty‑state detection (snapshot comparison) across all settings pages. Shows “No Changes” / “Save Changes” and reverts on save success.
- **Condition utilities** (`conditionUtils.js`): shared rendering and logic for condition rows (ratio/time) used both in main Torrent Handling page and ARR override modal.
- **ConsoleDebug**: frontend logging that respects server log level (only outputs when `LOG_LEVEL=DEBUG`). Replaces all `console.log`.
- **CSS utility classes**: `.flex-row`, `.monospace`, `.hidden`, `.mb-12`, `.mt-8`, `.flex-align-center` – eliminates inline styles in JavaScript (except one temporary placeholder).
- **Database indexes** (Alembic migration): `ix_grabs_grabbed_at`, `ix_grabs_arr_name`, `ix_downloads_added_to_client_at`, `ix_downloads_import_completed_at`, `ix_downloads_deleted_at`, `ix_downloads_upgraded_at`, `ix_downloads_grab_id`, `ix_blacklist_blocked_at` – significantly speeds up paginated queries and history filtering.
- **Explicit modal imports**: removed globals `window.openModal` / `window.closeModal`; now imported directly from `modal.js` in every file that uses modals.
- **Form error clearing utility** (`setupFieldErrorClearing` in `ui-helpers.js`): attaches input listeners to remove error styling on change – used consistently across all settings pages.
- **Advanced toggle integration**: `SettingsToolbar` now directly controls visibility of `.advanced-field` elements, eliminating per‑page `toggleAdvancedFields` functions.

### Changed

- **Settings pages**:
    - All pages use the same function order: imports → exported function → DOM refs → state → helpers → render → modals → `load()` → `save()` → event listeners → toolbar init.
    - Removed individual “Save” buttons; toolbar handles saving.
    - Added `data-field` attributes where missing (e.g., `problematic_torrents.search_on_delete`, `problematic_torrents.policy_blacklist`).
    - ARR Overrides now use a card‑based “Add override” (no separate button), matching Integrations page style.
- **Torrent Handling page**:
    - Conditions displayed in a responsive grid (4 → 3 → 2 → 1 columns).
    - Operator dropdown (Any/All) moved to same row as “Add Condition” button, hidden when <2 conditions.
    - Placeholder “No conditions – click + Add Condition to add one.” appears when condition list empty.
- **Upgrade Handling page**: moved ARR Overrides into an advanced section (hidden behind “Show Advanced” toggle).
- **Protection & Blocking page**: moved Tracker Domains into an advanced section. Hidden state uses `data-field` JSON serialisation.
- **General page**: Database Backup/Restore moved to advanced section.
- **Watchdog page**: no functional changes, but code now uses shared utilities.
- **Integrations page**: removed duplicate broken event listener (referencing `arrSelect` and `updateArrSelect`). No toolbar (immediate save modals).
- **Backend**:
    - Added missing `DownloadClient` import in `app.py`.
    - Watchdog `_cycle` now isolates errors per torrent; stale cleanup always runs even if some torrents fail.
    - Fixed `IntegrityError` (duplicate `grab_id`) by checking existing download before inserting new.
    - Page size validation in `config_validator.py` now accepts any integer between 5 and 250 (matches frontend).
    - All Python files now have Google‑style docstrings and type hints.

### Fixed

- **Watchdog**:
    - `IntegrityError` when a grab was already associated with a download.
    - Stale torrents not being cleaned because exceptions aborted the cycle.
- **Frontend**:
    - Unused imports (`showButtonFeedback`, `getAvailableTypes`, `updateAddButtonState`) removed.
    - Dead function `updateOperatorValue` in `settings_torrents.js` removed.
    - Duplicate `globalAction` event listener in `settings_upgrade.js` removed.
    - Broken duplicate event listener in `settings_integrations.js` removed.
    - `operatorSelect` change listener removed (toolbar already tracks via `data-field`).
- **Backend**:
    - Page size validation now allows any 5–250, not just {50,100,200}.

### Deprecated

- None.

### Removed

- Global modal exports (`window.openModal`, `window.closeModal`).
- Per‑page `clearFieldErrorOnInput` functions (replaced by `setupFieldErrorClearing`).
- Per‑page `toggleAdvancedFields` functions (integrated into `SettingsToolbar`).
- Standalone “Add override” button in ARR Overrides section (now card‑only).
- Unused imports and dead code as listed above.

### Security

- None.

### Performance

- Database indexes added for pagination and filtering.
- Watchdog cycle now more resilient; stale cleanup no longer skipped.

### Dependencies

- None changed.

## v0.0.3 (2026-04-26)

## v0.0.2 (2026-04-26)

### Ci

- docker publish workflow

## v0.0.1 (2026-04-26)

### Feat

- initial public release
