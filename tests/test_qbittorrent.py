import pytest
import requests_mock

from services.qbittorrent import QBittorrentClient


@pytest.fixture
def download_client():
    return QBittorrentClient("localhost", 8080, "admin", "pass", timeout=5)

def test_login_success(download_client):
    with requests_mock.Mocker() as m:
        m.post("http://localhost:8080/api/v2/auth/login", text="Ok.")
        download_client._ensure_login()
        assert download_client._logged_in is True

def test_login_failure(download_client):
    with requests_mock.Mocker() as m:
        m.post("http://localhost:8080/api/v2/auth/login", text="Fails.")
        with pytest.raises(Exception):
            download_client._ensure_login()

def test_get_torrents(download_client):
    with requests_mock.Mocker() as m:
        m.post("http://localhost:8080/api/v2/auth/login", text="Ok.")
        m.get("http://localhost:8080/api/v2/torrents/info", json=[{"hash": "abc", "name": "test"}])
        torrents = download_client.get_torrents()
        assert len(torrents) == 1
        assert torrents[0]["hash"] == "abc"

def test_delete_torrent(download_client):
    with requests_mock.Mocker() as m:
        m.post("http://localhost:8080/api/v2/auth/login", text="Ok.")
        m.post("http://localhost:8080/api/v2/torrents/delete")
        download_client.delete_torrent("abc123", delete_files=True)
        assert m.call_count == 2  # login + delete
