import pytest
from services.rtorrent import RTorrentClient


def test_get_torrents(mocker):
    mock_server = mocker.patch('xmlrpc.client.ServerProxy')
    mock_instance = mock_server.return_value
    # rTorrent multicall2 returns a list of lists
    mock_instance.d.multicall2.return_value = [
        ['abc123', 'Test Torrent', '/downloads', 1024, 1234567890, 500, 3, 500, 0, 0, 1024, 2048, 5, 10, 0, 0, '', '', '']
    ]

    client = RTorrentClient('localhost', 80)
    torrents = client.get_torrents()

    assert len(torrents) == 1
    t = torrents[0]
    assert t['hash'] == 'abc123'
    assert t['name'] == 'Test Torrent'
    assert t['progress'] == 0.5


def test_delete_torrent(mocker):
    mock_server = mocker.patch('xmlrpc.client.ServerProxy')
    mock_instance = mock_server.return_value

    client = RTorrentClient('localhost', 80)
    client.delete_torrent('abc123', delete_files=True)

    mock_instance.d.erase.assert_called_once_with('abc123')


def test_set_torrent_category(mocker):
    mock_server = mocker.patch('xmlrpc.client.ServerProxy')
    mock_instance = mock_server.return_value

    client = RTorrentClient('localhost', 80)
    client.set_torrent_category('abc123', 'movies')

    mock_instance.d.set_custom1.assert_called_once_with('abc123', 'movies')