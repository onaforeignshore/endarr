import pytest
import time
from models.blacklist import Blacklist
from models.downloads import Download
from models.grabs import Grab


@pytest.fixture
def client(app, db_session, mocker, temp_config_file):
    app.config["ENDARR_CONFIG"] = {"webhook_key": "testkey"}
    # Use the temporary config file created by temp_config_file fixture
    import os
    os.environ["ENDARR_CONFIG_PATH"] = temp_config_file
    # Mock download client instances
    mock_download = mocker.Mock()
    app.config["CLIENT_INSTANCES_BY_NAME"] = {"qb_1": mock_download}
    app.config["CLIENT_INSTANCES"] = [mock_download]
    # Replace SessionLocal with db_session fixture
    mocker.patch("webhook.arr_handler.SessionLocal", return_value=db_session)
    return app.test_client()


def test_webhook_no_apikey(client):
    resp = client.post("/arr", json={"eventType": "Test"})
    assert resp.status_code == 401


def test_webhook_invalid_apikey(client):
    resp = client.post("/arr?apikey=wrong", json={"eventType": "Test"})
    assert resp.status_code == 401


def test_webhook_test_event(client):
    resp = client.post("/arr?apikey=testkey", json={"eventType": "Test", "movie": {"id": 1}})
    assert resp.status_code == 200
    assert resp.json == {"status": "ignored"}


def test_webhook_grab_radarr(client, db_session):
    payload = {
        "eventType": "Grab",
        "movie": {"id": 123, "title": "Test Movie"},
        "release": {"releaseTitle": "Test.Movie.2024.1080p"},
        "indexer": "RARBG",
        "quality": "1080p",
        "size": 123456
    }
    resp = client.post("/arr?apikey=testkey", json=payload)
    assert resp.status_code == 200
    assert resp.json == {"status": "grabbed"}
    # Check database
    grab = db_session.query(Grab).first()
    assert grab.release_title == "Test.Movie.2024.1080p"
    assert grab.arr_name == "radarr"


def test_webhook_grab_blacklisted(client, db_session):
    # Insert blacklist
    blacklist = Blacklist(release_title="Test.Movie.2024.1080p", reason="test", blocked_at=123)
    db_session.add(blacklist)
    db_session.commit()
    payload = {
        "eventType": "Grab",
        "movie": {"id": 123},
        "release": {"releaseTitle": "Test.Movie.2024.1080p"}
    }
    resp = client.post("/arr?apikey=testkey", json=payload)
    assert resp.status_code == 200
    assert resp.json == {"status": "blacklisted"}


def test_webhook_download(client, db_session, mocker):
    """Test Download event marks import_completed_at."""
    # Insert a download
    dl = Download(hash='abc123', grab_id=None, ignored=False)
    db_session.add(dl)
    db_session.commit()

    payload = {
        'eventType': 'Download',
        'downloadId': 'abc123',
        'movie': {'id': 1},
        'isUpgrade': False
    }
    resp = client.post('/arr?apikey=testkey', json=payload)
    assert resp.status_code == 200
    assert resp.json == {'status': 'ok'}

    # Re‑query to get updated state
    updated_dl = db_session.query(Download).filter_by(hash='abc123').first()
    assert updated_dl.import_completed_at is not None


def test_webhook_grab_blacklisted_rejects_release(client, db_session, mocker):
    """Test that a blacklisted grab triggers rejection via ArrClient."""
    # Insert blacklist entry
    blacklist = Blacklist(
        release_title='Blacklisted.Movie.2024.1080p',
        reason='test',
        blocked_at=123
    )
    db_session.add(blacklist)
    db_session.commit()

    # Mock ArrClient reject_release method
    mock_arr_client = mocker.Mock()
    mock_arr_client.reject_release.return_value = True
    client.application.config['ARR_CLIENTS'] = {'radarr': mock_arr_client}

    payload = {
        'eventType': 'Grab',
        'movie': {'id': 123, 'title': 'Blacklisted Movie'},
        'release': {'releaseTitle': 'Blacklisted.Movie.2024.1080p'},
        'indexer': 'RARBG',
        'quality': '1080p',
        'size': 123456
    }
    resp = client.post('/arr?apikey=testkey', json=payload)
    assert resp.status_code == 200
    assert resp.json == {'status': 'blacklisted'}

    # Verify reject_release was called
    mock_arr_client.reject_release.assert_called_once_with(
        'Blacklisted.Movie.2024.1080p',
        reason='Blacklisted: test'
    )


def test_webhook_download_upgrade_delete_immediate(client, db_session, mocker):
    import time

    # Old download with a grab
    old_grab = Grab(
        release_title='Old Movie',
        arr_name='radarr',
        media_id='123',
        media_type='movie',
        grabbed_at=time.time()
    )
    db_session.add(old_grab)
    db_session.commit()

    old_dl = Download(
        hash='old123',
        grab_id=old_grab.id,
        ignored=False,
        category='movies',
        client_id='qb_1'
    )
    db_session.add(old_dl)
    db_session.commit()

    # New download – different grab
    new_grab = Grab(
        release_title='New Movie',
        arr_name='radarr',
        media_id='123',
        media_type='movie',
        grabbed_at=time.time()
    )
    db_session.add(new_grab)
    db_session.commit()

    new_dl = Download(
        hash='new456',
        grab_id=new_grab.id,
        ignored=False,
        client_id='qb_1'
    )
    db_session.add(new_dl)
    db_session.commit()

    # Mock policy
    policy = {'upgrade_action': 'delete_immediate', 'upgrade_category': 'upgraded'}
    mocker.patch('webhook.arr_handler.get_policy_for_torrent', return_value=policy)
    
    # The client fixture already sets CLIENT_INSTANCES_BY_NAME with qb_1
    mock_download = client.application.config['CLIENT_INSTANCES_BY_NAME']['qb_1']

    payload = {
        'eventType': 'Download',
        'downloadId': 'new456',
        'movie': {'id': 123},
        'isUpgrade': True
    }
    resp = client.post('/arr?apikey=testkey', json=payload)
    assert resp.status_code == 200

    mock_download.delete_torrent.assert_called_once_with('old123', delete_files=True)

    updated_old = db_session.query(Download).filter_by(hash='old123').first()
    assert updated_old.deleted_at is not None
    assert updated_old.delete_reason == 'upgraded'