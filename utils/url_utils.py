# utils/url_utils.py
from urllib.parse import urlparse

def extract_domain(url: str) -> str:
    """Extract domain from a URL (supports http, https, udp, etc.)."""
    if not url:
        return ""
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path
    if ':' in domain:
        domain = domain.split(':')[0]
    return domain