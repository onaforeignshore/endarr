"""Tests for multi-ARR client identification via arr_client parameter."""

import pytest
from models.grabs import Grab
from webhook.arr_handler import handle_grab


def test_webhook_with_arr_client_parameter(api_client, db_session, sample_config):
    """When arr_client is provided and multiple ARRs exist, arr_id should be set."""
    # Add second Radarr to config (simulate multiple instances)
    sample_config["arrs"].append(
        {
            "id": "radarr_4k",
            "type": "radarr",
            "name": "Radarr 4K",
            "enabled": True,
            "url": "http://radarr-4k:7878",
            "api_key": "key2",
        }
    )
    api_client.application.config["ENDARR_CONFIG"] = sample_config

    payload = {
        "eventType": "Grab",
        "movie": {"id": 123, "title": "Test Movie"},
        "release": {"releaseTitle": "Test.Movie.2024.1080p"},
        "indexer": "RARBG",
        "quality": "1080p",
        "size": 123456,
    }
    response = api_client.post("/arr?apikey=test-key&arr_client=radarr_4k", json=payload)
    assert response.status_code == 200
    assert response.json == {"status": "grabbed"}

    grab = db_session.query(Grab).first()
    assert grab.arr_id == "radarr_4k"
    assert grab.arr_name == "radarr"


def test_arr_id_uniqueness_validation(sample_config):
    """ARR IDs must be unique."""
    from config_validator import _validate_arr_ids, ValidationIssue

    sample_config["arrs"] = [
        {"id": "radarr", "type": "radarr", "name": "Radarr HD"},
        {"id": "radarr", "type": "radarr", "name": "Radarr 4K"},
    ]
    issues = []
    _validate_arr_ids({}, sample_config, issues)
    assert any("Duplicate ID" in i.message for i in issues)


def test_arr_id_url_safe_validation(sample_config):
    """ARR IDs must contain only alphanumeric, underscore, hyphen."""
    from config_validator import _validate_arr_ids, ValidationIssue

    sample_config["arrs"] = [{"id": "radarr 4K", "type": "radarr", "name": "Bad ID"}]
    issues = []
    _validate_arr_ids({}, sample_config, issues)
    assert any("invalid characters" in i.message for i in issues)


def test_config_loader_assigns_default_ids(temp_config_file):
    """Existing ARR clients without id get default id = type."""
    import yaml
    from config_loader import load_config

    config_data = {
        "arrs": [
            {"type": "radarr", "name": "Radarr", "url": "http://radarr:7878", "api_key": "key1"}
        ]
    }
    with open(temp_config_file, "w") as f:
        yaml.dump(config_data, f)
    config = load_config(temp_config_file)
    assert config["arrs"][0]["id"] == "radarr"
