# config_loader.py
import logging
import os
from copy import deepcopy

from ruamel.yaml import YAML

logger = logging.getLogger(__name__)

# Use ruamel.yaml for round‑trip preservation
yaml = YAML()
yaml.preserve_quotes = True
yaml.indent(mapping=2, sequence=4, offset=2)

DEFAULT_CONFIG = {
    "webhook_key": "",
    "defaults": {
        "delete_policy": "ratio",
        "search_on_delete": False,
        "strike_threshold": 3,
        "strike_action": "delete",
        "strike_blacklist": False,
        "policy_blacklist": False,
        "require_all_conditions": False,
        "ratio_goal": 2.0,               # Minimum Ratio (UI label)
        "seed_time_seconds": 86400,
        "upload_amount_bytes": 0,        # 0 = disabled
        "min_seeders": 0,                # 0 = disabled
        "idle_seconds": 3600,
        "no_availability_seconds": 7200,
        "upgrade_action": "move_category",
        "upgrade_category": "upgraded"
    },
    "arrs": [],
    "categories": {},
    "protection": {
        "tags": [],
        "categories": [],
        "tracker_domains": []
    },
    "dangerous_extensions": [".exe", ".scr", ".lnk", ".com", ".vbs", ".ps1"],
    "grabs_retention_days": 30,
    "watchdog": {
        "interval_seconds": 900
    },
    "stalled_download_cleanup": {
        "enabled": False,
        "min_age_seconds": 300,
        "min_progress": 0.05,
        "min_speed_kb": 10,
        "min_speed_duration": 300,
        "action": "delete",
        "blacklist": False
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
        "max_download_time_hours": 0    # 0 = disabled
    },
    "general_cleanup": {
        "torrent_age_days": 0            # 0 = disabled
    },
    "ui_preferences": {
        "show_advanced": False,
        "hide_uncategorized_by_default": True,
        "confirm_data_deletion": True,
        "confirm_config_modification": True,
        "default_page_size": 50,
        "toast_duration_seconds": 5
    }
}

def load_config(config_path):
    """Load config from YAML file, merging with defaults. Comments are preserved in memory."""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r') as f:
        user_config = yaml.load(f) or {}

    # Keep a copy of the original user config for validation
    user_config_copy = deepcopy(user_config)

    # Merge with defaults
    config = deepcopy(DEFAULT_CONFIG)
    _deep_merge(config, user_config)

    from config_validator import (  # noqa: F401
        ValidationIssue,
        normalize_config,
        validate_config,
    )

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

def save_config(config_dict, config_path):
    """Save config to YAML file while preserving comments and formatting."""
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

def _deep_merge(base, updates):
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value

def get_policy_for_torrent(config, arr_id, category):
    policy = deepcopy(config["defaults"])
    overrides = config.get("arrs_overrides", {}).get("deletion", [])
    for ov in overrides:
        if ov.get("arr_id") == arr_id and ov.get("enabled", True):
            _deep_merge(policy, ov)
            break
    cat_overrides = config["categories"].get(category, {})
    _deep_merge(policy, cat_overrides)
    return policy

def is_protected(config, torrent_tags, torrent_category, tracker_domain):
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

def get_arr_config(config, arr_name):
    return config.get("arrs", {}).get(arr_name, {})

_config_issues = []

def get_config_issues():
    return _config_issues
