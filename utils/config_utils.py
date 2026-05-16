"""Configuration merging utilities."""

from typing import Any, Dict


def deep_merge(base: Dict[str, Any], updates: Dict[str, Any]) -> None:
    """Recursively merge updates into base dictionary in-place.

    Args:
        base: The target dictionary to update.
        updates: The source dictionary containing new values.
    """
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value