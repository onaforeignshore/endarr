"""Endarr Flask application.

Provides REST API, webhook endpoint, configuration management,
download client integration, and watchdog orchestration.
"""

import glob
import logging
import os
import secrets
import shutil
import signal
import string
import tempfile
import threading
import time
from functools import wraps
from typing import Any, Dict, List, Optional

from config_loader import get_config_issues, load_config, yaml
from config_loader import save_config as save_yaml_config
from flask import Flask, jsonify, request, send_file, send_from_directory
from models.blacklist import Blacklist
from models.database import SessionLocal, init_db
from models.downloads import Download
from models.grabs import Grab
from services.arr_client import LidarrClient, RadarrClient, SonarrClient
from services.deluge import DelugeClient
from services.download_client import DownloadClient
from services.flood import FloodClient
from services.qbittorrent import QBittorrentClient
from services.rtorrent import RTorrentClient
from services.transmission import TransmissionClient
from services.utorrent import UTorrentClient
from services.watchdog import Watchdog
from sqlalchemy import text
from utils.logging import setup_logging
from utils.time_utils import format_duration
from webhook.arr_handler import handle_arr_webhook

# -----------------------------------------------------------------------------
# Environment detection
# -----------------------------------------------------------------------------

def _is_docker() -> bool:
    """Detect if running inside a Docker container.

    Returns:
        True if inside Docker, False otherwise.
    """
    if os.path.exists('/.dockerenv'):
        return True
    try:
        with open('/proc/1/cgroup') as f:
            return any('docker' in line for line in f)
    except (FileNotFoundError, PermissionError):
        return False

IS_DOCKER = _is_docker()

# Setup logging first
setup_logging()
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Helper: apply sort to SQLAlchemy query
# -----------------------------------------------------------------------------
def apply_sort(query, model, sort_by: Optional[str], sort_order: str) -> Any:
    """Apply a sort to a SQLAlchemy query if column is allowed.

    Args:
        query: SQLAlchemy query object.
        model: SQLAlchemy model class.
        sort_by: Column name to sort by (must exist on model).
        sort_order: 'asc' or 'desc'.

    Returns:
        Sorted query (original query if sort_by is invalid).
    """
    if not sort_by:
        return query
    allowed = {col.name for col in model.__table__.columns}
    if sort_by in allowed:
        column = getattr(model, sort_by)
        if sort_order == 'desc':
            return query.order_by(column.desc())
        return query.order_by(column.asc())
    return query


# -----------------------------------------------------------------------------
# Flask app initialisation
# -----------------------------------------------------------------------------
app = Flask(__name__)

# Load configuration
config_path = os.getenv("ENDARR_CONFIG_PATH", "/app/config.yaml")
try:
    config = load_config(config_path)
    app.config["ENDARR_CONFIG"] = config

    # Apply persisted log level from config (overrides environment)
    ui_prefs = config.get("ui_preferences", {})
    desired_level = ui_prefs.get("log_level", "INFO")
    numeric = getattr(logging, desired_level, logging.INFO)
    root = logging.getLogger()
    root.setLevel(numeric)
    for handler in root.handlers:
        handler.setLevel(numeric)

    logger.info("{bold}Config{reset} Loaded from {cyan}%s{reset}", config_path)
except Exception as e:
    logger.critical("{bold}Config{reset} {red}[ERROR]{reset} Failed to load config: %s", e)
    raise

init_db()
logger.info("{bold}Database{reset} Initialized")

# -----------------------------------------------------------------------------
# Load ARR clients
# -----------------------------------------------------------------------------
app.config["ARR_CLIENTS"] = {}
app.config["ARR_CLIENT_NAMES"] = {}
arrs_config = config.get("arrs", [])
for arr in arrs_config:
    if not arr.get("enabled", True):
        logger.info("{bold}ArrClient{reset} Skipping disabled {cyan}%s{reset}", arr.get("name"))
        continue
    arr_type = arr.get("type")
    url = arr.get("url")
    api_key = arr.get("api_key")
    if url and api_key:
        if arr_type == "sonarr":
            arr_client = SonarrClient(url, api_key)
        elif arr_type == "radarr":
            arr_client = RadarrClient(url, api_key)
        elif arr_type == "lidarr":
            arr_client = LidarrClient(url, api_key)
        else:
            continue
        client_id = arr["id"]
        app.config["ARR_CLIENTS"][client_id] = arr_client
        app.config["ARR_CLIENT_NAMES"][client_id] = arr.get("name", client_id)
        logger.info("{bold}ArrClient{reset} Initialized {cyan}%s{reset} client for {cyan}%s{reset}",
                   arr.get("name"), url)
    else:
        logger.warning("{bold}ArrClient{reset} Missing url or api_key for {cyan}%s{reset}, skipping",
                       arr.get("name"))

# -----------------------------------------------------------------------------
# Download clients and watchdogs
# -----------------------------------------------------------------------------
download_clients = config.get("download_clients", [])
enabled_download_clients = [dl for dl in download_clients if dl.get("enabled", True)]

watchdogs: List[Watchdog] = []
client_instances: List[DownloadClient] = []

if not enabled_download_clients:
    logger.warning("{bold}DownloadClient{reset} No enabled download client found. Watchdog will not start.")
else:
    for client_config in enabled_download_clients:
        client_type = client_config.get("type")
        client: Optional[DownloadClient] = None

        if client_type == "qbittorrent":
            host = client_config.get("host", "qbittorrent")
            port = int(client_config.get("port", 8080))
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            timeout = client_config.get("timeout_seconds", 10)
            client = QBittorrentClient(host, port, username, password, timeout)

        elif client_type == "transmission":
            host = client_config.get("host", "transmission")
            port = int(client_config.get("port", 9091))
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            timeout = client_config.get("timeout_seconds", 10)
            client = TransmissionClient(host, port, username, password, timeout)

        elif client_type == "deluge":
            host = client_config.get("host", "deluge")
            port = int(client_config.get("port", 58846))
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            timeout = client_config.get("timeout_seconds", 10)
            client = DelugeClient(host, port, username, password, timeout)

        elif client_type == "rtorrent":
            host = client_config.get("host", "rtorrent")
            port = int(client_config.get("port", 80))
            rpc_path = client_config.get("rpc_path", "/RPC2")
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            use_ssl = client_config.get("use_ssl", False)
            timeout = client_config.get("timeout_seconds", 10)
            client = RTorrentClient(host, port, rpc_path, username, password, use_ssl, timeout)

        elif client_type == "utorrent":
            host = client_config.get("host", "utorrent")
            port = int(client_config.get("port", 8080))
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            use_ssl = client_config.get("use_ssl", False)
            timeout = client_config.get("timeout_seconds", 10)
            client = UTorrentClient(host, port, username, password, use_ssl, timeout)

        elif client_type == "flood":
            host = client_config.get("host", "flood")
            port = int(client_config.get("port", 3000))
            username = client_config.get("username", "")
            password = client_config.get("password", "")
            use_ssl = client_config.get("use_ssl", False)
            timeout = client_config.get("timeout_seconds", 10)
            client = FloodClient(host, port, username, password, use_ssl, timeout)

        else:
            logger.warning("{bold}DownloadClient{reset} Unsupported client type: {cyan}%s{reset}", client_type)
            continue

        if client:
            client_instances.append(client)

            # Determine interval: client override or global
            client_interval = client_config.get("watchdog_interval")
            if client_interval is None:
                watchdog_cfg = config.get("watchdog", {})
                client_interval = int(watchdog_cfg.get("interval_seconds", 900))

            w = Watchdog(config, client, app.config["ARR_CLIENTS"],
                         client_interval,
                         client_config.get("name", client_config.get("id")),
                         client_id=client_config.get("id"))
            w.start()
            watchdogs.append(w)

            logger.info("{bold}Watchdog{reset} Started for {cyan}%s{reset} (interval={cyan}%d{reset}s)",
                        client_config.get("name"), client_interval)

