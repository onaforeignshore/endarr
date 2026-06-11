"""Configuration loading, merging, and policy resolution.

Uses ruamel.yaml to preserve comments and formatting.
"""

import logging
import os
from copy import deepcopy
from typing import Any, Dict, List, Optional

from config_validator import (  # noqa: F401
    ValidationIssue,
    normalize_config,
    validate_config,
)
from ruamel.yaml import YAML

logger = logging.getLogger(__name__)

# Use ruamel.yaml for round‑trip preservation
yaml = YAML()
yaml.preserve_quotes = True
yaml.indent(mapping=2, sequence=4, offset=2)

DEFAULT_CONFIG: Dict[str, Any] = {
    "webhook_key": "",
    "defaults": {
        "delete_policy": "ratio",
        "search_on_delete": False,
        "strike_threshold": 3,
        "strike_action": "delete",
        "strike_blacklist": False,
        "policy_blacklist": False,
        "operator": "any",     # "any" = OR, "all" = AND
        "upgrade_action": "move_category",
        "upgrade_category": "upgraded",
    },
    "arrs": [],
    "categories": {},
    "protection": {
        "tags": [],
        "categories": [],
        "tracker_domains": [],
    },
    "dangerous_extensions": [".exe", ".scr", ".lnk", ".com", ".vbs", ".ps1"],
    "grabs_retention_days": 30,
    "watchdog": {
        "interval_seconds": 900,
    },
    "stalled_download_cleanup": {
        "enabled": False,
        "min_age_seconds": 300,
        "min_progress": 0.05,
        "min_speed_kb": 10,
        "min_speed_duration": 300,
        "action": "delete",
        "blacklist": False,
    },
    "problematic_torrents": {
        "idle_enabled": False,
        "idle_seconds": 3600,
        "availability_enabled": False,
        "availability_seconds": 7200,
        "stalled_enabled": False,
        "stalled_min_age": 300,
        "stalled_min_progress": 0.05,
        "stalled_strike_threshold": 3,
        "slow_speed_enabled": False,
        "slow_speed_kb": 10,
        "slow_speed_duration": 300,
        "search_on_delete": False,
        "policy_blacklist": False,
        "error_state_enabled": False,
        "max_download_time_hours": 0,
    },
    "general_cleanup": {
        "torrent_age_days": 0,
    },
    "ui_preferences": {
        "show_advanced": False,
        "hide_uncategorized_by_default": True,
        "confirm_data_deletion": True,
        "confirm_config_modification": True,
        "default_page_size": 50,
        "toast_duration_seconds": 5,
        "log_level": "INFO",
    },
    "pending_imports_cleanup_hours": 1,
}

def _ensure_arr_ids(config: Dict[str, Any]) -> None:
    """Ensure every ARR client has a unique ID. Assigns type name as default ID."""
    arrs = config.get("arrs", [])
    type_counters = {}
    for arr in arrs:
        if "id" not in arr or not arr["id"]:
            # Assign default ID: type name, or type_name_2 if conflict
            base_id = arr.get("type", "unknown")
            if base_id in type_counters:
                type_counters[base_id] += 1
                arr["id"] = f"{base_id}_{type_counters[base_id]}"
            else:
                type_counters[base_id] = 1
                arr["id"] = base_id
        else:
            # Ensure ID is URL-safe
            arr["id"] = arr["id"].replace(" ", "_").lower()

_config_issues: List[ValidationIssue] = []

def has_deprecated_fields(config: Dict[str, Any]) -> bool:
    """Check if config contains legacy seeding policy fields."""
    defaults = config.get("defaults", {})
    legacy_keys = [
        "ratio_goal", "seed_time_seconds", "upload_amount_bytes",
        "min_seeders", "idle_seconds", "no_availability_seconds"
    ]
    for key in legacy_keys:
        if key in defaults:
            return True
    delete_policy = defaults.get("delete_policy")
    if delete_policy in ("ratio", "time", "idle", "availability", "all"):
        return True
    return False

