"""Logging configuration for Endarr.

Provides coloured console output and rotating file logs.
Log level can be controlled via environment variable or API.
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional

# ANSI color codes
COLORS = {
    "grey": "\033[37m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "red": "\033[31m",
    "cyan": "\033[36m",
    "bold": "\033[1m",
    "reset": "\033[0m",
}


class ColouredFormatter(logging.Formatter):
    """Custom log formatter with ANSI colour codes and {key} substitution."""

    level_colors = {
        logging.INFO: COLORS["green"],
        logging.WARNING: COLORS["yellow"],
        logging.ERROR: COLORS["red"],
        logging.DEBUG: COLORS["cyan"],
    }

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record with colours and style.

        Args:
            record: The log record to format.

        Returns:
            Formatted log string with ANSI colour codes.
        """
        # Timestamp part (dark grey)
        timestamp = COLORS["grey"] + self.formatTime(record, "%Y-%m-%d %H:%M:%S") + COLORS["reset"]

        # Level part (coloured)
        level_color = self.level_colors.get(record.levelno, COLORS["reset"])
        level = f"{level_color}[{record.levelname}]{COLORS['reset']}"

        # Module name (bold)
        module = f"{COLORS['bold']}{record.name}{COLORS['reset']}"

        # Separator (cyan)
        separator = f"{COLORS['cyan']}>{COLORS['reset']}"

        # Message with colour tag substitution
        msg = super().format(record)
        # Replace colour placeholders with ANSI codes
        msg = msg.replace("{grey}", COLORS["grey"]).replace("{reset}", COLORS["reset"])
        msg = msg.replace("{green}", COLORS["green"]).replace("{yellow}", COLORS["yellow"])
        msg = msg.replace("{red}", COLORS["red"]).replace("{cyan}", COLORS["cyan"])
        msg = msg.replace("{bold}", COLORS["bold"])

        return f"{timestamp} {level} {module} {separator} {msg}"


def setup_logging() -> None:
    """Configure root logger with coloured console output and rotating file handler.

    Reads LOG_LEVEL (default INFO) and LOG_COLOR (default true) from environment.
    Log files are stored in ENDARR_DATA_DIR/endarr.txt with rotation (1 MB, 50 backups).
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_color = os.getenv("LOG_COLOR", "true").lower() == "true"

    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    if log_color:
        console_handler.setFormatter(ColouredFormatter())
    else:
        console_handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s"))

    logging.root.addHandler(console_handler)
    logging.root.setLevel(log_level)

    # File handler (rotating)
    log_dir = os.getenv("ENDARR_DATA_DIR", "/data")
    log_path = os.path.join(log_dir, "endarr.txt")
    os.makedirs(log_dir, exist_ok=True)

    file_handler = RotatingFileHandler(log_path, maxBytes=1_048_576, backupCount=50)
    file_handler.setLevel(log_level)
    file_formatter = logging.Formatter(
        "%(asctime)s|%(levelname)s|%(name)s|%(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler.setFormatter(file_formatter)
    logging.root.addHandler(file_handler)
