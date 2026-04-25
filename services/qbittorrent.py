# services/qbittorrent.py
import logging
import time
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)

class QBittorrentClient(DownloadClient):
    def __init__(self, host: str, port: int, username: str, password: str, timeout: int = 10):
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self.username = username
        self.password = password
        self.timeout = timeout
        self.session = self._create_session()
        self._logged_in = False

    def _create_session(self) -> requests.Session:
        session = requests.Session()
        retries = Retry(total=2, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
        session.mount('http://', HTTPAdapter(max_retries=retries))
        return session

    def _ensure_login(self):
        if self._logged_in:
            return
        try:
            resp = self.session.post(
                f"{self.base_url}/api/v2/auth/login",
                data={"username": self.username, "password": self.password},
                timeout=self.timeout
            )
            resp.raise_for_status()
            if resp.text.strip() == "Ok.":
                self._logged_in = True
                logger.debug("{bold}QBittorrent{reset} Login successful")
            else:
                raise Exception("Login failed")
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} {red}[ERROR]{reset} Login error: %s", e)
            raise

    def get_torrents(self) -> List[Dict[str, Any]]:
        self._ensure_login()
        try:
            resp = self.session.get(f"{self.base_url}/api/v2/torrents/info", timeout=self.timeout)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} Failed to fetch torrents: %s", e)
            raise

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        self._ensure_login()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v2/torrents/files",
                params={"hash": torrent_hash},
                timeout=self.timeout
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} Failed to fetch files for {cyan}%s{reset}: %s", torrent_hash, e)
            raise

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False):
        self._ensure_login()
        try:
            resp = self.session.post(
                f"{self.base_url}/api/v2/torrents/delete",
                data={"hashes": torrent_hash, "deleteFiles": "true" if delete_files else "false"},
                timeout=self.timeout
            )
            resp.raise_for_status()
            logger.info("{bold}QBittorrent{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)", torrent_hash, delete_files)
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} Failed to delete {cyan}%s{reset}: %s", torrent_hash, e)
            raise

    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("save_path") and path.startswith(t["save_path"]):
                return t
        return None

    def set_torrent_category(self, torrent_hash: str, category: str):
        self._ensure_login()
        try:
            resp = self.session.post(
                f"{self.base_url}/api/v2/torrents/setCategory",
                data={"hashes": torrent_hash, "category": category},
                timeout=self.timeout
            )
            resp.raise_for_status()
            logger.info("{bold}QBittorrent{reset} Set category of {cyan}%s{reset} to {cyan}%s{reset}", torrent_hash, category)
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} Failed to set category for {cyan}%s{reset}: %s", torrent_hash, e)
            raise

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        self._ensure_login()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v2/torrents/trackers",
                params={"hash": torrent_hash},
                timeout=self.timeout
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error("{bold}QBittorrent{reset} Failed to fetch trackers for {cyan}%s{reset}: %s", torrent_hash, e)
            raise
