"""Abstract base class for download client implementations."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class DownloadClient(ABC):
    """Abstract interface for torrent download clients.

    All concrete clients (qBittorrent, Transmission, Deluge, etc.) must implement
    these methods to provide a uniform API for Endarr.
    """

    @abstractmethod
    def get_torrents(self) -> List[Dict[str, Any]]:
        """Retrieve all torrents from the client.

        Returns:
            A list of dictionaries. Each dict must contain at least the following keys:
            hash, name, category, save_path, total_size, added_on, progress, state,
            ratio, seeding_time, upspeed, dlspeed, num_seeds, num_peers, tags.
        """
        pass

    @abstractmethod
    def get_torrent_files(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Retrieve the file list for a specific torrent.

        Args:
            torrent_hash: The hash of the torrent.

        Returns:
            A list of dictionaries, each with keys: name, size, progress.
        """
        pass

    @abstractmethod
    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        """Delete a torrent from the client.

        Args:
            torrent_hash: The hash of the torrent to delete.
            delete_files: If True, also delete the downloaded data.
        """
        pass

    @abstractmethod
    def set_torrent_category(self, torrent_hash: str, category: str) -> None:
        """Set or change the category/label of a torrent.

        Args:
            torrent_hash: The hash of the torrent.
            category: The new category name.
        """
        pass

    @abstractmethod
    def get_torrent_trackers(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Retrieve trackers for a torrent.

        Args:
            torrent_hash: The hash of the torrent.

        Returns:
            A list of dictionaries, each at least containing the key 'url'.
        """
        pass

    @abstractmethod
    def get_torrent_by_save_path(self, path: str) -> Optional[Dict[str, Any]]:
        """Find a torrent whose save path matches the given prefix.

        Args:
            path: The file path to match.

        Returns:
            The torrent dictionary if found, otherwise None.
        """
        pass