"""Configuration validator for Endarr.

Validates user-provided configuration values. Only keys explicitly set by the user
are validated; missing keys are silently filled with defaults and do not trigger issues.
"""

import re
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlparse

# ============================================================================
# Constants
# ============================================================================

DELETE_POLICIES = {"none", "immediate", "ratio", "time", "idle", "availability", "all", "calculated"}
STRIKE_ACTIONS = {"delete", "ignore"}
UPGRADE_ACTIONS = {"move_category", "delete_immediate", "do_nothing"}
ARR_TYPES = {"radarr", "sonarr", "lidarr"}
CLIENT_TYPES = {"qbittorrent", "transmission", "deluge", "rtorrent", "utorrent", "flood"}
# Page size allowed range (matches DataTable input limits and column picker)
PAGE_SIZE_MIN = 5
PAGE_SIZE_MAX = 250
CLEANUP_ACTIONS = {"delete", "ignore"}


# ============================================================================
# Validation Issue
# ============================================================================

class ValidationIssue:
    """Represents a single configuration validation issue."""

    def __init__(self, field: str, message: str, severity: str = "warning") -> None:
        """Initialise a validation issue.

        Args:
            field: Config field path (e.g., "webhook_key").
            message: Human-readable description.
            severity: "warning" or "error".
        """
        self.field = field
        self.message = message
        self.severity = severity

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary for JSON serialisation.

        Returns:
            Dictionary with keys field, message, severity.
        """
        return {"field": self.field, "message": self.message, "severity": self.severity}


# ============================================================================
# Normalization Helpers (applied to merged config before validation)
# ============================================================================

def normalize_dangerous_extensions(extensions: List[str]) -> List[str]:
    """Ensure each extension starts with a dot and is lowercased.

    Args:
        extensions: List of extension strings.

    Returns:
        Normalised list (e.g., [".exe", ".scr"]).
    """
    normalized = []
    for ext in extensions:
        ext = ext.strip()
        if ext and not ext.startswith('.'):
            ext = '.' + ext
        if ext and ext != '.':
            normalized.append(ext.lower())
    return normalized


def parse_duration(value: Union[str, int, float]) -> Optional[int]:
    """Parse a duration string into seconds.

    Supports suffixes: d (days), h (hours), m (minutes), s (seconds).
    Without suffix, treats as seconds. Returns None if invalid.

    Args:
        value: String like "2h", "90m", "1d 3h", or number.

    Returns:
        Seconds as integer, or None if parsing fails.
    """
    if isinstance(value, (int, float)):
        return int(value)
    if not isinstance(value, str):
        return None

    value = value.strip().lower()
    if not value:
        return None

    # Plain number
    if value.isdigit():
        return int(value)

    total_seconds = 0
    pos = 0

    unit_pattern = re.compile(r'(\d+)\s*([dhms])?')
    for match in unit_pattern.finditer(value):
        num = int(match.group(1))
        unit = match.group(2)
        if unit == 'd':
            total_seconds += num * 86400
        elif unit == 'h':
            total_seconds += num * 3600
        elif unit == 'm':
            total_seconds += num * 60
        elif unit == 's' or unit is None:
            total_seconds += num
        pos = match.end()

    if pos == len(value):
        return total_seconds
    return None


def normalize_progress(value: float) -> float:
    """Convert percentage (>1) to fraction, clamp to [0, 1].

    Args:
        value: Progress value (0.0-1.0 or 0-100).

    Returns:
        Normalised value between 0 and 1.
    """
    if value > 1.0:
        value = value / 100.0
    return max(0.0, min(1.0, value))


# ============================================================================
# Helper Functions
# ============================================================================

def _add_issue(issues: List[ValidationIssue], field: str, message: str) -> None:
    """Add a validation issue to the list."""
    issues.append(ValidationIssue(field, message))


def _validate_url(url: str) -> bool:
    """Basic URL validation."""
    try:
        parsed = urlparse(url)
        return parsed.scheme in ('http', 'https') and bool(parsed.netloc)
    except Exception:
        return False


def _validate_port(port: Any) -> bool:
    """Check if port is a valid integer between 1 and 65535."""
    try:
        p = int(port)
        return 1 <= p <= 65535
    except (ValueError, TypeError):
        return False


def _validate_positive_int(value: Any, allow_zero: bool = True) -> bool:
    """Check if value is a non-negative integer."""
    try:
        v = int(value)
        return v >= 0 if allow_zero else v > 0
    except (ValueError, TypeError):
        return False


def _validate_positive_float(value: Any, allow_zero: bool = True) -> bool:
    """Check if value is a non-negative float."""
    try:
        v = float(value)
        return v >= 0.0 if allow_zero else v > 0.0
    except (ValueError, TypeError):
        return False


def _validate_enum(value: Any, allowed: set, field: str, issues: List[ValidationIssue]) -> bool:
    """Validate that value is in the allowed set."""
    if value not in allowed:
        _add_issue(issues, field, f"Invalid value '{value}'. Allowed: {', '.join(sorted(allowed))}")
        return False
    return True


# ============================================================================
# Top-Level Validators
# ============================================================================

def _validate_webhook_key(original: dict, issues: List[ValidationIssue]) -> None:
    """Validate webhook_key length."""
    key = original.get("webhook_key", "")
    if key and len(key) < 16:
        _add_issue(issues, "webhook_key", "API key is shorter than recommended (min 16 characters)")


def _validate_grabs_retention(original: dict, issues: List[ValidationIssue]) -> None:
    """Validate grabs_retention_days."""
    if "grabs_retention_days" in original:
        val = original["grabs_retention_days"]
        if not _validate_positive_int(val):
            _add_issue(issues, "grabs_retention_days", f"Must be a non-negative integer (found {val})")


def _validate_dangerous_extensions(original: dict, issues: List[ValidationIssue]) -> None:
    """Validate dangerous_extensions list."""
    exts = original.get("dangerous_extensions", [])
    if not isinstance(exts, list):
        _add_issue(issues, "dangerous_extensions", f"Must be a list (found {type(exts).__name__})")
        return
    for ext in exts:
        if not isinstance(ext, str):
            _add_issue(issues, "dangerous_extensions", f"All extensions must be strings (found {ext})")


# ============================================================================
# Section Validators
# ============================================================================

def _validate_defaults(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate defaults section."""
    if "defaults" not in original:
        return
    orig = original["defaults"]
    if not isinstance(orig, dict):
        _add_issue(issues, "defaults", "Must be a dictionary")
        return

    for key, value in orig.items():
        field = f"defaults.{key}"
        if key == "delete_policy":
            _validate_enum(value, DELETE_POLICIES, field, issues)
        elif key == "strike_action":
            _validate_enum(value, STRIKE_ACTIONS, field, issues)
        elif key == "upgrade_action":
            _validate_enum(value, UPGRADE_ACTIONS, field, issues)
        elif key in ("ratio_goal",):
            if not _validate_positive_float(value):
                _add_issue(issues, field, f"Must be >= 0 (found {value})")
        elif key in ("seed_time_seconds", "upload_amount_bytes", "min_seeders", "idle_seconds",
                     "no_availability_seconds", "strike_threshold"):
            if not _validate_positive_int(value):
                _add_issue(issues, field, f"Must be a non-negative integer (found {value})")
        elif key in ("search_on_delete", "policy_blacklist", "strike_blacklist", "require_all_conditions"):
            if not isinstance(value, bool):
                _add_issue(issues, field, f"Must be a boolean (found {value})")
        elif key == "deletion_rules":
            _validate_deletion_rules(value, field, issues)
        elif key == "upgrade_category":
            if orig.get("upgrade_action") == "move_category" and not value:
                _add_issue(issues, field, "Required when upgrade_action is 'move_category'")


