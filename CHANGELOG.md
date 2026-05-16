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
