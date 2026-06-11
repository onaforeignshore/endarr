"""Tests for legacy field deprecation and migration."""

import pytest
from config_loader import has_deprecated_fields


def test_has_deprecated_fields_returns_true_for_legacy_keys(sample_config):
    """Detects presence of legacy fields in defaults."""
    # sample_config already has legacy keys? By default our sample config does not.
    # Add legacy keys to test.
    sample_config["defaults"]["ratio_goal"] = 2.0
    sample_config["defaults"]["seed_time_seconds"] = 86400
    assert has_deprecated_fields(sample_config) is True


def test_has_deprecated_fields_false_when_no_legacy_keys(sample_config):
    """Clean config returns False."""
    # Remove any legacy keys if present
    for key in ["ratio_goal", "seed_time_seconds", "upload_amount_bytes", "min_seeders", "idle_seconds", "no_availability_seconds"]:
        sample_config["defaults"].pop(key, None)
    sample_config["defaults"]["delete_policy"] = "calculated"
    assert has_deprecated_fields(sample_config) is False


def test_deprecated_endpoint(api_client, sample_config):
    """GET /api/v1/config/deprecated returns correct boolean."""
    # Add legacy field
    sample_config["defaults"]["ratio_goal"] = 2.0
    api_client.application.config["ENDARR_CONFIG"] = sample_config

    response = api_client.get("/api/v1/config/deprecated?apikey=test-key")
    assert response.status_code == 200
    assert response.json["has_deprecated"] is True


def test_migrate_legacy_endpoint_removes_fields(api_client, sample_config, temp_config_file):
    """POST /api/v1/config/migrate_legacy removes legacy fields and preserves comments."""
    from config_loader import load_config
    from ruamel.yaml import YAML

    yaml = YAML()
    # Add legacy fields to the config
    sample_config["defaults"]["ratio_goal"] = 2.0
    sample_config["defaults"]["seed_time_seconds"] = 86400
    with open(temp_config_file, "w") as f:
        yaml.dump(sample_config, f)

    api_client.application.config["ENDARR_CONFIG"] = sample_config
    api_client.application.config["CONFIG_PATH"] = temp_config_file

    response = api_client.post("/api/v1/config/migrate_legacy?apikey=test-key")
    assert response.status_code == 200
    assert response.json["changed"] is True

    # Reload config using config_loader (which merges defaults)
    updated_config = load_config(temp_config_file)
    assert "ratio_goal" not in updated_config.get("defaults", {})
    assert "seed_time_seconds" not in updated_config.get("defaults", {})
