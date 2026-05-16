"""uTorrent client implementation (web API)."""

import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class UTorrentClient(DownloadClient):
    """uTorrent Web API client."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8080,
        username: str = "",
        password: str = "",
        use_ssl: bool = False,
        timeout: int = 10,
    ) -> None:
        """Initialise the uTorrent client.

        Args:
            host: Hostname or IP address.
            port: Port number (default 8080).
            username: Username for authentication.
            password: Password for authentication.
            use_ssl: Use HTTPS if True.
            timeout: Request timeout in seconds.
        """
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self.timeout = timeout
        self._token = None
        self._cookies = None
        self._session = requests.Session()

    def _build_url(self, path: str) -> str:
        """Build full URL for uTorrent API.

        Args:
            path: API endpoint (e.g., "token.html").

        Returns:
            Full URL.
        """
        protocol = "https" if self.use_ssl else "http"
        base = f"{protocol}://{self.host}:{self.port}/gui/"
        return urljoin(base, path)

    def _get_token(self) -> str:
        """Retrieve authentication token from uTorrent.

        Returns:
            Token string.

        Raises:
            Exception: If token cannot be extracted.
        """
        url = self._build_url("token.html")
        resp = self._session.get(url, auth=(self.username, self.password), timeout=self.timeout)
        resp.raise_for_status()
        match = re.search(r"<div[^>]*id=[\"']token[\"'][^>]*>([^<]+)</div>", resp.text)
        if match:
            self._token = match.group(1)
            return self._token
        raise Exception("Could not extract uTorrent token")

    def _request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make an authenticated API request.

        Args:
            params: Query parameters for the request.

        Returns:
            JSON response as dictionary.
        """
        if self._token is None:
            self._get_token()
        params["token"] = self._token
        url = self._build_url("")
        resp = self._session.get(url, params=params, auth=(self.username, self.password), timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def get_torrents(self) -> List[Dict[str, Any]]:
        """Fetch all torrents from uTorrent.

        Returns:
            List of torrent dictionaries with standardised keys.
        """
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

    @staticmethod
    def _map_state(status: int, progress: int) -> str:
        """Map uTorrent status flags to a state string.

        Args:
            status: Status bitmask.
            progress: Progress thousandths.

        Returns:
            State string.
        """
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
        """Get file list for a torrent.

        Args:
            torrent_hash: Hash of the torrent.

        Returns:
            List of file dictionaries with keys: name, size, progress.
        """
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
        """Delete a torrent.

        Args:
            torrent_hash: Hash of the torrent.
            delete_files: If True, also delete data.
        """
        action = "removedata" if delete_files else "remove"
        self._request({"action": action, "hash": torrent_hash})
        logger.info("{bold}uTorrent{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        """Set label (category) for a torrent.

        Args:
            torrent_hash: Hash of the torrent.
            category: Category name.
        """
        self._request({"action": "setprops", "hash": torrent_hash, "s": "label", "v": category})
        logger.info("{bold}uTorrent{reset} Set label of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Get tracker list for a torrent.

        Args:
            torrent_hash: Hash of the torrent.

        Returns:
            List of tracker dictionaries with 'url' key.
        """
        data = self._request({"action": "getprops", "hash": torrent_hash})
        props = data.get("props", [])
        for prop in props:
            if prop.get("name") == "trackers":
                trackers_str = prop.get("value", "")
                return [{"url": url.strip()} for url in trackers_str.split("\r\n") if url.strip()]
        return []

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        """Find torrent by save path.

        Args:
            path: File path prefix.

        Returns:
            Torrent dictionary if found, else None.
        """
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None