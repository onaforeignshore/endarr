"""Tests for pending imports table and race condition handling."""

import time
from unittest.mock import patch

import pytest
from models.downloads import Download
from models.grabs import Grab
from models.pending_import import PendingImport
from webhook.arr_handler import handle_download


def test_download_event_before_torrent_creates_pending(api_client, db_session, sample_config):
    """Download webhook arrives before torrent is seen in client -> pending entry created."""
    # Ensure no download record exists
    assert db_session.query(Download).filter(Download.hash == "test123").first() is None

    payload = {
        "eventType": "Download",
        "downloadId": "test123",
        "movie": {"id": 1, "title": "Test Movie"},
        "isUpgrade": False,
    }
    response = api_client.post("/arr?apikey=test-key", json=payload)
    assert response.status_code == 200
    assert response.json == {"status": "pending"}

    pending = db_session.query(PendingImport).filter(PendingImport.hash == "test123").first()
    assert pending is not None
    assert pending.import_completed_at is not None
    assert pending.arr_name == "radarr"
    assert pending.media_id == "1"


def test_watchdog_applies_pending_import(watchdog, db_session):
    pending = PendingImport(
        hash="test456",
        import_completed_at=time.time(),
        arr_name="radarr",
        media_id="2",
        created_at=time.time(),
    )
    db_session.add(pending)
    db_session.commit()

    torrent_info = {
        "hash": "test456",
        "name": "Test Movie 2024",
        "category": "movies",
        "save_path": "/downloads",
        "total_size": 1024,
        "added_on": time.time(),
    }
    with patch.object(watchdog.download_client, 'get_torrent_files', return_value=[]):
        watchdog._handle_new_torrent(db_session, torrent_info)

    download = db_session.query(Download).filter(Download.hash == "test456").first()
    assert download is not None
    assert download.import_completed_at is not None
    assert download.grab_id is None
    assert db_session.query(PendingImport).filter(PendingImport.hash == "test456").first() is None

def test_pending_cleanup_removes_stale_entries(watchdog, db_session, sample_config):
    """Stale pending imports older than cleanup_hours are deleted."""
    # Create stale entry (created 2 hours ago)
    stale = PendingImport(
        hash="stale1",
        import_completed_at=time.time() - 7200,
        arr_name="radarr",
        media_id="1",
        created_at=time.time() - 7200,
    )
    db_session.add(stale)
    # Create fresh entry
    fresh = PendingImport(
        hash="fresh1",
        import_completed_at=time.time(),
        arr_name="radarr",
        media_id="2",
        created_at=time.time(),
    )
    db_session.add(fresh)
    db_session.commit()

    # Ensure cleanup_hours is 1 (default)
    watchdog.config["pending_imports_cleanup_hours"] = 1

    # Call cleanup method
    watchdog._cleanup_pending_imports(db_session)
    db_session.commit()

    assert db_session.query(PendingImport).filter(PendingImport.hash == "stale1").first() is None
    assert db_session.query(PendingImport).filter(PendingImport.hash == "fresh1").first() is not None
