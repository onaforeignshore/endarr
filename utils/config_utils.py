# utils/config_utils.py
def deep_merge(base: dict, updates: dict) -> None:
    """Recursively merge updates into base dictionary in-place."""
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value