# Store client instances for webhook access
app.config["CLIENT_INSTANCES"] = client_instances
client_instances_by_name = {}
for client_config, client in zip(enabled_download_clients, client_instances):
    name = client_config.get("name", client_config.get("id", "unknown"))
    client_instances_by_name[name] = client
app.config["CLIENT_INSTANCES_BY_NAME"] = client_instances_by_name

# -----------------------------------------------------------------------------
# Health checker (background thread)
# -----------------------------------------------------------------------------
app.config['CLIENT_HEALTH'] = {}
app.config['ARR_HEALTH'] = {}

def start_health_checker() -> None:
    """Start a background thread to periodically check download and ARR client health."""
    def health_check_loop() -> None:
        while True:
            # Check download clients
            for name, client in client_instances_by_name.items():
                try:
                    client.get_torrents()
                    app.config['CLIENT_HEALTH'][name] = True
                except Exception:
                    app.config['CLIENT_HEALTH'][name] = False

            # Check ARR clients
            for arr_id, arr_client in app.config['ARR_CLIENTS'].items():
                try:
                    app.config['ARR_HEALTH'][arr_id] = arr_client.health()
                except Exception:
                    app.config['ARR_HEALTH'][arr_id] = False

            time.sleep(60)

    thread = threading.Thread(target=health_check_loop, daemon=True)
    thread.start()

start_health_checker()

# -----------------------------------------------------------------------------
# Shutdown signal handlers
# -----------------------------------------------------------------------------
def shutdown_gracefully(signum: int, frame: Any) -> None:
    """Handle SIGTERM/SIGINT to stop watchdogs and exit cleanly."""
    logger.info("{bold}Shutdown{reset} Received signal, stopping watchdogs...")
    for w in watchdogs:
        w.stop()
    SessionLocal.remove()
    logger.info("{bold}Shutdown{reset} Complete")
    raise SystemExit(0)

signal.signal(signal.SIGTERM, shutdown_gracefully)
signal.signal(signal.SIGINT, shutdown_gracefully)

app.config["CONFIG_PATH"] = config_path

# -----------------------------------------------------------------------------
# Config helpers
# -----------------------------------------------------------------------------
def get_config() -> Dict[str, Any]:
    """Return the current configuration dictionary from app config."""
    return app.config["ENDARR_CONFIG"]

def save_config(config_dict: Dict[str, Any]) -> None:
    """Save configuration to YAML file and update in‑memory config.

    Args:
        config_dict: The configuration dictionary to save.

    Raises:
        Exception: On save failure.
    """
    config_path = app.config.get("CONFIG_PATH", os.getenv("ENDARR_CONFIG_PATH", "/app/config.yaml"))
    try:
        save_yaml_config(config_dict, config_path)
        app.config["ENDARR_CONFIG"] = config_dict
        logger.info("{bold}Config{reset} Saved to {cyan}%s{reset}", config_path)
    except Exception as e:
        logger.exception("{bold}Config{reset} {red}[ERROR]{reset} Failed to save config to %s: %s", config_path, e)
        raise

# -----------------------------------------------------------------------------
# Authentication decorator
# -----------------------------------------------------------------------------
def require_apikey(f):
    """Decorator to require a valid API key for endpoints."""
    @wraps(f)
    def decorated(*args, **kwargs):
        webhook_key = get_config().get("webhook_key", "")
        if webhook_key:
            key = request.args.get("apikey") or request.headers.get("X-Api-Key")
            if key != webhook_key:
                logger.warning("{bold}API{reset} {yellow}[UNAUTHORIZED]{reset} Invalid API key from {cyan}%s{reset} for %s %s",
                               request.remote_addr, request.method, request.path)
                return jsonify({"error": "Unauthorized"}), 401
        logger.debug("{bold}API{reset} Authenticated request: %s %s from %s", request.method, request.path, request.remote_addr)
        return f(*args, **kwargs)
    return decorated

# -----------------------------------------------------------------------------
# Static & core endpoints
# -----------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    """Simple health check endpoint."""
    logger.debug("{bold}Health{reset} Check from %s", request.remote_addr)
    return jsonify({"status": "ok"}), 200

@app.route('/ui')
@app.route('/ui/<path:filename>')
def serve_ui(filename: str = 'index.html'):
    """Serve static UI files."""
    return send_from_directory('ui', filename)

# -----------------------------------------------------------------------------
# System information endpoints
# -----------------------------------------------------------------------------
@app.route("/api/v1/status", methods=["GET"])
@require_apikey
def api_status():
    """Return system status including downloaded and ARR client health."""
    uptime_seconds = int(time.time() - start_time) if 'start_time' in globals() else 0
    uptime_str = format_duration(uptime_seconds)

    config = get_config()

    download_clients_status = []
    for client_config in config.get("download_clients", []):
        if not client_config.get("enabled", True):
            continue
        client_name = client_config.get("name", client_config.get("id", "Unknown"))

        # Find corresponding watchdog
        watchdog_instance = next((w for w in watchdogs if w.name == client_name), None)

        connected = app.config['CLIENT_HEALTH'].get(client_name, False)
        interval = watchdog_instance.interval if watchdog_instance else 0
        last_run = watchdog_instance.last_run if watchdog_instance else None
        running = watchdog_instance.thread.is_alive() if (watchdog_instance and watchdog_instance.thread) else False

        download_clients_status.append({
            "name": client_name,
            "connected": connected,
            "watchdog_interval": interval,
            "watchdog_last_run": last_run,
            "watchdog_running": running
        })

    arr_clients_status = []
    arr_clients_dict = app.config.get("ARR_CLIENTS", {})
    arr_client_names = app.config.get("ARR_CLIENT_NAMES", {})
    for client_id, client in arr_clients_dict.items():
        name = arr_client_names.get(client_id, client_id)
        connected = app.config['ARR_HEALTH'].get(client_id, False)
        arr_clients_status.append({"name": name, "connected": connected})

    status = {
        "version": "0.1.7",
        "download_clients": download_clients_status,
        "arr_clients": arr_clients_status,
        "uptime": uptime_str
    }
    return jsonify(status)

