import logging
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

class ArrClient:
    """Base client for *Arr APIs (Sonarr, Radarr, Lidarr)."""

    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        """
        Args:
            base_url: e.g., "http://sonarr:8989"
            api_key: API key from the *Arr settings
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        session = requests.Session()
        session.headers.update({"X-Api-Key": self.api_key})
        retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
        session.mount('http://', HTTPAdapter(max_retries=retries))
        session.mount('https://', HTTPAdapter(max_retries=retries))
        return session

    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Make an API request and return JSON response."""
        url = f"{self.base_url}{endpoint}"
        try:
            resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
            resp.raise_for_status()
            if resp.status_code == 204:  # No content
                return None
            return resp.json()
        except requests.exceptions.RequestException as e:
            logger.error("{bold}ArrClient{reset} {red}[ERROR]{reset} %s %s: %s", method, url, e)
            return None

    def get(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """GET request."""
        return self._request("GET", endpoint, params=params)

    def post(self, endpoint: str, data: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """POST request."""
        return self._request("POST", endpoint, json=data)

    def delete(self, endpoint: str, params: Optional[Dict] = None) -> bool:
        """DELETE request, returns True if successful (2xx)."""
        url = f"{self.base_url}{endpoint}"
        try:
            resp = self.session.delete(url, timeout=self.timeout, params=params)
            resp.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            logger.error("{bold}ArrClient{reset} {red}[ERROR]{reset} DELETE %s: %s", url, e)
            return False

    def health(self) -> bool:
        """
        Check if the *Arr service is reachable and API key is valid.
        Uses `/system/status` endpoint (common across all *Arr apps).
        """
        status = self.get("/system/status")
        if status and "version" in status:
            logger.debug("{bold}ArrClient{reset} Health check OK for %s (version %s)", self.base_url, status["version"])
            return True
        return False

    # Common endpoints that work for all *Arr (override if needed)
    def get_queue(self, include_unknown: bool = True) -> Optional[List[Dict]]:
        """Get download queue."""
        params = {"includeUnknown": "true" if include_unknown else "false"}
        result = self.get("/queue", params=params)
        return result.get("records") if result else None

    def get_history(self, page: int = 1, page_size: int = 50) -> Optional[List[Dict]]:
        """Get history (grabs, downloads, failures)."""
        params = {"page": page, "pageSize": page_size}
        result = self.get("/history", params=params)
        return result.get("records") if result else None

    def reject_release(self, release_title: str, download_client: str = "qBittorrent", reason: str = "Blacklisted by Endarr") -> bool:
        """Push a rejected release back to *Arr."""
        payload = {
            "releaseTitle": release_title,
            "downloadClient": download_client,
            "rejected": True,
            "rejections": [reason]
        }
        result = self.post("/release/push", data=payload)
        if result is not None:
            logger.info("{bold}ArrClient{reset} Rejected release {cyan}%s{reset} for %s", release_title, self.base_url)
        else:
            logger.warning("{bold}ArrClient{reset} Failed to reject release {cyan}%s{reset}", release_title)
        return result is not None

    def search_for_media(self, media_type: str, media_id: int) -> bool:
        """Trigger a search based on media type (movie, series, album)."""
        if media_type == "movie":
            payload = {"name": "MoviesSearch", "movieIds": [media_id]}
            endpoint = "/command"
        elif media_type == "episode":
            # Sonarr uses SeriesSearch (searches all episodes of a series)
            payload = {"name": "SeriesSearch", "seriesId": media_id}
            endpoint = "/command"
        elif media_type == "album":
            payload = {"name": "AlbumSearch", "albumIds": [media_id]}
            endpoint = "/command"
        else:
            logger.warning("{bold}ArrClient{reset} Unknown media type {cyan}%s{reset}", media_type)
            return False
        result = self.post(endpoint, data=payload)
        if result is not None:
            logger.info("{bold}ArrClient{reset} Triggered search for %s ID %d on %s", media_type, media_id, self.base_url)
        return result is not None


class SonarrClient(ArrClient):
    """Sonarr API client (v3)."""

    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        super().__init__(base_url.rstrip('/'), api_key, timeout)
        self._api_version = "/api/v3"

    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        # Prepend API version to endpoint
        full_endpoint = f"{self._api_version}{endpoint}" if not endpoint.startswith("/api/") else endpoint
        return super()._request(method, full_endpoint, **kwargs)

    # Sonarr-specific methods can be added here


class RadarrClient(ArrClient):
    """Radarr API client (v3)."""

    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        super().__init__(base_url.rstrip('/'), api_key, timeout)
        self._api_version = "/api/v3"

    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        full_endpoint = f"{self._api_version}{endpoint}" if not endpoint.startswith("/api/") else endpoint
        return super()._request(method, full_endpoint, **kwargs)

    # Radarr-specific methods can be added here


class LidarrClient(ArrClient):
    """Lidarr API client (v1)."""

    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        super().__init__(base_url.rstrip('/'), api_key, timeout)
        self._api_version = "/api/v1"

    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        full_endpoint = f"{self._api_version}{endpoint}" if not endpoint.startswith("/api/") else endpoint
        return super()._request(method, full_endpoint, **kwargs)

    # Lidarr-specific methods can be added here