def _validate_deletion_rules(rules: Any, field: str, issues: List[ValidationIssue]) -> None:
    """Validate deletion_rules structure."""
    if not isinstance(rules, dict):
        _add_issue(issues, field, "Must be a dictionary")
        return
    operator = rules.get("operator")
    if operator not in ("any", "all"):
        _add_issue(issues, f"{field}.operator", f"Must be 'any' or 'all' (found {operator})")
    conditions = rules.get("conditions", [])
    if not isinstance(conditions, list):
        _add_issue(issues, f"{field}.conditions", "Must be a list")
        return
    for i, cond in enumerate(conditions):
        if not isinstance(cond, dict):
            _add_issue(issues, f"{field}.conditions[{i}]", "Must be a dictionary")
            continue
        cond_type = cond.get("type")
        if cond_type not in ("ratio", "time"):
            _add_issue(issues, f"{field}.conditions[{i}].type", f"Must be 'ratio' or 'time' (found {cond_type})")
        threshold = cond.get("threshold")
        if cond_type == "ratio":
            if not _validate_positive_float(threshold):
                _add_issue(issues, f"{field}.conditions[{i}].threshold", f"Must be >= 0 (found {threshold})")
        else:
            if not _validate_positive_int(threshold):
                _add_issue(issues, f"{field}.conditions[{i}].threshold", f"Must be a non-negative integer (found {threshold})")