@app.route("/api/v1/system/environment", methods=["GET"])
@require_apikey
def api_system_environment():
    """Return whether the application is running inside Docker."""
    return jsonify({"is_docker": IS_DOCKER})

@app.route("/api/v1/system/restart", methods=["POST"])
@require_apikey
def api_system_restart():
    """Restart the application (works in both Docker and standalone)."""
    def _restart():
        time.sleep(0.5)
        os._exit(0)
    threading.Thread(target=_restart, daemon=True).start()
    return jsonify({"status": "restarting"})

@app.route("/api/v1/system/shutdown", methods=["POST"])
@require_apikey
def api_system_shutdown():
    """Shutdown the application (not allowed in Docker)."""
    if IS_DOCKER:
        return jsonify({"error": "Shutdown is not available in Docker. Use 'docker stop' instead."}), 400
    def _shutdown():
        time.sleep(0.5)
        os._exit(0)
    threading.Thread(target=_shutdown, daemon=True).start()
    return jsonify({"status": "shutting down"})

@app.route("/api/v1/system/log-level", methods=["GET"])
@require_apikey
def api_get_log_level():
    """Return the current log level of the root logger."""
    level = logging.getLogger().getEffectiveLevel()
    level_name = logging.getLevelName(level)
    handler_info = [{"class": h.__class__.__name__, "level": logging.getLevelName(h.level)} for h in logging.getLogger().handlers]
    return jsonify({"level": level_name, "handlers": handler_info})

@app.route("/api/v1/system/log-level", methods=["POST"])
@require_apikey
def api_set_log_level():
    """Set the log level (persists in config.yaml)."""
    data = request.get_json()
    new_level = data.get("level", "").upper()
    valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    if new_level not in valid_levels:
        return jsonify({"error": f"Invalid level. Must be one of: {', '.join(valid_levels)}"}), 400

    numeric_level = getattr(logging, new_level)
    root = logging.getLogger()
    root.setLevel(numeric_level)
    for handler in list(root.handlers):
        try:
            handler.setLevel(numeric_level)
        except Exception:
            pass

    gunicorn_logger = logging.getLogger('gunicorn.error')
    if gunicorn_logger:
        gunicorn_logger.setLevel(numeric_level)

    # Persist in config
    config = get_config()
    if "ui_preferences" not in config:
        config["ui_preferences"] = {}
    config["ui_preferences"]["log_level"] = new_level
    try:
        save_config(config)
    except Exception as e:
        logger.error("{bold}System{reset} Failed to save log level preference: %s", e)

    logger.warning("{bold}System{reset} Log level changed to {cyan}%s{reset} by %s",
                   new_level, request.remote_addr)
    return jsonify({"status": "ok", "level": new_level})

@app.route("/api/v1/stats", methods=["GET"])
@require_apikey
def api_stats():
    """Return dashboard statistics: active torrents, grabs (24h), deletions (24h)."""
    db = SessionLocal()
    try:
        active = db.query(Download).filter(Download.deleted_at.is_(None)).count()
        yesterday = time.time() - 86400
        grabs = db.query(Grab).filter(Grab.grabbed_at > yesterday).count()
        deletions = db.query(Download).filter(Download.deleted_at > yesterday).count()
        return jsonify({"active_torrents": active, "grabs_24h": grabs, "deletions_24h": deletions})
    finally:
        db.close()

@app.route("/api/v1/db_info", methods=["GET"])
@require_apikey
def api_db_info():
    """Return database file size and record counts."""
    db = SessionLocal()
    try:
        db_path = os.getenv("ENDARR_DATA_DIR", "/data") + "/endarr.db"
        if not os.path.exists(db_path):
            db_path = os.path.join(os.path.dirname(app.config["CONFIG_PATH"]), "endarr.db")
        size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0
        size_mb = round(size_bytes / (1024 * 1024), 2)
        grabs_count = db.query(Grab).count()
        downloads_count = db.query(Download).count()
        blacklist_count = db.query(Blacklist).count()
        return jsonify({"size_mb": size_mb, "grabs_count": grabs_count, "downloads_count": downloads_count, "blacklist_count": blacklist_count})
    except Exception as e:
        logger.exception("Failed to get db info")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route("/api/v1/logs", methods=["GET"])
@require_apikey
def api_logs_list():
    """Return list of available log files with metadata."""
    log_dir = os.getenv('ENDARR_DATA_DIR', '/data')
    log_files = sorted(glob.glob(os.path.join(log_dir, 'endarr.txt*')), key=os.path.getmtime, reverse=True)
    files = []
    for path in log_files:
        try:
            st = os.stat(path)
            files.append({"name": os.path.basename(path), "size": st.st_size, "last_modified": st.st_mtime})
        except OSError:
            continue
    return jsonify({"files": files})

@app.route("/api/v1/logs/download", methods=["GET"])
@require_apikey
def api_logs_download():
    """Download a specific log file."""
    filename = request.args.get('file', '')
    if not filename or '..' in filename or '/' in filename:
        return jsonify({"error": "Invalid filename"}), 400
    log_dir = os.getenv('ENDARR_DATA_DIR', '/data')
    file_path = os.path.join(log_dir, filename)
    if not os.path.isfile(file_path):
        return jsonify({"error": "File not found"}), 404
    return send_file(file_path, mimetype='text/plain', as_attachment=True, download_name=filename)

@app.route("/api/v1/logs", methods=["DELETE"])
@require_apikey
def api_logs_clear():
    """Delete all log files (current and rotated)."""
    log_dir = os.getenv('ENDARR_DATA_DIR', '/data')
    pattern = os.path.join(log_dir, 'endarr.txt*')
    deleted = 0
    for file_path in glob.glob(pattern):
        try:
            os.remove(file_path)
            deleted += 1
        except OSError:
            pass
    new_log = os.path.join(log_dir, 'endarr.txt')
    with open(new_log, 'w'):
        pass
    logger.info("{bold}API{reset} Cleared %d log file(s) by %s", deleted, request.remote_addr)
    return jsonify({"status": "ok", "deleted": deleted})

# -----------------------------------------------------------------------------
# Configuration endpoints
# -----------------------------------------------------------------------------
@app.route("/api/v1/public_key", methods=["GET"])
def api_public_key():
    """Return the webhook key (no authentication required)."""
    webhook_key = get_config().get("webhook_key", "")
    if webhook_key:
        logger.info("{bold}API{reset} Public key requested from {cyan}%s{reset}", request.remote_addr)
        return jsonify({"webhook_key": webhook_key})
    else:
        logger.warning("{bold}API{reset} Public key requested but none configured")
        return jsonify({"webhook_key": None})

