"""Release title normalisation utilities."""

import re

# Common scene groups that often appear as "-GROUP" at the end
SCENE_GROUPS = r'\b(?:EVO|TGx|RARBG|NTb|NTG|ETHEL|EDITH|AMZN|TEPES|YTS|MX|YIFY|RZeroX|PSA|OFT|COiN)\b'


def normalize_release_title(title: str) -> str:
    """Normalise a release title for comparison.

    Removes common prefixes, brackets, scene group suffixes, and normalises spaces.

    Args:
        title: The original release title.

    Returns:
        Normalised title in lowercase with spaces instead of dots/underscores.
    """
    # Remove leading website prefixes (e.g., "www.Torrenting.com - ")
    title = re.sub(r'^[\w.-]+\.[a-z]{2,}\s*-\s*', '', title, flags=re.IGNORECASE)

    # Remove bracketed suffixes like [UIndex.org] or [TGx]
    title = re.sub(r'\[.*?\]', '', title)

    # Remove scene group tags that appear after a dash at the end of the title
    # Example: "Movie.Name.2024.1080p-EVO" -> "Movie.Name.2024.1080p"
    title = re.sub(rf'[-_.]\s*{SCENE_GROUPS}\s*$', '', title, flags=re.IGNORECASE)

    # Replace dots and underscores with spaces
    title = title.replace('.', ' ').replace('_', ' ')

    # Collapse multiple spaces
    title = re.sub(r'\s+', ' ', title)

    return title.strip().lower()
