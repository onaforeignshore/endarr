import os
import tempfile

import pytest
import yaml
from flask import Flask

from config_loader import load_config
from models.database import Base, SessionLocal, engine
from services.download_client import DownloadClient
from services.watchdog import Watchdog
from webhook.arr_handler import handle_arr_webhook

# Set a temporary data directory for tests
os.environ["ENDARR_DATA_DIR"] = tempfile.mkdtemp()

@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["ENDARR_CONFIG"] = {"webhook_key": "testkey"}
    app.add_url_rule("/arr", view_func=handle_arr_webhook, methods=["POST"])
    return app

@pytest.fixture
def temp_config():
    """Create a temporary config.yaml file with given content."""
    def _temp_config(content):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(content, f)
            return f.name
    return _temp_config

@pytest.fixture
def sample_config():
    return {
        "webhook_key": "test-key",
        "defaults": {
            "delete_policy": "ratio",
            "require_all_conditions": False,
            "ratio_goal": 2.0,
            "seed_time_seconds": 86400,
            "idle_seconds": 3600,
            "no_availability_seconds": 7200,
            "upgrade_action": "move_category",
            "upgrade_category": "upgraded",
            "strike_threshold": 3,
            "strike_action": "delete",
            "strike_blacklist": False,
            "policy_blacklist": False,
            "search_on_delete": False,
        },
        "arrs": [
            {
                "id": "radarr_1",
                "type": "radarr",
                "name": "Radarr",
                "enabled": True,
                "url": "http://radarr:7878",
                "api_key": "fake-api-key"
            }
        ],
        "download_clients": [
            {
                "id": "qb_1",
                "type": "qbittorrent",
                "name": "Test QBittorrent",
                "enabled": True,
                "host": "localhost",
                "port": 8080,
                "username": "admin",
                "password": "admin",
                "use_ssl": False,
                "category": "endarr"
            }
        ],
        "categories": {},
        "protection": {
            "tags": ["private"],
            "categories": ["upgraded"],
            "tracker_domains": ["*.what.cd"]
        },
        "dangerous_extensions": [".exe"],
        "grabs_retention_days": 30,
        "stalled_download_cleanup": {
            "enabled": False,
            "min_age_seconds": 300,
            "min_progress": 0.05,
            "min_speed_kb": 10,
            "min_speed_duration": 300,
            "action": "delete",
            "blacklist": False
        },
        "watchdog": {
            "interval_seconds": 900
        }
    }

@pytest.fixture
def db_session():
    """Use in‑memory SQLite for tests."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import scoped_session, sessionmaker
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(bind=engine)
    session = scoped_session(sessionmaker(bind=engine))
    yield session
    session.remove()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(app, db_session, sample_config, mocker):
    app.config["ENDARR_CONFIG"] = sample_config
    # Mock download client instances by name
    mock_download = mocker.Mock(spec=DownloadClient)
    app.config["CLIENT_INSTANCES_BY_NAME"] = {"Test QBittorrent": mock_download}
    app.config["CLIENT_INSTANCES"] = [mock_download]
    # Mock ARR clients
    app.config["ARR_CLIENTS"] = {}
    # Replace SessionLocal with db_session fixture
    mocker.patch("webhook.arr_handler.SessionLocal", return_value=db_session)
    mocker.patch("app.SessionLocal", return_value=db_session)
    return app.test_client()

@pytest.fixture
def watchdog(sample_config, db_session, mocker):
    mock_download = mocker.Mock(spec=DownloadClient)
    w = Watchdog(sample_config, mock_download, arr_clients={}, check_interval=1)
    w.interval = 0.1  # for fast testing
    return w

@pytest.fixture
def temp_config_file(tmp_path):
    """Create a temporary config.yaml file for testing."""
    import yaml
    config_path = tmp_path / "config.yaml"
    config_data = {
        "webhook_key": "testkey",
        "defaults": {
            "delete_policy": "ratio",
            "ratio_goal": 2.0,
            "seed_time_seconds": 86400,
            "idle_seconds": 3600,
            "no_availability_seconds": 7200,
            "upgrade_action": "move_category",
            "upgrade_category": "upgraded",
            "strike_threshold": 3,
            "strike_action": "delete",
            "strike_blacklist": False,
            "policy_blacklist": False,
            "search_on_delete": False
        },
        "arrs": [],
        "categories": {},
        "protection": {"tags": [], "categories": [], "tracker_domains": []},
        "dangerous_extensions": [".exe"],
        "grabs_retention_days": 30,
        "watchdog": {"interval_seconds": 900},
        "stalled_download_cleanup": {
            "enabled": False,
            "min_age_seconds": 300,
            "min_progress": 0.05,
            "min_speed_kb": 10,
            "min_speed_duration": 300,
            "action": "delete",
            "blacklist": False
        },
        "ui_preferences": {}
    }
    with open(config_path, 'w') as f:
        yaml.dump(config_data, f)
    return str(config_path)
