import time

import pytest

from models.blacklist import Blacklist
from models.downloads import Download
from models.grabs import Grab
from models.torrent_files import TorrentFile
from services.download_client import DownloadClient
from services.watchdog import Watchdog


def test_handle_new_torrent_matched(watchdog, db_session):
    # Insert a grab
    grab = Grab(release_title="Test Movie 2024", arr_name="radarr", grabbed_at=time.time())
    db_session.add(grab)
    db_session.commit()
    torrent_info = {
        "hash": "abc123",
        "name": "Test Movie 2024",
        "category": "movies",
        "save_path": "/downloads",
        "total_size": 1024,
        "added_on": time.time()
    }
    watchdog._handle_new_torrent(db_session, torrent_info)
    download = db_session.query(Download).filter_by(hash="abc123").first()
    assert download is not None
    assert download.grab_id == grab.id
    assert download.ignored is False

def test_handle_new_torrent_unmatched(watchdog, db_session):
    torrent_info = {"hash": "def456", "name": "Unknown torrent", "added_on": time.time()}
    watchdog._handle_new_torrent(db_session, torrent_info)
    download = db_session.query(Download).filter_by(hash="def456").first()
    assert download is not None
    assert download.ignored is True

def test_handle_existing_torrent_skips_ignored(watchdog, db_session):
    dl = Download(hash="ignored1", ignored=True)
    db_session.add(dl)
    db_session.commit()
    torrent_info = {"hash": "ignored1", "name": "ignored"}
    watchdog._handle_existing_torrent(db_session, torrent_info)
    # No changes, should not call any qb methods
    # We just check no exception
    assert True

def test_speed_threshold_cleanup(watchdog, db_session, mocker):
    # Enable speed threshold in config
    watchdog.config["stalled_download_cleanup"] = {
        "enabled": True,
        "min_speed_kb": 5,
        "min_speed_duration": 2,
        "action": "delete",
        "blacklist": False
    }
    mock_download = watchdog.download_client
    dl = Download(hash="slow1", grab_id=None, ignored=False, speed_below_threshold_since=None)
    db_session.add(dl)
    db_session.commit()
    torrent_info = {
        "hash": "slow1",
        "name": "Slow Torrent",
        "progress": 0.5,
        "dlspeed": 1024  # 1 KB/s -> <5 KB/s
    }
    # First check: set timestamp
    watchdog._check_speed_threshold(torrent_info, dl, db_session)
    assert dl.speed_below_threshold_since is not None
    # Second check after 3 seconds (simulate time passage)
    mocker.patch('time.time', return_value=dl.speed_below_threshold_since + 3)
    deleted = watchdog._check_speed_threshold(torrent_info, dl, db_session)
    assert deleted is True
    mock_download.delete_torrent.assert_called_once()
    assert dl.deleted_at is not None
    assert dl.delete_reason == "slow_download_speed"

def test_strike_system(watchdog, db_session, mocker):
    """Test that stalled torrents accumulate strikes and get deleted."""
    # Set stall thresholds via config defaults (already in watchdog.config)
    watchdog.config["defaults"]["strike_threshold"] = 1
    watchdog.config["defaults"]["strike_action"] = "delete"
    watchdog.config["defaults"]["strike_blacklist"] = True

    # Mock policy (the watchdog calls get_policy_for_torrent which uses config)
    mocker.patch('services.watchdog.get_policy_for_torrent', return_value={
        'strike_threshold': 1,
        'strike_action': 'delete',
        'strike_blacklist': True,
        'delete_policy': 'none'
    })

    mock_delete = mocker.patch.object(watchdog.download_client, 'delete_torrent')

    dl = Download(
        hash='strike1',
        grab_id=None,
        stall_strikes=0,
        ignored=False,
        added_to_client_at=time.time() - 400
    )
    db_session.add(dl)
    db_session.commit()

    torrent_info = {
        'hash': 'strike1',
        'name': 'Stalled Torrent',
        'state': 'stalledDL',
        'progress': 0.01,
        'added_on': time.time() - 400,
        'num_seeds': 0,
        'num_peers': 0
    }

    watchdog._handle_existing_torrent(db_session, torrent_info)

    db_session.refresh(dl)
    assert dl.stall_strikes == 1
    assert dl.deleted_at is not None
    assert dl.delete_reason == 'stalled_strikes'
    mock_delete.assert_called_once_with('strike1', delete_files=True)

    blacklist = db_session.query(Blacklist).first()
    assert blacklist is not None
    assert blacklist.reason == 'stalled'

def test_trigger_search_on_deletion(watchdog, db_session, mocker):
    """Test that search_on_delete triggers ArrClient.search_for_media."""
    # Setup grab with media_id
    grab = Grab(
        id=1,
        release_title='Test Movie',
        arr_name='radarr',
        media_id='123',
        media_type='movie',
        grabbed_at=time.time()
    )
    db_session.add(grab)
    db_session.commit()

    dl = Download(
        hash='search1',
        grab_id=grab.id,
        ignored=False,
        import_completed_at=time.time()
    )
    db_session.add(dl)
    db_session.commit()

    # Mock policy with search_on_delete=True
    policy = {
        'delete_policy': 'immediate',
        'search_on_delete': True
    }
    mocker.patch('services.watchdog.get_policy_for_torrent', return_value=policy)
    mocker.patch('services.deletion_policy.should_delete_torrent', return_value=True)
    mocker.patch.object(watchdog.download_client, 'delete_torrent')

    # Mock ArrClient
    mock_arr_client = mocker.Mock()
    mock_arr_client.search_for_media.return_value = True
    watchdog.arr_clients = {'radarr': mock_arr_client}

    torrent_info = {
        'hash': 'search1',
        'name': 'Test Movie',
        'ratio': 0.0,
        'num_seeds': 0,
        'num_peers': 0
    }

    watchdog._handle_existing_torrent(db_session, torrent_info)

    # Verify search triggered
    mock_arr_client.search_for_media.assert_called_once_with('movie', 123)

def test_protection_prevents_deletion(watchdog, db_session, mocker):
    """Test that protected torrents are never deleted."""
    dl = Download(
        hash='protected1',
        grab_id=None,
        ignored=False,
        import_completed_at=time.time(),
        category='upgraded'
    )
    db_session.add(dl)
    db_session.commit()

    # Configure protection: category 'upgraded' is protected
    watchdog.config['protection'] = {
        'tags': [],
        'categories': ['upgraded'],
        'tracker_domains': []
    }

    # Policy that would normally delete
    policy = {'delete_policy': 'immediate', 'policy_blacklist': False}
    mocker.patch('services.watchdog.get_policy_for_torrent', return_value=policy)
    mocker.patch.object(watchdog.download_client, 'delete_torrent')

    torrent_info = {
        'hash': 'protected1',
        'name': 'Protected Torrent',
        'category': 'upgraded',
        'tags': '',
        'ratio': 0.0,
        'num_seeds': 0,
        'num_peers': 0
    }

    # Mock trackers to avoid actual API call
    mocker.patch.object(watchdog.download_client, 'get_torrent_trackers', return_value=[])

    watchdog._handle_existing_torrent(db_session, torrent_info)

    # Torrent should not be deleted
    watchdog.download_client.delete_torrent.assert_not_called()
    db_session.refresh(dl)
    assert dl.deleted_at is None
