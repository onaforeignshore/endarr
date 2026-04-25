# services/deluge.py
import logging
from typing import Any, Dict, List, Optional
from base64 import b64encode

from deluge_client import DelugeRPCClient

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class DelugeClient(DownloadClient):
    def __init__(
        self,
        host: str = "localhost",
        port: int = 58846,
        username: str = "",
        password: str = "",
        timeout: int = 10,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.timeout = timeout
        self._client = None

    def _connect(self) -> DelugeRPCClient:
        if self._client is not None:
            return self._client
        try:
            self._client = DelugeRPCClient(
                self.host, self.port, self.username, self.password, timeout=self.timeout
            )
            self._client.connect()
            logger.debug("{bold}Deluge{reset} Connected to {cyan}%s:%d{reset}", self.host, self.port)
            return self._client
        except Exception as e:
            logger.error("{bold}Deluge{reset} {red}[ERROR]{reset} Connection failed: %s", e)
            raise

    def get_torrents(self) -> List[Dict[str, Any]]:
        client = self._connect()
        torrents = client.call("core.get_torrents_status", {}, [
            "hash", "name", "save_path", "total_size", "time_added", "progress",
            "state", "ratio", "seeding_time", "upload_payload_rate", "download_payload_rate",
            "num_seeds", "num_peers", "label", "tracker_host"
        ])
        result = []
        for h, t in torrents.items():
            result.append({
                "hash": h,
                "name": t.get(b"name", b"").decode(),
                "category": t.get(b"label", b"").decode(),
                "save_path": t.get(b"save_path", b"").decode(),
                "total_size": t.get(b"total_size", 0),
                "added_on": t.get(b"time_added", 0),
                "progress": t.get(b"progress", 0) / 100.0,
                "state": t.get(b"state", b"").decode(),
                "ratio": t.get(b"ratio", 0.0),
                "seeding_time": t.get(b"seeding_time", 0),
                "upspeed": t.get(b"upload_payload_rate", 0),
                "dlspeed": t.get(b"download_payload_rate", 0),
                "num_seeds": t.get(b"num_seeds", 0),
                "num_peers": t.get(b"num_peers", 0),
                "tags": [],
            })
        return result

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        client = self._connect()
        files = client.call("core.get_torrent_status", torrent_hash, ["files"])
        result = []
        for f in files.get(b"files", []):
            result.append({
                "name": f[b"path"].decode(),
                "size": f[b"size"],
                "progress": f[b"progress"] / 100.0,
            })
        return result

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        client = self._connect()
        client.call("core.remove_torrent", torrent_hash, delete_files)
        logger.info("{bold}Deluge{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        client = self._connect()
        client.call("core.set_torrent_label", torrent_hash, category)
        logger.info("{bold}Deluge{reset} Set label of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        client = self._connect()
        status = client.call("core.get_torrent_status", torrent_hash, ["trackers"])
        trackers = []
        for t in status.get(b"trackers", []):
            trackers.append({"url": t[b"url"].decode()})
        return trackers

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None