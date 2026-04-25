# services/download_client.py
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional

class DownloadClient(ABC):
    """Abstract interface for torrent download clients."""

    @abstractmethod
    def get_torrents(self) -> List[Dict[str, Any]]:
        """Return list of all torrents with at least: hash, name, category, save_path, total_size, added_on, progress, state, ratio, seeding_time, upspeed, dlspeed, num_seeds, num_peers, tags."""
        pass

    @abstractmethod
    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Return list of files for a torrent with: name, size, progress."""
        pass

    @abstractmethod
    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        """Delete torrent from client."""
        pass

    @abstractmethod
    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        """Set or change torrent category/label."""
        pass

    @abstractmethod
    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Return list of trackers for a torrent (at least 'url' field)."""
        pass

    @abstractmethod
    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        """Find a torrent whose save_path matches the given path prefix."""
        pass