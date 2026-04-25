import pytest

from services.deluge import DelugeClient


@pytest.fixture
def mock_deluge_client(mocker):
    """Mock the _connect method of DelugeClient to return a MagicMock."""
    mock_connection = mocker.MagicMock()
    mocker.patch.object(DelugeClient, '_connect', return_value=mock_connection)
    return mock_connection


def test_get_torrents(mock_deluge_client):
    mock_deluge_client.call.return_value = {
        b'abc123': {
            b'hash': b'abc123',
            b'name': b'Test Torrent',
            b'save_path': b'/downloads',
            b'total_size': 1024,
            b'time_added': 1234567890,
            b'progress': 50.0,
            b'state': b'Downloading',
            b'ratio': 0.5,
            b'seeding_time': 3600,
            b'upload_payload_rate': 1024,
            b'download_payload_rate': 2048,
            b'num_seeds': 5,
            b'num_peers': 10,
            b'label': b'movies'
        }
    }

    client = DelugeClient('localhost', 58846, 'user', 'pass')
    torrents = client.get_torrents()

    assert len(torrents) == 1
    t = torrents[0]
    assert t['hash'] == b'abc123'
    assert t['name'] == 'Test Torrent'
    assert t['category'] == 'movies'


def test_delete_torrent(mock_deluge_client):
    client = DelugeClient('localhost', 58846, 'user', 'pass')
    client.delete_torrent('abc123', delete_files=True)

    mock_deluge_client.call.assert_called_with('core.remove_torrent', 'abc123', True)


def test_set_torrent_category(mock_deluge_client):
    client = DelugeClient('localhost', 58846, 'user', 'pass')
    client.set_torrent_category('abc123', 'movies')

    mock_deluge_client.call.assert_called_with('core.set_torrent_label', 'abc123', 'movies')