@app.route("/api/v1/config", methods=["GET"])
@require_apikey
def api_get_config():
    """Return the entire configuration."""
    config = get_config()
    logger.info("{bold}API{reset} {green}[SUCCESS]{reset} Config fetched (keys: %s)", list(config.keys()))
    return jsonify(config)

@app.route("/api/v1/config", methods=["POST"])
@require_apikey
def api_post_config():
    """Save the entire configuration (must include all required keys)."""
    new_config = request.get_json()
    if not new_config:
        logger.warning("{bold}API{reset} {yellow}[BAD REQUEST]{reset} No JSON body in POST /api/v1/config from %s", request.remote_addr)
        return jsonify({"error": "No JSON body"}), 400
    required = ["webhook_key", "defaults", "arrs", "categories", "protection", "dangerous_extensions", "grabs_retention_days"]
    for key in required:
        if key not in new_config:
            logger.warning("{bold}API{reset} {yellow}[BAD REQUEST]{reset} Missing required key '%s' in config from %s", key, request.remote_addr)
            return jsonify({"error": f"Missing required key: {key}"}), 400
    try:
        save_config(new_config)
        logger.info("{bold}API{reset} {green}[SUCCESS]{reset} Config updated by %s", request.remote_addr)
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        logger.exception("{bold}API{reset} {red}[ERROR]{reset} Failed to save config: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/v1/config/issues", methods=["GET"])
@require_apikey
def api_config_issues():
    """Return list of configuration validation issues."""
    issues = get_config_issues()
    return jsonify({"issues": [i.to_dict() if hasattr(i, 'to_dict') else {"field": i.field, "message": i.message} for i in issues]})

@app.route("/api/v1/config/deprecated", methods=["GET"])
@require_apikey
def api_config_deprecated():
    """Return whether the config contains deprecated legacy fields."""
    from config_loader import has_deprecated_fields
    config = get_config()
    return jsonify({"has_deprecated": has_deprecated_fields(config)})

@app.route("/api/v1/config/migrate_legacy", methods=["POST"])
@require_apikey
def api_config_migrate_legacy():
    """Remove all deprecated legacy fields from the config."""
    from config_loader import load_config, yaml
    config_path = app.config.get("CONFIG_PATH", os.getenv("ENDARR_CONFIG_PATH", "/app/config.yaml"))

    # Load the existing file's data structure (with comments)
    with open(config_path, 'r') as f:
        data = yaml.load(f) or {}

    defaults = data.get("defaults", {})
    legacy_keys = [
        "ratio_goal", "seed_time_seconds", "upload_amount_bytes",
        "min_seeders", "idle_seconds", "no_availability_seconds"
    ]
    changed = False
    for key in legacy_keys:
        if key in defaults:
            del defaults[key]
            changed = True

    # Reset legacy delete_policy to "none"
    delete_policy = defaults.get("delete_policy")
    if delete_policy in ("ratio", "time", "idle", "availability", "all"):
        defaults["delete_policy"] = "none"
        changed = True

    if changed:
        # Save the modified data structure (preserves comments)
        with open(config_path, 'w') as f:
            yaml.dump(data, f)
        # Reload the config to update the in‑memory copy
        app.config["ENDARR_CONFIG"] = load_config(config_path)
        logger.info("Legacy fields removed from config (comments preserved)")

    return jsonify({"status": "ok", "changed": changed})

