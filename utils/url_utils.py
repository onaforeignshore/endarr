"""URL extraction utilities."""

from urllib.parse import urlparse


def extract_domain(url: str) -> str:
    """Extract domain from a URL.

    Supports http, https, udp, and other protocols.

    Args:
        url: The full URL string.

    Returns:
        Domain name without port number, or empty string if URL is empty.
    """
    if not url:
        return ""
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path
    if ':' in domain:
        domain = domain.split(':')[0]
    return domain