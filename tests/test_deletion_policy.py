import time

from services.deletion_policy import should_delete_torrent


def test_protected_always_false():
    policy = {"delete_policy": "ratio", "ratio_goal": 1.0}
    torrent_info = {"ratio": 2.0}
    assert should_delete_torrent(torrent_info, policy, protected=True) is False

def test_ratio_policy_met():
    policy = {"delete_policy": "ratio", "ratio_goal": 2.0}
    torrent_info = {"ratio": 2.5}
    assert should_delete_torrent(torrent_info, policy, protected=False) is True

def test_ratio_policy_not_met():
    policy = {"delete_policy": "ratio", "ratio_goal": 2.0}
    torrent_info = {"ratio": 1.5}
    assert should_delete_torrent(torrent_info, policy, protected=False) is False

def test_time_policy_met():
    policy = {"delete_policy": "time", "seed_time_seconds": 3600}
    torrent_info = {"seeding_time": 7200}
    assert should_delete_torrent(torrent_info, policy, protected=False) is True

def test_idle_policy_met():
    policy = {"delete_policy": "idle", "idle_seconds": 600}
    now = time.time()
    torrent_info = {"upspeed": 0, "last_activity": now - 1200}
    assert should_delete_torrent(torrent_info, policy, protected=False) is True

def test_idle_policy_not_met_due_to_upload():
    policy = {"delete_policy": "idle", "idle_seconds": 600}
    now = time.time()
    torrent_info = {"upspeed": 100, "last_activity": now - 1200}
    assert should_delete_torrent(torrent_info, policy, protected=False) is False

def test_availability_policy_met():
    policy = {"delete_policy": "availability", "no_availability_seconds": 3600}
    torrent_info = {"num_seeds": 0, "num_peers": 0}
    zero_since = time.time() - 7200
    assert should_delete_torrent(torrent_info, policy, protected=False, availability_zero_since=zero_since) is True

def test_availability_policy_not_met():
    policy = {"delete_policy": "availability", "no_availability_seconds": 3600}
    torrent_info = {"num_seeds": 0, "num_peers": 0}
    zero_since = time.time() - 1800
    assert should_delete_torrent(torrent_info, policy, protected=False, availability_zero_since=zero_since) is False

def test_immediate_policy_missing_import():
    policy = {"delete_policy": "immediate"}
    assert should_delete_torrent({}, policy, protected=False, import_completed=False) is False

def test_all_policy_require_all_true():
    policy = {
        "delete_policy": "all",
        "require_all_conditions": True,
        "ratio_goal": 1.0,
        "seed_time_seconds": 3600,
        "idle_seconds": 600,
        "no_availability_seconds": 7200
    }
    now = time.time()
    torrent_info = {
        "ratio": 2.0,
        "seeding_time": 7200,
        "upspeed": 0,
        "last_activity": now - 1200,
        "num_seeds": 0,
        "num_peers": 0
    }
    # Availability zero since 1 hour ago (> 7200 seconds? Actually 3600 < 7200, so not satisfied)
    # Need to set zero since > 7200 seconds
    zero_since = now - 8000
    assert should_delete_torrent(torrent_info, policy, protected=False, availability_zero_since=zero_since) is True

def test_all_policy_require_all_false():
    policy = {"delete_policy": "all", "require_all_conditions": False, "ratio_goal": 1.0, "seed_time_seconds": 3600}
    torrent_info = {"ratio": 2.0, "seeding_time": 0}
    assert should_delete_torrent(torrent_info, policy, protected=False) is True

def test_all_policy_require_all_true_one_missing():
    policy = {"delete_policy": "all", "require_all_conditions": True, "ratio_goal": 1.0, "seed_time_seconds": 3600}
    torrent_info = {"ratio": 0.5, "seeding_time": 7200}
    assert should_delete_torrent(torrent_info, policy, protected=False) is False