def generate_webhook_key(length: int = 32) -> str:
    """Generate a secure random webhook key."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@app.route("/api/v1/webhook_key/generate", methods=["POST"])
def api_generate_webhook_key():
    """Generate an initial API key when none exists."""
    config = get_config()
    current_key = config.get("webhook_key", "")
    if current_key:
        return jsonify({"error": "API key already exists"}), 400
    new_key = generate_webhook_key()
    config["webhook_key"] = new_key
    save_config(config)
    app.config["ENDARR_CONFIG"]["webhook_key"] = new_key
    logger.info("{bold}API{reset} Initial webhook key generated by %s", request.remote_addr)
    return jsonify({"webhook_key": new_key})

@app.route("/api/v1/webhook_key/reset", methods=["POST"])
@require_apikey
def api_reset_webhook_key():
    """Reset the webhook key to a new random value."""
    try:
        config = get_config()
        new_key = generate_webhook_key()
        config["webhook_key"] = new_key
        save_config(config)
        app.config["ENDARR_CONFIG"]["webhook_key"] = new_key
        logger.info("{bold}API{reset} Webhook key reset by %s", request.remote_addr)
        return jsonify({"webhook_key": new_key})
    except Exception as e:
        logger.exception("Webhook key reset error")
        return jsonify({"error": str(e)}), 500

# -----------------------------------------------------------------------------
# Client management endpoints (test connections)
# -----------------------------------------------------------------------------
@app.route("/api/v1/test_arr", methods=["POST"])
@require_apikey
def api_test_arr():
    """Test connection to an ARR client."""
    data = request.get_json()
    arr_type = data.get("type")
    url = data.get("url")
    api_key = data.get("api_key")
    if not arr_type or not url or not api_key:
        logger.warning("{bold}API{reset} {yellow}[BAD REQUEST]{reset} Missing fields in /api/v1/test_arr from %s", request.remote_addr)
        return jsonify({"error": "Missing type, url, or api_key"}), 400
    logger.info("{bold}API{reset} Testing connection to {cyan}%s{reset} at {cyan}%s{reset}", arr_type, url)
    try:
        if arr_type == "radarr":
            client = RadarrClient(url, api_key)
        elif arr_type == "sonarr":
            client = SonarrClient(url, api_key)
        elif arr_type == "lidarr":
            client = LidarrClient(url, api_key)
        else:
            logger.warning("{bold}API{reset} Unknown arr type: %s", arr_type)
            return jsonify({"error": f"Unknown arr type: {arr_type}"}), 400
        if client.health():
            logger.info("{bold}API{reset} {green}[SUCCESS]{reset} Connection to %s at %s succeeded", arr_type, url)
            return jsonify({"status": "ok", "message": f"Connected to {arr_type} successfully"}), 200
        else:
            logger.warning("{bold}API{reset} {yellow}[FAIL]{reset} Connection to %s at %s failed", arr_type, url)
            return jsonify({"status": "error", "message": "Invalid API key or unreachable"}), 400
    except Exception as e:
        logger.exception("{bold}API{reset} {red}[ERROR]{reset} Test connection to %s at %s failed: %s", arr_type, url, e)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/v1/test_download_client", methods=["POST"])
@require_apikey
def api_test_download_client():
    """Test connection to a download client (uses the same logic as initialisation)."""
    data = request.get_json()
    client_type = data.get("type")

    # --- qBittorrent ---
    if client_type == "qbittorrent":
        host = data.get("host")
        port = data.get("port")
        username = data.get("username", "")
        password = data.get("password", "")
        use_ssl = data.get("use_ssl", False)
        protocol = "https" if use_ssl else "http"
        url = f"{protocol}://{host}:{port}"
        try:
            import requests
            session = requests.Session()
            login_url = f"{url}/api/v2/auth/login"
            resp = session.post(login_url, data={"username": username, "password": password}, timeout=10)
            if resp.status_code not in (200, 204):
                return jsonify({"error": "Invalid credentials"}), 400
            torrents_url = f"{url}/api/v2/torrents/info"
            resp2 = session.get(torrents_url, timeout=10)
            if resp2.status_code != 200:
                return jsonify({"error": "Failed to fetch torrents"}), 400
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    # --- Transmission ---
    elif client_type == "transmission":
        host = data.get("host")
        port = data.get("port")
        username = data.get("username", "")
        password = data.get("password", "")
        try:
            from transmission_rpc import Client
            client = Client(
                host=host,
                port=port,
                username=username or None,
                password=password or None,
                timeout=10
            )
            client.get_session()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    # --- Deluge ---
    elif client_type == "deluge":
        host = data.get("host")
        port = data.get("port")
        username = data.get("username", "")
        password = data.get("password", "")
        try:
            from deluge_client import DelugeRPCClient
            client = DelugeRPCClient(host, port, username, password, timeout=10)
            client.connect()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    # --- rTorrent ---
    elif client_type == "rtorrent":
        host = data.get("host")
        port = data.get("port")
        rpc_path = data.get("rpc_path", "/RPC2")
        use_ssl = data.get("use_ssl", False)
        protocol = "https" if use_ssl else "http"
        url = f"{protocol}://{host}:{port}{rpc_path}"
        try:
            import xmlrpc.client
            server = xmlrpc.client.ServerProxy(url)
            server.system.listMethods()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    # --- uTorrent ---
    elif client_type == "utorrent":
        host = data.get("host")
        port = data.get("port")
        username = data.get("username", "")
        password = data.get("password", "")
        use_ssl = data.get("use_ssl", False)
        protocol = "https" if use_ssl else "http"
        url = f"{protocol}://{host}:{port}/gui/token.html"
        try:
            import requests
            session = requests.Session()
            resp = session.get(url, auth=(username, password), timeout=10)
            resp.raise_for_status()
            import re
            match = re.search(r"<div[^>]*id=[\"']token[\"'][^>]*>([^<]+)</div>", resp.text)
            if not match:
                return jsonify({"error": "Could not extract token"}), 400
            token = match.group(1)
            list_url = f"{protocol}://{host}:{port}/gui/"
            params = {"list": 1, "token": token}
            resp2 = session.get(list_url, params=params, auth=(username, password), timeout=10)
            resp2.raise_for_status()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    # --- Flood ---
    elif client_type == "flood":
        host = data.get("host")
        port = data.get("port")
        username = data.get("username", "")
        password = data.get("password", "")
        use_ssl = data.get("use_ssl", False)
        protocol = "https" if use_ssl else "http"
        base_url = f"{protocol}://{host}:{port}/api"
        try:
            import requests
            session = requests.Session()
            auth_resp = session.post(
                f"{base_url}/auth/authenticate",
                json={"username": username, "password": password},
                timeout=10
            )
            auth_resp.raise_for_status()
            torrents_resp = session.get(f"{base_url}/torrents", timeout=10)
            torrents_resp.raise_for_status()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            logger.exception("Test download client failed")
            return jsonify({"error": str(e)}), 400

    else:
        return jsonify({"error": f"Unsupported client type: {client_type}"}), 400

# -----------------------------------------------------------------------------
# Data retrieval endpoints
# -----------------------------------------------------------------------------
@app.route("/api/v1/torrents", methods=["GET"])
@require_apikey
def api_torrents():
    """Return list of torrents with optional filtering and pagination."""
    db = SessionLocal()
    try:
        query = db.query(Download)

        status = request.args.get("status")
        if status == "active":
            query = query.filter(Download.deleted_at.is_(None))
        elif status == "deleted":
            query = query.filter(Download.deleted_at.isnot(None))

        arr_name = request.args.get("arr_name")
        if arr_name:
            query = query.join(Grab, Download.grab_id == Grab.id, isouter=True).filter(Grab.arr_name == arr_name)

        sort_by = request.args.get("sort_by", "")
        sort_order = request.args.get("sort_order", "asc")
        query = apply_sort(query, Download, sort_by, sort_order)

        limit = request.args.get("limit", default=100, type=int)
        offset = request.args.get("offset", default=0, type=int)
        total = query.count()
        items = query.offset(offset).limit(limit).all()

        result = []
        for d in items:
            grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
            result.append({
                "hash": d.hash,
                "name": d.name or (grab.release_title if grab else None) or d.hash,
                "category": d.category,
                "client_id": d.client_id,
                "arr_name": grab.arr_name if grab else None,
                "added_to_client_at": d.added_to_client_at,
                "import_completed_at": d.import_completed_at,
                "deleted_at": d.deleted_at,
                "delete_reason": d.delete_reason,
                "dangerous_files": d.dangerous_files,
                "stall_strikes": d.stall_strikes,
                "total_size": d.total_size or 0,
                "save_path": d.save_path or "",
                "state": "",
                "protected": False
            })
        return jsonify({"total": total, "items": result})
    finally:
        db.close()

@app.route("/api/v1/torrents/<hash>/import", methods=["POST"])
@require_apikey
def api_mark_torrent_imported(hash: str):
    """Manually mark a torrent as imported."""
    db = SessionLocal()
    try:
        download = db.query(Download).filter(Download.hash == hash).first()
        if not download:
            return jsonify({"error": "Torrent not found"}), 404
        if download.deleted_at is not None:
            return jsonify({"error": "Torrent already deleted"}), 400
        download.import_completed_at = time.time()
        db.commit()
        logger.info("{bold}API{reset} Marked torrent {cyan}%s{reset} as imported manually by %s", hash, request.remote_addr)
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        logger.exception("Failed to mark torrent %s as imported: %s", hash, e)
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route("/api/v1/torrents/<hash>", methods=["DELETE"])
@require_apikey
def api_delete_torrent(hash: str):
    """Delete a tracked torrent from the download client and mark as deleted."""
    db = SessionLocal()
    try:
        download = db.query(Download).filter(Download.hash == hash).first()
        if not download:
            return jsonify({"error": "Torrent not found"}), 404
        if download.deleted_at is not None:
            return jsonify({"error": "Torrent already deleted"}), 400

        client_name = download.client_id
        client = app.config["CLIENT_INSTANCES_BY_NAME"].get(client_name)
        if not client:
            # Fallback to first client
            client = app.config["CLIENT_INSTANCES"][0] if app.config["CLIENT_INSTANCES"] else None
        if not client:
            return jsonify({"error": "Download client not found"}), 500

        client.delete_torrent(hash, delete_files=True)
        download.deleted_at = time.time()
        download.delete_reason = "manual"
        db.commit()

        logger.info("{bold}API{reset} Deleted torrent {cyan}%s{reset} manually by %s", hash, request.remote_addr)
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        logger.exception("Failed to delete torrent %s: %s", hash, e)
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route("/api/v1/torrents/batch", methods=["POST"])
@require_apikey
def api_batch_delete_torrents():
    """Delete multiple torrents at once."""
    data = request.get_json()
    hashes = data.get("hashes", [])
    if not hashes or not isinstance(hashes, list):
        return jsonify({"error": "Missing or invalid 'hashes' list"}), 400

    db = SessionLocal()
    deleted = 0
    failed = []
    for h in hashes:
        try:
            download = db.query(Download).filter(Download.hash == h).first()
            if not download or download.deleted_at is not None:
                failed.append({"hash": h, "error": "Not found or already deleted"})
                continue
            client_name = download.client_id
            client = app.config["CLIENT_INSTANCES_BY_NAME"].get(client_name)
            if not client:
                client = app.config["CLIENT_INSTANCES"][0] if app.config["CLIENT_INSTANCES"] else None
            if not client:
                failed.append({"hash": h, "error": "Download client not available"})
                continue
            client.delete_torrent(h, delete_files=True)
            download.deleted_at = time.time()
            download.delete_reason = "manual_batch"
            deleted += 1
        except Exception as e:
            logger.exception("Batch delete failed for %s", h)
            failed.append({"hash": h, "error": str(e)})

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return jsonify({"error": f"Database commit failed: {str(e)}"}), 500
    finally:
        db.close()

    return jsonify({"status": "ok", "deleted_count": deleted, "failed_count": len(failed), "failed": failed})

@app.route("/api/v1/history", methods=["GET"])
@require_apikey
def api_history():
    """Return combined history of grabs, imports, deletions, upgrades, etc."""
    db = SessionLocal()
    try:
        event_type = request.args.get("eventType")
        limit = request.args.get("limit", 100, type=int)
        offset = request.args.get("offset", 0, type=int)
        sort_by = request.args.get("sort_by", "timestamp")
        sort_order = request.args.get("sort_order", "desc")

        allowed_sort = {'timestamp', 'title', 'arr_name', 'indexer', 'quality', 'size', 'type'}
        if sort_by not in allowed_sort:
            sort_by = 'timestamp'
        if sort_order not in ('asc', 'desc'):
            sort_order = 'desc'

        union_sql = """
            SELECT g.grabbed_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'grab' AS type,
                   NULL AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   NULL AS hash
              FROM grabs g
             WHERE g.release_title IS NOT NULL
             UNION ALL
            SELECT d.import_completed_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'import' AS type,
                   NULL AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   d.hash
              FROM downloads d
              LEFT JOIN grabs g ON d.grab_id = g.id
             WHERE d.import_completed_at IS NOT NULL
             UNION ALL
            SELECT d.deleted_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'deletion' AS type,
                   d.delete_reason AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   d.hash
              FROM downloads d
              LEFT JOIN grabs g ON d.grab_id = g.id
             WHERE d.deleted_at IS NOT NULL
             UNION ALL
            SELECT d.upgraded_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'upgrade' AS type,
                   NULL AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   d.hash
              FROM downloads d
              LEFT JOIN grabs g ON d.grab_id = g.id
             WHERE d.upgraded_at IS NOT NULL
             UNION ALL
            SELECT d.deleted_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'stall' AS type,
                   d.delete_reason AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   d.hash
              FROM downloads d
              LEFT JOIN grabs g ON d.grab_id = g.id
             WHERE d.delete_reason = 'stalled_strikes'
             UNION ALL
            SELECT b.blocked_at AS timestamp,
                   b.release_title AS title,
                   b.arr_name,
                   b.indexer,
                   b.reason AS reason,
                   NULL AS size,
                   'blacklist' AS type,
                   b.reason AS reason,
                   NULL AS media_id,
                   NULL AS media_type,
                   b.grab_id,
                   NULL AS hash
              FROM blacklist b
             WHERE b.release_title IS NOT NULL
             UNION ALL
            SELECT d.deleted_at AS timestamp,
                   g.release_title AS title,
                   g.arr_name,
                   g.indexer,
                   g.quality,
                   g.size,
                   'malicious' AS type,
                   d.delete_reason AS reason,
                   g.media_id,
                   g.media_type,
                   g.id AS grab_id,
                   d.hash
              FROM downloads d
              LEFT JOIN grabs g ON d.grab_id = g.id
             WHERE d.delete_reason = 'malicious'
        """
        filter_clause = ""
        if event_type:
            filter_clause = " WHERE type = :event_type"
        sort_clause = f" ORDER BY {sort_by} {sort_order}"
        count_sql = f"SELECT COUNT(*) FROM ({union_sql}) AS all_events{filter_clause}"
        count_params = {"event_type": event_type} if filter_clause else {}
        total = db.execute(text(count_sql), count_params).scalar()
        data_sql = f"SELECT * FROM ({union_sql}) AS all_events{filter_clause}{sort_clause} LIMIT :limit OFFSET :offset"
        data_params: dict = {"limit": limit, "offset": offset}
        if filter_clause:
            data_params["event_type"] = event_type
        rows = db.execute(text(data_sql), data_params).fetchall()
        result = [{
            "timestamp": row.timestamp,
            "title": row.title or 'Unknown',
            "arr_name": row.arr_name or '',
            "indexer": row.indexer or '',
            "quality": row.quality or '',
            "size": row.size or 0,
            "type": row.type,
            "reason": row.reason or '',
            "media_id": row.media_id or '',
            "media_type": row.media_type or '',
            "grab_id": row.grab_id or None,
            "hash": row.hash or '',
        } for row in rows]
        return jsonify({"total": total, "items": result})
    finally:
        db.close()

@app.route("/api/v1/grabs", methods=["GET"])
@require_apikey
def api_grabs():
    """Return list of grab events (deprecated, but kept for compatibility)."""
    db = SessionLocal()
    try:
        query = db.query(Grab)
        arr_name = request.args.get("arr_name")
        if arr_name:
            query = query.filter(Grab.arr_name == arr_name)
        sort_by = request.args.get("sort_by", "")
        sort_order = request.args.get("sort_order", "asc")
        query = apply_sort(query, Grab, sort_by, sort_order)
        limit = request.args.get("limit", default=100, type=int)
        offset = request.args.get("offset", default=0, type=int)
        total = query.count()
        items = query.offset(offset).limit(limit).all()
        blacklisted_titles = set(b.release_title.strip().lower() for b in db.query(Blacklist.release_title).all())
        matched_grab_ids = set(d.grab_id for d in db.query(Download.grab_id).filter(Download.grab_id.isnot(None)).all())
        result = []
        for g in items:
            normalized_title = g.release_title.strip().lower()
            status = "pending"
            if normalized_title in blacklisted_titles:
                status = "blacklisted"
            elif g.id in matched_grab_ids:
                status = "matched"
            result.append({
                "id": g.id,
                "release_title": g.release_title,
                "arr_name": g.arr_name,
                "grabbed_at": g.grabbed_at,
                "media_id": g.media_id,
                "media_type": g.media_type,
                "indexer": g.indexer,
                "quality": g.quality,
                "size": g.size,
                "status": status,
            })
        return jsonify({"total": total, "items": result})
    finally:
        db.close()

@app.route("/api/v1/downloads", methods=["GET"])
@require_apikey
def api_downloads():
    """Return list of download records (deprecated)."""
    db = SessionLocal()
    try:
        query = db.query(Download).filter(Download.import_completed_at.isnot(None))
        sort_by = request.args.get("sort_by", "")
        sort_order = request.args.get("sort_order", "asc")
        query = apply_sort(query, Download, sort_by, sort_order)
        limit = request.args.get("limit", default=100, type=int)
        offset = request.args.get("offset", default=0, type=int)
        total = query.count()
        items = query.offset(offset).limit(limit).all()
        result = []
        for d in items:
            grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
            result.append({
                "hash": d.hash,
                "release_title": grab.release_title if grab else None,
                "category": d.category,
                "import_completed_at": d.import_completed_at,
                "deleted_at": d.deleted_at,
                "delete_reason": d.delete_reason,
            })
        return jsonify({"total": total, "items": result})
    finally:
        db.close()

@app.route("/api/v1/blacklist", methods=["GET"])
@require_apikey
def api_blacklist():
    """Return list of blacklist entries."""
    db = SessionLocal()
    try:
        query = db.query(Blacklist)
        sort_by = request.args.get("sort_by", "")
        sort_order = request.args.get("sort_order", "asc")
        query = apply_sort(query, Blacklist, sort_by, sort_order)
        limit = request.args.get("limit", default=100, type=int)
        offset = request.args.get("offset", default=0, type=int)
        total = query.count()
        items = query.offset(offset).limit(limit).all()
        result = [{
            "id": b.id,
            "release_title": b.release_title,
            "arr_name": b.arr_name,
            "reason": b.reason,
            "source": b.source,
            "blocked_at": b.blocked_at,
            "expires_at": b.expires_at,
            "grab_id": b.grab_id,
        } for b in items]
        return jsonify({"total": total, "items": result})
    finally:
        db.close()

@app.route("/api/v1/activity", methods=["GET"])
@require_apikey
def api_activity():
    """Return a combined feed of recent activity for the dashboard."""
    db = SessionLocal()
    try:
        limit = request.args.get("limit", default=10, type=int)
        event_type = request.args.get("eventType")
        events = []
        # Grabs
        if not event_type or event_type == "grab":
            grabs = db.query(Grab).order_by(Grab.grabbed_at.desc()).limit(limit).all()
            for g in grabs:
                events.append({"type": "grab", "timestamp": g.grabbed_at, "title": g.release_title, "arr": g.arr_name, "reason": None})
        # Imports
        if not event_type or event_type == "import":
            downloads = db.query(Download).filter(Download.import_completed_at.isnot(None)).order_by(Download.import_completed_at.desc()).limit(limit).all()
            for d in downloads:
                grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
                events.append({"type": "import", "timestamp": d.import_completed_at, "title": grab.release_title if grab else d.hash, "arr": grab.arr_name if grab else "unknown", "reason": None})
        # Deletions
        if not event_type or event_type == "deletion":
            deletions = db.query(Download).filter(Download.deleted_at.isnot(None)).order_by(Download.deleted_at.desc()).limit(limit).all()
            for d in deletions:
                grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
                events.append({"type": "deletion", "timestamp": d.deleted_at, "title": grab.release_title if grab else d.hash, "arr": grab.arr_name if grab else "unknown", "reason": d.delete_reason})
        # Upgrades
        if not event_type or event_type == "upgrade":
            upgrades = db.query(Download).filter(Download.upgraded_at.isnot(None)).order_by(Download.upgraded_at.desc()).limit(limit).all()
            for d in upgrades:
                grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
                events.append({"type": "upgrade", "timestamp": d.upgraded_at, "title": grab.release_title if grab else d.hash, "arr": grab.arr_name if grab else "unknown", "reason": None})
        # Stall strikes
        if not event_type or event_type == "stall":
            stall_deletions = db.query(Download).filter(Download.delete_reason == "stalled_strikes").order_by(Download.deleted_at.desc()).limit(limit).all()
            for d in stall_deletions:
                grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
                events.append({"type": "stall", "timestamp": d.deleted_at, "title": grab.release_title if grab else d.hash, "arr": grab.arr_name if grab else "unknown", "reason": d.delete_reason})
        # Blacklist additions
        if not event_type or event_type == "blacklist":
            blacklists = db.query(Blacklist).order_by(Blacklist.blocked_at.desc()).limit(limit).all()
            for b in blacklists:
                events.append({"type": "blacklist", "timestamp": b.blocked_at, "title": b.release_title, "arr": b.arr_name or "", "reason": b.reason})
        # Malicious file detections
        if not event_type or event_type == "malicious":
            malicious = db.query(Download).filter(Download.delete_reason == "malicious").order_by(Download.deleted_at.desc()).limit(limit).all()
            for d in malicious:
                grab = db.query(Grab).filter(Grab.id == d.grab_id).first()
                events.append({"type": "malicious", "timestamp": d.deleted_at, "title": grab.release_title if grab else d.hash, "arr": grab.arr_name if grab else "unknown", "reason": d.delete_reason})
        events.sort(key=lambda x: x["timestamp"], reverse=True)
        events = events[:limit]
        return jsonify(events)
    finally:
        db.close()

# -----------------------------------------------------------------------------
# Action endpoints
# -----------------------------------------------------------------------------
@app.route("/api/v1/blacklist", methods=["POST"])
@require_apikey
def api_blacklist_add():
    """Add a release to the blacklist."""
    data = request.get_json()
    release_title = data.get("release_title")
    if not release_title:
        return jsonify({"error": "Missing release_title"}), 400
    db = SessionLocal()
    try:
        existing = db.query(Blacklist).filter(Blacklist.release_title == release_title).first()
        if existing:
            return jsonify({"error": "Already blacklisted"}), 409
        bl = Blacklist(
            release_title=release_title,
            arr_name=data.get("arr_name"),
            reason=data.get("reason", "manual"),
            source="user",
            blocked_at=time.time(),
            expires_at=data.get("expires_at")
        )
        db.add(bl)
        db.commit()
        logger.info("{bold}API{reset} Added blacklist entry for %s", release_title)
        return jsonify({"status": "ok", "id": bl.id}), 201
    finally:
        db.close()

@app.route("/api/v1/blacklist", methods=["DELETE"])
@require_apikey
def api_blacklist_delete():
    """Remove a release from the blacklist."""
    data = request.get_json()
    entry_id = data.get("id")
    if not entry_id:
        return jsonify({"error": "Missing id"}), 400
    db = SessionLocal()
    try:
        entry = db.query(Blacklist).filter(Blacklist.id == entry_id).first()
        if not entry:
            return jsonify({"error": "Not found"}), 404
        db.delete(entry)
        db.commit()
        logger.info("{bold}API{reset} Blacklist entry %d deleted", entry_id)
        return jsonify({"status": "ok"}), 200
    finally:
        db.close()

@app.route("/api/v1/restart_watchdog", methods=["POST"])
@require_apikey
def api_restart_watchdog():
    """Restart a specific watchdog instance."""
    data = request.get_json() or {}
    client_name = data.get("client_name")
    logger.info("{bold}API{reset} Restart requested for client: {cyan}%s{reset}", client_name)
    target_watchdog = None
    for w in watchdogs:
        if client_name and w.name == client_name:
            target_watchdog = w
            break
        elif not client_name and watchdogs:
            target_watchdog = watchdogs[0]
            break
    if not target_watchdog:
        logger.warning("{bold}API{reset} No watchdog found for client: {cyan}%s{reset}", client_name)
        return jsonify({"error": f"Watchdog not found for client '{client_name}'"}), 404
    logger.info("{bold}API{reset} Stopping watchdog {cyan}%s{reset}...", target_watchdog.name)
    target_watchdog.stop()
    logger.info("{bold}API{reset} Starting watchdog {cyan}%s{reset}...", target_watchdog.name)
    target_watchdog.start()
    logger.info("{bold}API{reset} Watchdog {cyan}%s{reset} restarted successfully", target_watchdog.name)
    return jsonify({"status": "ok", "message": f"Watchdog '{target_watchdog.name}' restarted"}), 200

@app.route("/api/v1/force_watchdog_scan", methods=["POST"])
@require_apikey
def api_force_watchdog_scan():
    """Force an immediate scan of a watchdog."""
    data = request.get_json() or {}
    client_name = data.get("client_name")
    logger.info("{bold}API{reset} Force scan requested for client: {cyan}%s{reset}", client_name)
    target_watchdog = None
    for w in watchdogs:
        if client_name and w.name == client_name:
            target_watchdog = w
            break
        elif not client_name and watchdogs:
            target_watchdog = watchdogs[0]
            break
    if not target_watchdog:
        logger.warning("{bold}API{reset} No watchdog found for client: {cyan}%s{reset}", client_name)
        return jsonify({"error": f"Watchdog not found for client '{client_name}'"}), 404
    def run_cycle():
        logger.info("{bold}Watchdog{reset} Manual scan thread started for {cyan}%s{reset}", target_watchdog.name)
        try:
            target_watchdog._cycle()
            logger.info("{bold}Watchdog{reset} Manual scan completed for {cyan}%s{reset}", target_watchdog.name)
        except Exception:
            logger.exception("{bold}Watchdog{reset} Manual scan failed for {cyan}%s{reset}", target_watchdog.name)
    threading.Thread(target=run_cycle, daemon=True).start()
    return jsonify({"status": "ok", "message": f"Scan triggered for {target_watchdog.name}"}), 200

# -----------------------------------------------------------------------------
# Database backup & restore helpers
# -----------------------------------------------------------------------------
def validate_sqlite_file(file_path: str) -> bool:
    """Check if the file is a valid SQLite database by reading the header."""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
        return header[:13] == b'SQLite format 3\x00' or header[:13] == b'SQLite format 3\0'
    except Exception:
        return False

@app.route("/api/v1/db/backup", methods=["GET"])
@require_apikey
def api_db_backup():
    """Download the current database file."""
    db_path = os.getenv("ENDARR_DATA_DIR", "/data") + "/endarr.db"
    if not os.path.exists(db_path):
        logger.warning("{bold}DB Backup{reset} Database file not found at {cyan}%s{reset}", db_path)
        return jsonify({"error": "Database file not found"}), 404
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"endarr_backup_{timestamp}.db"
    logger.info("{bold}DB Backup{reset} Downloaded by %s", request.remote_addr)
    return send_file(db_path, as_attachment=True, download_name=filename, mimetype="application/octet-stream")

@app.route("/api/v1/db/restore", methods=["POST"])
@require_apikey
def api_db_restore():
    """Replace the database with an uploaded backup file."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    db_path = os.getenv("ENDARR_DATA_DIR", "/data") + "/endarr.db"
    pre_backup_path = None
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        if not validate_sqlite_file(tmp_path):
            os.unlink(tmp_path)
            logger.warning("{bold}DB Restore{reset} Invalid database file uploaded by %s", request.remote_addr)
            return jsonify({"error": "Invalid or corrupted database file"}), 400
        if os.path.exists(db_path):
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            pre_backup_path = f"{db_path}.{timestamp}.pre_restore.bak"
            shutil.copy2(db_path, pre_backup_path)
            logger.info("{bold}DB Restore{reset} Pre-restore backup saved to {cyan}%s{reset}", pre_backup_path)
        # Pause watchdogs
        logger.info("{bold}DB Restore{reset} Pausing %d watchdogs...", len(watchdogs))
        for w in watchdogs:
            w.stop()
        shutil.move(tmp_path, db_path)
        logger.info("{bold}DB Restore{reset} Database replaced with uploaded file")
        for w in watchdogs:
            w.start()
        logger.info("{bold}DB Restore{reset} Watchdogs restarted")
        return jsonify({"status": "ok", "message": "Database restored successfully."})
    except Exception as e:
        logger.exception("{bold}DB Restore{reset} Failed: %s", e)
        if pre_backup_path and os.path.exists(pre_backup_path):
            try:
                shutil.move(pre_backup_path, db_path)
                logger.info("{bold}DB Restore{reset} Rolled back to pre-restore backup")
            except Exception as rollback_err:
                logger.exception("{bold}DB Restore{reset} Rollback failed: %s", rollback_err)
        for w in watchdogs:
            try:
                w.start()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

# -----------------------------------------------------------------------------
# Webhook endpoint (external)
# -----------------------------------------------------------------------------
@app.route("/arr", methods=["POST"])
def arr_webhook():
    """Receive webhooks from *Arr applications."""
    return handle_arr_webhook()

# Record start time for uptime calculation
start_time = time.time()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7070, debug=False)
