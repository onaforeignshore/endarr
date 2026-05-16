"""Time utility functions."""

from typing import Union


def format_duration(seconds: Union[int, float]) -> str:
    """Convert seconds to a human-readable string.

    Args:
        seconds: Number of seconds (can be int or float). Negative values are treated as 0.

    Returns:
        Formatted duration string, e.g. "1d 2h 3m", "45m", "30s".
        Returns "0s" for zero or negative input.
    """
    if seconds <= 0:
        return "0s"

    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        mins = seconds // 60
        secs = seconds % 60
        return f"{mins}m {secs}s" if secs > 0 else f"{mins}m"
    elif seconds < 86400:
        hours = seconds // 3600
        mins = (seconds % 3600) // 60
        return f"{hours}h {mins}m" if mins > 0 else f"{hours}h"
    else:
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        return f"{days}d {hours}h" if hours > 0 else f"{days}d"