import pytest
from services.transmission import TransmissionClient


def test_get_torrents(mocker):
    mock_client = mocker.patch('transmission_rpc.Client')
    mock_instance = mock_client.return_value
    mock_torrent = mocker.Mock()
    mock_torrent.hashString = 'abc123'
    mock_torrent.name = 'Test Torrent'
    mock_torrent.download_dir = '/downloads'
    mock_torrent.total_size = 1024
    mock_torrent.added_date = mocker.Mock()
    mock_torrent.added_date.timestamp.return_value = 1234567890
    mock_torrent.progress = 50.0
    mock_torrent.status = 'downloading'
    mock_torrent.ratio = 0.5
    mock_torrent.seeding_time = 3600
    mock_torrent.rate_upload = 1024
    mock_torrent.rate_download = 2048
    mock_torrent.seeds_connected = 5
    mock_torrent.peers_connected = 10
    mock_torrent.labels = []
    mock_instance.get_torrents.return_value = [mock_torrent]

    client = TransmissionClient('localhost', 9091)
    torrents = client.get_torrents()

    assert len(torrents) == 1
    t = torrents[0]
    assert t['hash'] == 'abc123'
    assert t['name'] == 'Test Torrent'
    assert t['progress'] == 0.5
    assert t['save_path'] == '/downloads'


def test_delete_torrent(mocker):
    mock_client = mocker.patch('transmission_rpc.Client')
    mock_instance = mock_client.return_value

    client = TransmissionClient('localhost', 9091)
    client.delete_torrent('abc123', delete_files=True)

    mock_instance.remove_torrent.assert_called_once_with(ids=['abc123'], delete_data=True)


def test_get_torrent_files(mocker):
    mock_client = mocker.patch('transmission_rpc.Client')
    mock_instance = mock_client.return_value
    mock_instance.get_torrent_files.return_value = {
        'abc123': [
            {'name': 'file1.mkv', 'length': 1024, 'bytes_completed': 512},
            {'name': 'file2.nfo', 'length': 256, 'bytes_completed': 256}
        ]
    }

    client = TransmissionClient('localhost', 9091)
    files = client.get_torrent_files('abc123')

    assert len(files) == 2
    assert files[0]['name'] == 'file1.mkv'
    assert files[0]['progress'] == 0.5
    assert files[1]['progress'] == 1.0