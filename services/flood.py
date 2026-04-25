# services/flood.py
import logging
from typing import Any, Dict, List, Optional

import requests

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class FloodClient(DownloadClient):
    def __init__(
        self,
        host: str = "localhost",
        port: int = 3000,
        username: str = "",
        password: str = "",
        use_ssl: bool = False,
        timeout: int = 10,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self.timeout = timeout
        self._session = requests.Session()
        self._base_url = f"{'https' if use_ssl else 'http'}://{host}:{port}/api"
        self._authenticated = False

    def _authenticate(self):
        if self._authenticated:
            return
        resp = self._session.post(
            f"{self._base_url}/auth/authenticate",
            json={"username": self.username, "password": self.password},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        self._authenticated = True

    def _request(self, method, endpoint, **kwargs):
        self._authenticate()
        url = f"{self._base_url}/{endpoint}"
        resp = self._session.request(method, url, timeout=self.timeout, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def get_torrents(self) -> List[Dict[str, Any]]:
        data = self._request("GET", "torrents")
        result = []
        for t in data:
            result.append({
                "hash": t["hash"],
                "name": t["name"],
                "category": t.get("label", ""),
                "save_path": t["directory"],
                "total_size": t["size_bytes"],
                "added_on": t["date_added"],
                "progress": t["percent_complete"] / 100.0,
                "state": t["status"][0] if t["status"] else "unknown",
                "ratio": t["ratio"],
                "seeding_time": t["seeding_time"],
                "upspeed": t["upload_rate"],
                "dlspeed": t["download_rate"],
                "num_seeds": t["seeds_connected"],
                "num_peers": t["peers_connected"],
                "tags": t.get("tags", []),
            })
        return result

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        data = self._request("GET", f"torrents/{torrent_hash}/files")
        result = []
        for f in data:
            result.append({
                "name": f["path"],
                "size": f["size_bytes"],
                "progress": f["percent_complete"] / 100.0,
            })
        return result

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        self._request("DELETE", "torrents", json={
            "hashes": [torrent_hash],
            "deleteData": delete_files,
        })
        logger.info("{bold}Flood{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        self._request("PATCH", "torrents", json={
            "hashes": [torrent_hash],
            "label": category,
        })
        logger.info("{bold}Flood{reset} Set label of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        data = self._request("GET", f"torrents/{torrent_hash}/trackers")
        return [{"url": t["url"]} for t in data]

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None