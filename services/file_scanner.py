"""Dangerous file detection."""

import os
from typing import List, Dict, Any


def has_dangerous_files(files: List[Dict[str, Any]], dangerous_extensions: List[str]) -> bool:
    """Check if any file in the list has a dangerous extension.

    Args:
        files: List of file dictionaries, each with a "name" key.
        dangerous_extensions: List of extensions (e.g., [".exe", ".scr"]).

    Returns:
        True if at least one dangerous file is found, False otherwise.
    """
    for f in files:
        name = f.get("name", "")
        _, ext = os.path.splitext(name)
        if ext.lower() in dangerous_extensions:
            return True
    return False