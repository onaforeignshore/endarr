# services/rtorrent.py
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import xmlrpc.client

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class RTorrentClient(DownloadClient):
    def __init__(
        self,
        host: str = "localhost",
        port: int = 80,
        rpc_path: str = "/RPC2",
        username: str = "",
        password: str = "",
        use_ssl: bool = False,
        timeout: int = 10,
    ):
        self.host = host
        self.port = port
        self.rpc_path = rpc_path
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self.timeout = timeout
        self._server = None

    def _connect(self) -> xmlrpc.client.ServerProxy:
        if self._server is not None:
            return self._server
        protocol = "https" if self.use_ssl else "http"
        url = f"{protocol}://{self.host}:{self.port}{self.rpc_path}"
        if self.username and self.password:
            # rTorrent doesn't support HTTP auth natively; usually behind web server.
            # We'll assume no auth or handled by reverse proxy.
            pass
        try:
            self._server = xmlrpc.client.ServerProxy(url, transport=xmlrpc.client.Transport(), verbose=False)
            # Test connection
            self._server.system.listMethods()
            logger.debug("{bold}rTorrent{reset} Connected to {cyan}%s{reset}", url)
            return self._server
        except Exception as e:
            logger.error("{bold}rTorrent{reset} {red}[ERROR]{reset} Connection failed: %s", e)
            raise

    def _get_torrent_fields(self):
        return [
            "d.hash=", "d.name=", "d.directory=", "d.size_bytes=", "d.timestamp.started=",
            "d.complete=", "d.state=", "d.ratio=", "d.up.total=", "d.down.total=",
            "d.up.rate=", "d.down.rate=", "d.peers_complete=", "d.peers_accounted=",
            "d.is_active=", "d.is_open=", "d.message=", "d.custom1=", "d.custom=",
        ]

    def get_torrents(self) -> List[Dict[str, Any]]:
        server = self._connect()
        try:
            result = server.d.multicall2("", "", *self._get_torrent_fields())
        except Exception as e:
            logger.error("rTorrent multicall failed: %s", e)
            return []
        torrents = []
        for t in result:
            torrents.append({
                "hash": t[0],
                "name": t[1],
                "save_path": t[2],
                "total_size": t[3],
                "added_on": t[4],
                "progress": t[5] / 1000.0 if t[5] else 0,
                "state": self._map_state(t[6]),
                "ratio": float(t[7]) / 1000.0 if t[7] else 0,
                "seeding_time": 0,
                "upspeed": t[10],
                "dlspeed": t[11],
                "num_seeds": t[12],
                "num_peers": t[13],
                "tags": [],
                "category": "",
            })
        return torrents

    def _map_state(self, state: int) -> str:
        states = {
            0: "stopped",
            1: "checking",
            2: "checking",
            3: "downloading",
            4: "downloading",
            5: "seeding",
            6: "seeding",
        }
        return states.get(state, "unknown")

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        server = self._connect()
        try:
            files = server.f.multicall(torrent_hash, 0, "f.path=", "f.size_bytes=", "f.completed_chunks=", "f.size_chunks=")
        except Exception as e:
            logger.error("rTorrent file list failed: %s", e)
            return []
        result = []
        for f in files:
            progress = (f[2] / f[3]) if f[3] else 0
            result.append({
                "name": f[0],
                "size": f[1],
                "progress": progress,
            })
        return result

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        server = self._connect()
        if delete_files:
            server.d.erase(torrent_hash)
        else:
            server.d.stop(torrent_hash)
            server.d.close(torrent_hash)
        logger.info("{bold}rTorrent{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        # rTorrent doesn't have built-in categories; we can use custom1 field for label
        server = self._connect()
        server.d.set_custom1(torrent_hash, category)
        logger.info("{bold}rTorrent{reset} Set label of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        server = self._connect()
        try:
            trackers = server.t.multicall(torrent_hash, "", "t.url=")
        except Exception:
            return []
        return [{"url": t} for t in trackers]

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None