"""Transmission client implementation."""

import logging
from typing import Any, Dict, List, Optional

import transmission_rpc

from services.download_client import DownloadClient

logger = logging.getLogger(__name__)


class TransmissionClient(DownloadClient):
    """Transmission RPC client."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 9091,
        username: str = "",
        password: str = "",
        timeout: int = 10,
    ) -> None:
        """Initialise the Transmission client.

        Args:
            host: Hostname or IP address.
            port: Port number (default 9091).
            username: Username for authentication (optional).
            password: Password for authentication (optional).
            timeout: Request timeout in seconds.
        """
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.timeout = timeout
        self._client = None

    def _connect(self) -> transmission_rpc.Client:
        """Establish a connection to Transmission RPC.

        Returns:
            Connected Transmission client instance.

        Raises:
            Exception: If connection fails.
        """
        if self._client is not None:
            return self._client
        try:
            self._client = transmission_rpc.Client(
                host=self.host,
                port=self.port,
                username=self.username or None,
                password=self.password or None,
                timeout=self.timeout,
            )
            # Test connection
            self._client.get_session()
            logger.debug(
                "{bold}Transmission{reset} Connected to {cyan}%s:%d{reset}",
                self.host,
                self.port,
            )
            return self._client
        except Exception as e:
            logger.error("{bold}Transmission{reset} {red}[ERROR]{reset} Connection failed: %s", e)
            raise

    def get_torrents(self) -> List[Dict[str, Any]]:
        """Fetch all torrents from Transmission.

        Returns:
            List of torrent dictionaries with standardised keys.
        """
        client = self._connect()
        torrents = client.get_torrents()
        result = []
        for t in torrents:
            result.append({
                "hash": t.hashString,
                "name": t.name,
                "category": "",  # Transmission doesn't have categories
                "save_path": t.download_dir,
                "total_size": t.total_size,
                "added_on": t.added_date.timestamp(),
                "progress": t.progress / 100.0,
                "state": t.status,
                "ratio": t.ratio,
                "seeding_time": t.seeding_time,
                "upspeed": t.rate_upload,
                "dlspeed": t.rate_download,
                "num_seeds": t.seeds_connected,
                "num_peers": t.peers_connected,
                "tags": t.labels if hasattr(t, "labels") else [],
            })
        return result

    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Get file list for a torrent.

        Args:
            torrent_hash: Hash of the torrent.

        Returns:
            List of file dictionaries with keys: name, size, progress.
        """
        client = self._connect()
        files = client.get_torrent_files(ids=[torrent_hash])
        result = []
        for file_id, file_info in files.items():
            for f in file_info:
                result.append({
                    "name": f["name"],
                    "size": f["length"],
                    "progress": f["bytes_completed"] / f["length"] if f["length"] else 0.0,
                })
        return result

    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        """Delete a torrent.

        Args:
            torrent_hash: Hash of the torrent.
            delete_files: If True, also delete data.
        """
        client = self._connect()
        client.remove_torrent(ids=[torrent_hash], delete_data=delete_files)
        logger.info(
            "{bold}Transmission{reset} Deleted torrent {cyan}%s{reset} (delete_files=%s)",
            torrent_hash,
            delete_files,
        )

    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        """Set torrent category (not natively supported in Transmission).

        Args:
            torrent_hash: Hash of the torrent.
            category: Category name (ignored).
        """
        logger.debug(
            "{bold}Transmission{reset} Category setting not supported; ignoring %s -> %s",
            torrent_hash,
            category,
        )

    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Get tracker list for a torrent.

        Args:
            torrent_hash: Hash of the torrent.

        Returns:
            List of tracker dictionaries with 'url' key.
        """
        client = self._connect()
        trackers = client.get_torrent_trackers(ids=[torrent_hash])
        result = []
        for t in trackers.get(torrent_hash, []):
            result.append({"url": t["announce"]})
        return result

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