def _validate_arrs(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate arrs list."""
    if "arrs" not in original:
        return
    arrs = original["arrs"]
    if not isinstance(arrs, list):
        _add_issue(issues, "arrs", "Must be a list")
        return

    seen_ids = set()
    for i, arr in enumerate(arrs):
        if not isinstance(arr, dict):
            _add_issue(issues, f"arrs[{i}]", "Must be a dictionary")
            continue
        field_prefix = f"arrs[{i}]"

        arr_id = arr.get("id")
        if not arr_id:
            _add_issue(issues, f"{field_prefix}.id", "Required field 'id' is missing")
        elif arr_id in seen_ids:
            _add_issue(issues, f"{field_prefix}.id", f"Duplicate id '{arr_id}'")
        else:
            seen_ids.add(arr_id)

        if "type" in arr:
            _validate_enum(arr["type"], ARR_TYPES, f"{field_prefix}.type", issues)
        if "enabled" in arr and not isinstance(arr["enabled"], bool):
            _add_issue(issues, f"{field_prefix}.enabled", f"Must be a boolean (found {arr['enabled']})")
        if "url" in arr and not _validate_url(arr["url"]):
            _add_issue(issues, f"{field_prefix}.url", f"Invalid URL (found {arr.get('url')})")
        if "api_key" in arr and not arr["api_key"]:
            _add_issue(issues, f"{field_prefix}.api_key", "API key cannot be empty")


def _validate_arr_ids(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate ARR client IDs are unique and URL-safe."""
    arrs = merged.get("arrs", [])
    ids_seen = set()
    for i, arr in enumerate(arrs):
        arr_id = arr.get("id")
        if not arr_id:
            _add_issue(issues, f"arrs[{i}].id", "Missing ID")
            continue
        if arr_id in ids_seen:
            _add_issue(issues, f"arrs[{i}].id", f"Duplicate ID '{arr_id}'")
        else:
            ids_seen.add(arr_id)
        # Check URL-safe characters (alphanumeric, underscore, hyphen)
        if not all(c.isalnum() or c in "_-" for c in arr_id):
            _add_issue(issues, f"arrs[{i}].id", f"ID contains invalid characters (use only letters, numbers, underscore, hyphen): '{arr_id}'")


def _validate_download_clients(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate download_clients list."""
    if "download_clients" not in original:
        return
    clients = original["download_clients"]
    if not isinstance(clients, list):
        _add_issue(issues, "download_clients", "Must be a list")
        return

    seen_ids = set()
    arr_ids = {arr["id"] for arr in merged.get("arrs", []) if arr.get("id")}

    for i, client in enumerate(clients):
        if not isinstance(client, dict):
            _add_issue(issues, f"download_clients[{i}]", "Must be a dictionary")
            continue
        field_prefix = f"download_clients[{i}]"

        client_id = client.get("id")
        if not client_id:
            _add_issue(issues, f"{field_prefix}.id", "Required field 'id' is missing")
        elif client_id in seen_ids:
            _add_issue(issues, f"{field_prefix}.id", f"Duplicate id '{client_id}'")
        else:
            seen_ids.add(client_id)

        if "type" in client:
            _validate_enum(client["type"], CLIENT_TYPES, f"{field_prefix}.type", issues)
        if "enabled" in client and not isinstance(client["enabled"], bool):
            _add_issue(issues, f"{field_prefix}.enabled", f"Must be a boolean (found {client['enabled']})")
        if "host" in client and not client["host"]:
            _add_issue(issues, f"{field_prefix}.host", "Host cannot be empty")
        if "port" in client and not _validate_port(client["port"]):
            _add_issue(issues, f"{field_prefix}.port", f"Invalid port (must be 1-65535, found {client.get('port')})")
        if "use_ssl" in client and not isinstance(client["use_ssl"], bool):
            _add_issue(issues, f"{field_prefix}.use_ssl", f"Must be a boolean (found {client['use_ssl']})")
        if "timeout_seconds" in client:
            val = client["timeout_seconds"]
            if not _validate_positive_int(val, allow_zero=False):
                _add_issue(issues, f"{field_prefix}.timeout_seconds", f"Must be >= 1 (found {val})")
        if "watchdog_interval" in client:
            val = client["watchdog_interval"]
            if not _validate_positive_int(val) or (val and val < 60):
                _add_issue(issues, f"{field_prefix}.watchdog_interval", f"Must be >= 60 (found {val})")
        if "arrClientIds" in client:
            ids = client["arrClientIds"]
            if not isinstance(ids, list):
                _add_issue(issues, f"{field_prefix}.arrClientIds", "Must be a list")
            else:
                for arr_id in ids:
                    if arr_id not in arr_ids:
                        _add_issue(issues, f"{field_prefix}.arrClientIds", f"Unknown arr_id '{arr_id}'")


def _validate_protection(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate protection section."""
    if "protection" not in original:
        return
    prot = original["protection"]
    if not isinstance(prot, dict):
        _add_issue(issues, "protection", "Must be a dictionary")
        return
    for key in ("tags", "categories", "tracker_domains"):
        if key in prot and not isinstance(prot[key], list):
            _add_issue(issues, f"protection.{key}", "Must be a list")


def _validate_problematic(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate problematic_torrents section."""
    if "problematic_torrents" not in original:
        return
    prob = original["problematic_torrents"]
    if not isinstance(prob, dict):
        _add_issue(issues, "problematic_torrents", "Must be a dictionary")
        return

    for key, value in prob.items():
        field = f"problematic_torrents.{key}"
        if key.endswith("_enabled") or key in ("search_on_delete", "policy_blacklist"):
            if not isinstance(value, bool):
                _add_issue(issues, field, f"Must be a boolean (found {value})")
        elif key == "stalled_min_progress":
            if not _validate_positive_float(value):
                _add_issue(issues, field, f"Must be between 0 and 1 (found {value})")
        elif key in ("idle_seconds", "availability_seconds", "stalled_min_age", "stalled_strike_threshold",
                     "slow_speed_kb", "slow_speed_duration", "max_download_time_hours"):
            if not _validate_positive_int(value):
                _add_issue(issues, field, f"Must be a non-negative integer (found {value})")


def _validate_general_cleanup(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate general_cleanup section."""
    if "general_cleanup" not in original:
        return
    cleanup = original["general_cleanup"]
    if not isinstance(cleanup, dict):
        _add_issue(issues, "general_cleanup", "Must be a dictionary")
        return
    if "torrent_age_days" in cleanup:
        val = cleanup["torrent_age_days"]
        if not _validate_positive_int(val):
            _add_issue(issues, "general_cleanup.torrent_age_days", f"Must be a non-negative integer (found {val})")


def _validate_watchdog(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate watchdog section."""
    if "watchdog" not in original:
        return
    wd = original["watchdog"]
    if not isinstance(wd, dict):
        _add_issue(issues, "watchdog", "Must be a dictionary")
        return
    if "interval_seconds" in wd:
        val = wd["interval_seconds"]
        if not _validate_positive_int(val) or (val and val < 60):
            _add_issue(issues, "watchdog.interval_seconds", f"Must be >= 60 (found {val})")


def _validate_stalled_cleanup(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate stalled_download_cleanup section."""
    if "stalled_download_cleanup" not in original:
        return
    sc = original["stalled_download_cleanup"]
    if not isinstance(sc, dict):
        _add_issue(issues, "stalled_download_cleanup", "Must be a dictionary")
        return

    for key, value in sc.items():
        field = f"stalled_download_cleanup.{key}"
        if key == "enabled" or key == "blacklist":
            if not isinstance(value, bool):
                _add_issue(issues, field, f"Must be a boolean (found {value})")
        elif key == "action":
            _validate_enum(value, CLEANUP_ACTIONS, field, issues)
        elif key == "min_progress":
            if not _validate_positive_float(value):
                _add_issue(issues, field, f"Must be between 0 and 1 (found {value})")
        elif key in ("min_age_seconds", "min_speed_kb", "min_speed_duration"):
            if not _validate_positive_int(value):
                _add_issue(issues, field, f"Must be a non-negative integer (found {value})")


def _validate_ui_preferences(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate ui_preferences section."""
    if "ui_preferences" not in original:
        return
    ui = original["ui_preferences"]
    if not isinstance(ui, dict):
        _add_issue(issues, "ui_preferences", "Must be a dictionary")
        return

    for key, value in ui.items():
        field = f"ui_preferences.{key}"
        if key in ("show_advanced", "hide_uncategorized_by_default", "confirm_data_deletion",
                   "confirm_config_modification"):
            if not isinstance(value, bool):
                _add_issue(issues, field, f"Must be a boolean (found {value})")
        elif key == "default_page_size":
            if not isinstance(value, int) or value < PAGE_SIZE_MIN or value > PAGE_SIZE_MAX:
                _add_issue(issues, field, f"Must be an integer between {PAGE_SIZE_MIN} and {PAGE_SIZE_MAX} (found {value})")
        elif key == "toast_duration_seconds":
            if not _validate_positive_int(value) or (value and value < 3):
                _add_issue(issues, field, f"Must be >= 3 (found {value})")


def _validate_pending_cleanup(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate pending_imports_cleanup_hours."""
    if "pending_imports_cleanup_hours" in original:
        val = original["pending_imports_cleanup_hours"]
        if not isinstance(val, (int, float)) or val < 0:
            _add_issue(issues, "pending_imports_cleanup_hours", "Must be a non‑negative number (hours)")

def _validate_arrs_overrides(original: dict, merged: dict, issues: List[ValidationIssue]) -> None:
    """Validate arrs_overrides section."""
    if "arrs_overrides" not in original:
        return
    overrides = original["arrs_overrides"]
    if not isinstance(overrides, dict):
        _add_issue(issues, "arrs_overrides", "Must be a dictionary")
        return

    arr_ids = {arr["id"] for arr in merged.get("arrs", []) if arr.get("id")}

    for section in ("deletion", "upgrade"):
        if section not in overrides:
            continue
        section_list = overrides[section]
        if not isinstance(section_list, list):
            _add_issue(issues, f"arrs_overrides.{section}", "Must be a list")
            continue

        for i, override in enumerate(section_list):
            if not isinstance(override, dict):
                _add_issue(issues, f"arrs_overrides.{section}[{i}]", "Must be a dictionary")
                continue
            field_prefix = f"arrs_overrides.{section}[{i}]"

            arr_id = override.get("arr_id")
            if arr_id not in arr_ids:
                _add_issue(issues, f"{field_prefix}.arr_id", f"Unknown arr_id '{arr_id}'")

            if "enabled" in override and not isinstance(override["enabled"], bool):
                _add_issue(issues, f"{field_prefix}.enabled", f"Must be a boolean (found {override['enabled']})")

            if section == "deletion" and "delete_policy" in override:
                _validate_enum(override["delete_policy"], DELETE_POLICIES, f"{field_prefix}.delete_policy", issues)
                if override.get("delete_policy") == "calculated" and "deletion_rules" in override:
                    _validate_deletion_rules(override["deletion_rules"], f"{field_prefix}.deletion_rules", issues)

            if section == "upgrade":
                if "upgrade_action" in override:
                    _validate_enum(override["upgrade_action"], UPGRADE_ACTIONS, f"{field_prefix}.upgrade_action", issues)
                if override.get("upgrade_action") == "move_category" and not override.get("upgrade_category"):
                    _add_issue(issues, f"{field_prefix}.upgrade_category", "Required when upgrade_action is 'move_category'")


# ============================================================================
# Main Validation Function
# ============================================================================

def validate_config(original: Dict[str, Any], merged: Dict[str, Any]) -> List[ValidationIssue]:
    """Validate user-provided configuration values.

    Only keys present in `original` are validated.

    Args:
        original: User-provided config (before merging defaults).
        merged: Fully merged config (defaults + user).

    Returns:
        List of ValidationIssue objects.
    """
    issues: List[ValidationIssue] = []

    _validate_webhook_key(original, issues)
    _validate_grabs_retention(original, issues)
    _validate_dangerous_extensions(original, issues)

    _validate_defaults(original, merged, issues)
    _validate_arrs(original, merged, issues)
    _validate_arr_ids(original, merged, issues)
    _validate_download_clients(original, merged, issues)
    _validate_protection(original, merged, issues)
    _validate_problematic(original, merged, issues)
    _validate_general_cleanup(original, merged, issues)
    _validate_watchdog(original, merged, issues)
    _validate_stalled_cleanup(original, merged, issues)
    _validate_ui_preferences(original, merged, issues)
    _validate_pending_cleanup(original, merged, issues)
    _validate_arrs_overrides(original, merged, issues)

    return issues


# ============================================================================
# Normalization (applied to merged config before validation)
# ============================================================================

def normalize_config(config: Dict[str, Any]) -> None:
    """Normalize configuration values in-place.

    Ensures consistent types and formats.

    Args:
        config: Configuration dictionary (will be modified).
    """
    # Normalize dangerous extensions
    if "dangerous_extensions" in config:
        config["dangerous_extensions"] = normalize_dangerous_extensions(config["dangerous_extensions"])

    # Normalize duration fields in defaults
    if "defaults" in config:
        defaults = config["defaults"]
        for key in ("seed_time_seconds", "idle_seconds", "no_availability_seconds"):
            if key in defaults:
                parsed = parse_duration(defaults[key])
                if parsed is not None:
                    defaults[key] = parsed

    # Normalize problematic torrents
    if "problematic_torrents" in config:
        prob = config["problematic_torrents"]
        for key in ("idle_seconds", "availability_seconds", "stalled_min_age", "slow_speed_duration"):
            if key in prob:
                parsed = parse_duration(prob[key])
                if parsed is not None:
                    prob[key] = parsed
        if "stalled_min_progress" in prob:
            prob["stalled_min_progress"] = normalize_progress(prob["stalled_min_progress"])

    # Normalize stalled download cleanup
    if "stalled_download_cleanup" in config:
        sc = config["stalled_download_cleanup"]
        for key in ("min_age_seconds", "min_speed_duration"):
            if key in sc:
                parsed = parse_duration(sc[key])
                if parsed is not None:
                    sc[key] = parsed
        if "min_progress" in sc:
            sc["min_progress"] = normalize_progress(sc["min_progress"])

    # Normalize watchdog
    if "watchdog" in config and "interval_seconds" in config["watchdog"]:
        parsed = parse_duration(config["watchdog"]["interval_seconds"])
        if parsed is not None:
            config["watchdog"]["interval_seconds"] = parsed
