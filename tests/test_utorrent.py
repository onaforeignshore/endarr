import pytest
from services.utorrent import UTorrentClient


def test_get_torrents(mocker):
    mock_session = mocker.patch('requests.Session')
    mock_instance = mock_session.return_value
    # Mock token fetch
    mock_instance.get.return_value.text = '<div id="token">abc123</div>'
    # Mock torrent list
    mock_instance.get.return_value.json.return_value = {
        'torrents': [
            ['abc123', 1234567890, 'Test Torrent', 1024, 500, 0, 0, 500, 1024, 2048, 0, 0, 0, 0, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0, 'movies', '', '/downloads']
        ]
    }

    client = UTorrentClient('localhost', 8080, 'user', 'pass')
    torrents = client.get_torrents()

    assert len(torrents) == 1
    t = torrents[0]
    assert t['hash'] == 'abc123'
    assert t['name'] == 'Test Torrent'
    assert t['category'] == 'movies'


def test_delete_torrent(mocker):
    mock_session = mocker.patch('requests.Session')
    mock_instance = mock_session.return_value
    mock_instance.get.return_value.text = '<div id="token">abc123</div>'

    client = UTorrentClient('localhost', 8080, 'user', 'pass')
    client.delete_torrent('abc123', delete_files=True)

    mock_instance.get.assert_called_with(
        'http://localhost:8080/gui/',
        params={'action': 'removedata', 'hash': 'abc123', 'token': 'abc123'},
        auth=('user', 'pass'),
        timeout=10
    )