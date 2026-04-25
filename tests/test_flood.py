import pytest
from services.flood import FloodClient


def test_get_torrents(mocker):
    mock_session = mocker.patch('requests.Session')
    mock_instance = mock_session.return_value
    # Mock authentication
    mock_instance.post.return_value.raise_for_status.return_value = None
    # Mock torrent list
    mock_instance.request.return_value.json.return_value = [
        {
            'hash': 'abc123',
            'name': 'Test Torrent',
            'label': 'movies',
            'directory': '/downloads',
            'size_bytes': 1024,
            'date_added': 1234567890,
            'percent_complete': 50.0,
            'status': ['downloading'],
            'ratio': 0.5,
            'seeding_time': 3600,
            'upload_rate': 1024,
            'download_rate': 2048,
            'seeds_connected': 5,
            'peers_connected': 10,
            'tags': []
        }
    ]

    client = FloodClient('localhost', 3000, 'user', 'pass')
    torrents = client.get_torrents()

    assert len(torrents) == 1
    t = torrents[0]
    assert t['hash'] == 'abc123'
    assert t['name'] == 'Test Torrent'
    assert t['category'] == 'movies'


def test_delete_torrent(mocker):
    mock_session = mocker.patch('requests.Session')
    mock_instance = mock_session.return_value
    mock_instance.post.return_value.raise_for_status.return_value = None

    client = FloodClient('localhost', 3000, 'user', 'pass')
    client.delete_torrent('abc123', delete_files=True)

    mock_instance.request.assert_called_with(
        'DELETE',
        'http://localhost:3000/api/torrents',
        json={'hashes': ['abc123'], 'deleteData': True},
        timeout=10
    )