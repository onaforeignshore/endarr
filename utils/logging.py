import logging
import os
import sys

# ANSI color codes
COLORS = {
    "darkgrey": "\033[90m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "red": "\033[31m",
    "cyan": "\033[36m",
    "bold": "\033[1m",
    "reset": "\033[0m",
}

class ColouredFormatter(logging.Formatter):
    """Custom formatter with coloured output."""
    level_colors = {
        logging.INFO: COLORS["green"],
        logging.WARNING: COLORS["yellow"],
        logging.ERROR: COLORS["red"],
        logging.DEBUG: COLORS["cyan"],
    }

    def format(self, record):
        # Timestamp part (dark grey)
        timestamp = COLORS["darkgrey"] + self.formatTime(record, "%Y-%m-%d %H:%M:%S") + COLORS["reset"]
        # Level part (coloured)
        level_color = self.level_colors.get(record.levelno, COLORS["reset"])
        level = f"{level_color}[{record.levelname}]{COLORS['reset']}"
        # Module name (bold)
        module = f"{COLORS['bold']}{record.name}{COLORS['reset']}"
        # Separator (cyan)
        separator = f"{COLORS['cyan']}>{COLORS['reset']}"
        # Build message parts
        msg = super().format(record)
        # Insert colour tags before returning? We'll construct final string.
        # We'll assume the message already contains {cyan} etc. – we replace with actual codes.
        msg = msg.replace("{darkgrey}", COLORS["darkgrey"]).replace("{reset}", COLORS["reset"])
        msg = msg.replace("{green}", COLORS["green"]).replace("{yellow}", COLORS["yellow"])
        msg = msg.replace("{red}", COLORS["red"]).replace("{cyan}", COLORS["cyan"])
        msg = msg.replace("{bold}", COLORS["bold"])
        # Now assemble final log line
        return f"{timestamp} {level} {module} {separator} {msg}"

def setup_logging():
    """Configure root logger with coloured output."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_color = os.getenv("LOG_COLOR", "true").lower() == "true"
    handler = logging.StreamHandler(sys.stderr)
    if log_color:
        handler.setFormatter(ColouredFormatter())
    else:
        handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s"))
    logging.root.addHandler(handler)
    logging.root.setLevel(log_level)

    # File handler – rotating logs stored alongside the database
    from logging.handlers import RotatingFileHandler
    log_dir = os.getenv('ENDARR_DATA_DIR', '/data')
    log_path = os.path.join(log_dir, 'endarr.txt')
    os.makedirs(log_dir, exist_ok=True)
    file_handler = RotatingFileHandler(log_path, maxBytes=1_048_576, backupCount=50)
    file_handler.setLevel(log_level)
    # Use a pipe‑delimited format without ANSI codes
    file_formatter = logging.Formatter('%(asctime)s|%(levelname)s|%(name)s|%(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler.setFormatter(file_formatter)
    logging.root.addHandler(file_handler)
