import pytest
from config_loader import get_policy_for_torrent, is_protected, load_config


def test_load_config_defaults(temp_config, sample_config):
    path = temp_config(sample_config)
    config = load_config(path)
    assert config["webhook_key"] == "test-key"
    assert config["defaults"]["ratio_goal"] == 2.0
    assert config["protection"]["tags"] == ["private"]

def test_load_config_merge(temp_config):
    user = {"defaults": {"delete_policy": "immediate"}, "new_key": "value"}
    path = temp_config(user)
    config = load_config(path)
    assert config["defaults"]["delete_policy"] == "immediate"
    assert config["new_key"] == "value"
    # Ensure other defaults still present (non-legacy)
    assert config["defaults"]["strike_threshold"] == 3

def test_get_policy_for_torrent_no_overrides(sample_config):
    policy = get_policy_for_torrent(sample_config, "sonarr", "tv")
    assert policy["ratio_goal"] == 2.0
    assert policy["delete_policy"] == "ratio"

def test_get_policy_for_torrent_arr_override(sample_config):
    sample_config["arrs_overrides"] = {
        "deletion": [
            {"arr_id": "radarr_1", "enabled": True, "ratio_goal": 3.0}
        ]
    }
    policy = get_policy_for_torrent(sample_config, "radarr_1", "movies")
    assert policy["ratio_goal"] == 3.0
    assert policy["delete_policy"] == "ratio"

def test_get_policy_for_torrent_category_override(sample_config):
    sample_config["categories"]["movies-uhd"] = {"ratio_goal": 4.0, "delete_policy": "immediate"}
    policy = get_policy_for_torrent(sample_config, "radarr", "movies-uhd")
    assert policy["ratio_goal"] == 4.0
    assert policy["delete_policy"] == "immediate"

def test_is_protected_by_tag():
    config = {"protection": {"tags": ["private"], "categories": [], "tracker_domains": []}}
    assert is_protected(config, ["private"], "anything", "tracker.com") is True
    assert is_protected(config, ["public"], "anything", "tracker.com") is False

def test_is_protected_by_category():
    config = {"protection": {"tags": [], "categories": ["upgraded"], "tracker_domains": []}}
    assert is_protected(config, [], "upgraded", "tracker.com") is True
    assert is_protected(config, [], "normal", "tracker.com") is False

def test_is_protected_by_tracker_domain_exact():
    config = {"protection": {"tags": [], "categories": [], "tracker_domains": ["what.cd"]}}
    assert is_protected(config, [], "any", "what.cd") is True
    assert is_protected(config, [], "any", "notwhat.cd") is False

def test_is_protected_by_tracker_domain_wildcard():
    config = {"protection": {"tags": [], "categories": [], "tracker_domains": ["*.what.cd"]}}
    assert is_protected(config, [], "any", "broadcasthe.what.cd") is True
    assert is_protected(config, [], "any", "what.cd") is True
    assert is_protected(config, [], "any", "what.org") is False
