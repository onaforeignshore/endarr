"""Seeding policy evaluation logic."""

import time
from typing import Any, Dict, Optional


def should_delete_torrent(
    torrent_info: Dict[str, Any],
    policy: Dict[str, Any],
    protected: bool,
    availability_zero_since: Optional[float] = None,
    import_completed: bool = False
) -> bool:
    """Determine whether a torrent should be deleted based on policy.

    Args:
        torrent_info: Torrent information dictionary (ratio, seeding_time, upspeed, etc.).
        policy: Policy configuration (delete_policy, thresholds, etc.).
        protected: True if torrent is protected from deletion.
        availability_zero_since: Timestamp when availability first became zero.
        import_completed: Whether import has been completed.

    Returns:
        True if torrent should be deleted, False otherwise.
    """
    if protected:
        return False

    delete_policy = policy.get("delete_policy", "ratio")

    # Immediate deletion: delete if import is done
    if delete_policy == "immediate":
        return import_completed

    operator = policy.get("operator")
    if operator is None:
        # backward compatibility: use require_all_conditions
        require_all = policy.get("require_all_conditions", False)
    else:
        require_all = (operator == "all")

    triggers = []
    if delete_policy in ("ratio", "all"):
        triggers.append("ratio")
    if delete_policy in ("time", "all"):
        triggers.append("time")
    if delete_policy in ("idle", "all"):
        triggers.append("idle")
    if delete_policy in ("availability", "all"):
        triggers.append("availability")

    results = {}
    now = time.time()

    if "ratio" in triggers:
        ratio_goal = policy.get("ratio_goal", 2.0)
        current_ratio = torrent_info.get("ratio", 0.0)
        results["ratio"] = current_ratio >= ratio_goal

    if "time" in triggers:
        seed_time_goal = policy.get("seed_time_seconds", 86400)
        current_seeding_time = torrent_info.get("seeding_time", 0)
        results["time"] = current_seeding_time >= seed_time_goal

    if "idle" in triggers:
        idle_goal = policy.get("idle_seconds", 3600)
        upload_speed = torrent_info.get("upspeed", 0)
        last_activity = torrent_info.get("last_activity", 0)
        idle_seconds = now - last_activity if last_activity > 0 else 0
        results["idle"] = (upload_speed == 0) and (idle_seconds >= idle_goal)

    if "availability" in triggers:
        no_avail_goal = policy.get("no_availability_seconds", 7200)
        seeds = torrent_info.get("num_seeds", 0)
        peers = torrent_info.get("num_peers", 0)
        if seeds + peers == 0:
            if availability_zero_since is None:
                results["availability"] = False
            else:
                results["availability"] = (now - availability_zero_since) >= no_avail_goal
        else:
            results["availability"] = False

    if require_all:
        return all(results.values())
    else:
        return any(results.values())
