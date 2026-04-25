import os
from typing import List, Dict, Any

def has_dangerous_files(files: List[Dict[str, Any]], dangerous_extensions: List[str]) -> bool:
    """
    Check if any file in the torrent has a dangerous extension.
    Returns True if at least one dangerous file is found.
    """
    for f in files:
        name = f.get("name", "")
        _, ext = os.path.splitext(name)
        if ext.lower() in dangerous_extensions:
            return True
    return False