def load_config(config_path: str) -> Dict[str, Any]:
    """Load configuration from YAML file and merge with defaults.

    Args:
        config_path: Path to the YAML configuration file.

    Returns:
        Merged configuration dictionary.

    Raises:
        FileNotFoundError: If config file does not exist.
    """
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r') as f:
        user_config = yaml.load(f) or {}

    # Keep a copy for validation
    user_config_copy = deepcopy(user_config)

    # Merge with defaults
    config = deepcopy(DEFAULT_CONFIG)
    _deep_merge(config, user_config)

    _ensure_arr_ids(config)

    # Normalize the merged config
    normalize_config(config)

    # Validate user-provided values
    global _config_issues
    _config_issues = validate_config(user_config_copy, config)

    # Log issues
    for issue in _config_issues:
        logger.warning(f"Config issue: {issue.field} - {issue.message}")

    logger.debug("{bold}Config{reset} Merged defaults with user config")
    return config


def save_config(config_dict: Dict[str, Any], config_path: str) -> None:
    """Save configuration to YAML file while preserving comments and formatting.

    Args:
        config_dict: The configuration dictionary to save.
        config_path: Path to the YAML configuration file.
    """
    # Load existing file to get its comment structure
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            data = yaml.load(f)
    else:
        data = {}

    # Update the loaded data with the new values (preserves comments)
    _deep_merge(data, config_dict)

    with open(config_path, 'w') as f:
        yaml.dump(data, f)

    logger.debug("{bold}Config{reset} Saved to {cyan}%s{reset}", config_path)


def _deep_merge(base: Dict[str, Any], updates: Dict[str, Any]) -> None:
    """Recursively merge updates into base dictionary in-place.

    Args:
        base: Target dictionary.
        updates: Source dictionary.
    """
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value


def get_policy_for_torrent(config: Dict[str, Any], arr_id: Optional[str], category: str) -> Dict[str, Any]:
    """Get the effective deletion policy for a torrent.

    Args:
        config: Full configuration dictionary.
        arr_id: ID of the ARR client (can be None).
        category: Torrent category.

    Returns:
        Policy dictionary with all applicable overrides.
    """
    policy = deepcopy(config["defaults"])
    overrides = config.get("arrs_overrides", {}).get("deletion", [])
    for ov in overrides:
        if ov.get("arr_id") == arr_id and ov.get("enabled", True):
            _deep_merge(policy, ov)
            break
    cat_overrides = config["categories"].get(category, {})
    _deep_merge(policy, cat_overrides)
    return policy


def is_protected(
    config: Dict[str, Any],
    torrent_tags: List[str],
    torrent_category: str,
    tracker_domain: str,
) -> bool:
    """Check if a torrent is protected from automatic deletion.

    Args:
        config: Full configuration dictionary.
        torrent_tags: List of tags on the torrent.
        torrent_category: Category of the torrent.
        tracker_domain: Domain of the tracker.

    Returns:
        True if torrent is protected, False otherwise.
    """
    prot = config["protection"]
    if any(tag in prot["tags"] for tag in torrent_tags):
        return True
    if torrent_category in prot["categories"]:
        return True
    for domain in prot["tracker_domains"]:
        if domain.startswith("*."):
            suffix = domain[2:]
            if tracker_domain == suffix or tracker_domain.endswith("." + suffix):
                return True
        elif tracker_domain == domain:
            return True
    return False


def get_arr_config(config: Dict[str, Any], arr_name: str) -> Dict[str, Any]:
    """Get configuration for a specific ARR.

    Args:
        config: Full configuration dictionary.
        arr_name: Name of the ARR.

    Returns:
        ARR configuration dictionary (may be empty).
    """
    return config.get("arrs", {}).get(arr_name, {})


def get_config_issues() -> List[ValidationIssue]:
    """Return the list of configuration validation issues from the last load.

    Returns:
        List of ValidationIssue objects.
    """
    return _config_issues
