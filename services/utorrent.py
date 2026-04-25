# services/utorrent.py
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class UTorrentClient(DownloadClient):
    def __init__(
        self,
        host: str = "localhost",
        port: int = 8080,
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
        self._token = None
        self._cookies = None
        self._session = requests.Session()

    def _get_token(self):
        url = self._build_url("token.html")
        resp = self._session.get(url, auth=(self.username, self.password), timeout=self.timeout)
        resp.raise_for_status()
        # Extract token from HTML
        import re
        match = re.search(r"<div[^>]*id=[\"']token[\"'][^>]*>([^<]+)</div>", resp.text)
        if match:
            self._token = match.group(1)
        else:
            raise Exception("Could not extract uTorrent token")
        return self._token

    def _build_url(self, path):
        protocol = "https" if self.use_ssl else "http"
        base = f"{protocol}://{self.host}:{self.port}/gui/"
        return urljoin(base, path)

    def _request(self, params):
        if self._token is None:
            self._get_token()
        params["token"] = self._token
        url = self._build_url("")
        resp = self._session.get(url, params=params, auth=(self.username, self.password), timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def get_torrents(self) -> List[Dict[str, Any]]:
        data = self._request({"list": 1})
        torrents = data.get("torrents", [])
        result = []
        for t in torrents:
            result.append({
                "hash": t[0],
                "name": t[2],
                "category": t[24] if len(t) > 24 else "",
                "save_path": t[26] if len(t) > 26 else "",
                "total_size": t[3],
                "added_on": t[1],
                "progress": t[4] / 1000.0,
                "state": self._map_state(t[1], t[4]),
                "ratio": t[7] / 1000.0 if t[7] else 0,
                "seeding_time": 0,
                "upspeed": t[8],
                "dlspeed": t[9],
                "num_seeds": t[15],
                "num_peers": t[14],
                "tags": [],
            })
        return result

    def _map_state(self, status, progress):
        # uTorrent status codes
        if status & 1:
            return "started"
        if status & 2:
            return "checking"
        if status & 4:
            return "downloading" if progress < 1000 else "seeding"
        if status & 8:
            return "error"
        if status & 16:
            return "paused"
        if status & 32:
            return "queued"
        return "stopped"

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        data = self._request({"action": "getfiles", "hash": torrent_hash})
        files = data.get("files", [])
        result = []
        for f in files:
            result.append({
                "name": f[0],
                "size": f[1],
                "progress": f[2] / 1000.0 if f[2] else 0,
            })
        return result

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        action = "removedata" if delete_files else "remove"
        self._request({"action": action, "hash": torrent_hash})
        logger.info("{bold}uTorrent{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        self._request({"action": "setprops", "hash": torrent_hash, "s": "label", "v": category})
        logger.info("{bold}uTorrent{reset} Set label of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        data = self._request({"action": "getprops", "hash": torrent_hash})
        props = data.get("props", [])
        for prop in props:
            if prop.get("name") == "trackers":
                trackers_str = prop.get("value", "")
                return [{"url": url.strip()} for url in trackers_str.split("\r\n") if url.strip()]
        return []

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None