import json
import logging
import sys
import time

from flask import current_app, jsonify, request

from config_loader import get_policy_for_torrent
from models.blacklist import Blacklist
from models.database import SessionLocal
from models.downloads import Download
from models.grabs import Grab
from services.download_client import DownloadClient

logger = logging.getLogger(__name__)

def format_kv(key, value):
    """Helper to colour key=value pairs."""
    return f"{{cyan}}{key}{{reset}}={value}"

def handle_arr_webhook():
    webhook_key = current_app.config.get("ENDARR_CONFIG", {}).get("webhook_key", "")
    if webhook_key:
        key = request.args.get("apikey")
        if key != webhook_key:
            logger.warning("{bold}Webhook{reset} {red}[ERROR]{reset} Invalid API key from {cyan}%s{reset}", request.remote_addr)
            return jsonify({"status": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "no json"}), 200

    # *Arr events
    if "eventType" in data:
        if data["eventType"] == "Grab":
            return handle_grab(data)
        if data["eventType"] == "Download":
            return handle_download(data)
        # Any other eventType (e.g., "Test")
        event_type = data.get("eventType")
        if event_type == "Test":
            # Try to identify which *Arr sent the test
            if "movie" in data:
                arr_name = "Radarr"
            elif "series" in data:
                arr_name = "Sonarr"
            elif "artist" in data or "album" in data:
                arr_name = "Lidarr"
            else:
                arr_name = "Unknown *Arr"
            logger.info("{bold}Webhook{reset} {green}[TEST]{reset} Received test from {cyan}%s{reset} (eventType=%s)", arr_name, event_type)
        else:
            logger.debug("{bold}Webhook{reset} Ignored unknown eventType: {cyan}%s{reset}", event_type)
        return jsonify({"status": "ignored"}), 200

    # Unknown payload structure
    logger.debug("{bold}Webhook{reset} Ignored unknown webhook payload structure")
    return jsonify({"status": "ignored"}), 200

def handle_grab(data):
    arr_name = None
    if "series" in data:
        arr_name = "sonarr"
        media_id = str(data.get("series", {}).get("id"))
        media_type = "episode"
        # Sonarr: release title is in data["release"]["releaseTitle"]
        release_title = data.get("release", {}).get("releaseTitle", "") or data.get("title", "")
    elif "movie" in data:
        arr_name = "radarr"
        media_id = str(data.get("movie", {}).get("id"))
        media_type = "movie"
        # Radarr: release title is in data["release"]["releaseTitle"]
        release_title = data.get("release", {}).get("releaseTitle", "") or data.get("title", "")
    elif "artist" in data or "album" in data:
        arr_name = "lidarr"
        media_id = str(data.get("artist", {}).get("id") or data.get("album", {}).get("id"))
        media_type = "album"
        # Lidarr: likely similar; fallback to title
        release_title = data.get("release", {}).get("releaseTitle", "") or data.get("title", "")
    else:
        logger.warning("Unknown *Arr type in grab")
        return jsonify({"status": "unknown arr"}), 200

    # Extract client_id from query parameter
    client_id = request.args.get("client")

    # Blacklist check
    db = SessionLocal()
    try:
        blacklisted = db.query(Blacklist).filter(
            Blacklist.release_title == release_title,
            (Blacklist.arr_name == arr_name) | (Blacklist.arr_name.is_(None))
        ).first()
        if blacklisted:
            logger.info("{bold}Grab{reset} {yellow}[BLOCKED]{reset} Release {cyan}%s{reset} is blacklisted (reason=%s). Ignoring.",
                        release_title, blacklisted.reason)
            # Reject the release via *Arr API
            arr_client = current_app.config.get("ARR_CLIENTS", {}).get(arr_name)
            if arr_client:
                arr_client.reject_release(release_title, reason=f"Blacklisted: {blacklisted.reason}")
            return jsonify({"status": "blacklisted"}), 200
    finally:
        db.close()

    indexer = data.get("indexer", "")
    quality = data.get("quality", "")
    size = data.get("size", 0)
    grabbed_at = time.time()

    db = SessionLocal()
    try:
        grab = Grab(
            release_title=release_title,
            arr_name=arr_name,
            grabbed_at=grabbed_at,
            media_id=media_id,
            media_type=media_type,
            indexer=indexer,
            quality=quality,
            size=size,
            raw_payload=json.dumps(data),
            client_id=client_id,
            arr_id=client_id
        )
        db.add(grab)
        db.commit()
        logger.info("{bold}Grab{reset} {green}[SUCCESS]{reset} Recorded grab: {cyan}%s{reset} from {cyan}%s{reset} (%s, %s, %s)",
                    release_title, arr_name,
                    format_kv("client_ip", request.remote_addr),
                    format_kv("method", request.method),
                    format_kv("path", request.path))
    except Exception as e:
        logger.exception("{bold}Grab{reset} {red}[ERROR]{reset} Failed to store grab: %s", e)
        db.rollback()
    finally:
        db.close()
    return jsonify({"status": "grabbed"}), 200

def handle_download(data):
    download_id = data.get("downloadId")
    if not download_id:
        logger.error("{bold}DownloadEvent{reset} {red}[ERROR]{reset} Missing downloadId from %s (%s, %s)",
                     request.remote_addr, format_kv("method", request.method), format_kv("path", request.path))
        return jsonify({"status": "missing downloadId"}), 200

    arr_name = None
    if "series" in data:
        arr_name = "sonarr"
    elif "movie" in data:
        arr_name = "radarr"
    elif "artist" in data or "album" in data:
        arr_name = "lidarr"
    else:
        return jsonify({"status": "unknown arr"}), 200

    is_upgrade = data.get("isUpgrade", False)
    media_id = None
    if "series" in data:
        media_id = str(data["series"].get("id"))
    elif "movie" in data:
        media_id = str(data["movie"].get("id"))
    elif "artist" in data:
        media_id = str(data["artist"].get("id"))

    db = SessionLocal()
    try:
        download = db.query(Download).filter(Download.hash == download_id.lower()).first()
        if not download:
            logger.warning("{bold}DownloadEvent{reset} Torrent {cyan}%s{reset} not tracked", download_id)
            return jsonify({"status": "torrent not tracked"}), 200

        # If the torrent was ignored due to no grab match, try to find the grab now
        if download.ignored:
            release_title = None
            # Extract release title from download payload
            if "series" in data:
                # Sonarr includes the episode title in data["episode"]["title"]
                release_title = data.get("episode", {}).get("title")
                if not release_title:
                    release_title = data.get("series", {}).get("title")
            elif "movie" in data:
                release_title = data["movie"].get("title")
            elif "artist" in data:
                release_title = data["artist"].get("artistName")

            if release_title:
                # Look for a recent grab with a matching title
                grab = db.query(Grab).filter(
                    Grab.release_title.ilike(f"%{release_title}%"),
                    Grab.arr_name == arr_name
                ).order_by(Grab.grabbed_at.desc()).first()
                if grab:
                    download.grab_id = grab.id
                    download.ignored = False
                    logger.info("{bold}DownloadEvent{reset} Matched previously ignored torrent {cyan}%s{reset} to grab {cyan}%d{reset} ({cyan}%s{reset})",
                                download_id, grab.id, grab.release_title)

        download.import_completed_at = time.time()

        if is_upgrade and media_id:
            old_download = db.query(Download).join(Grab).filter(
                Grab.media_id == media_id,
                Download.hash != download_id,
                Download.deleted_at.is_(None)
            ).first()
            if old_download:
                category = download.category or ""
                policy = get_policy_for_torrent(current_app.config["ENDARR_CONFIG"], arr_name, category)
                upgrade_action = policy.get("upgrade_action", "move_category")
                upgrade_category = policy.get("upgrade_category", "upgraded")

                # Find the correct client instance
                client_id = old_download.client_id
                client_instances_by_name = current_app.config.get("CLIENT_INSTANCES_BY_NAME", {})
                download_client = None
                # Look up by client_id (which matches the name for now; we could also store a mapping)
                for name, instance in client_instances_by_name.items():
                    if name == client_id:   # or use a separate ID mapping
                        download_client = instance
                        break

                if download_client:
                    if upgrade_action == "delete_immediate":
                        download_client.delete_torrent(old_download.hash, delete_files=True)
                        old_download.deleted_at = time.time()
                        old_download.delete_reason = "upgraded"
                        logger.info("{bold}Upgrade{reset} Deleted old torrent {cyan}%s{reset} (delete_immediate)", old_download.hash)
                    elif upgrade_action == "move_category":
                        download_client.set_torrent_category(old_download.hash, upgrade_category)
                        old_download.category = upgrade_category
                        logger.info("{bold}Upgrade{reset} Moved old torrent {cyan}%s{reset} to category {cyan}%s{reset}", old_download.hash, upgrade_category)
                    # else do_nothing – just log
                    else:
                        logger.info("{bold}Upgrade{reset} Took no action on old torrent {cyan}%s{reset} (do_nothing)", old_download.hash)

                download.replaces_hash = old_download.hash
                old_download.replaced_by_hash = download.hash
                download.upgraded_at = time.time()
        db.commit()
        logger.info("{bold}DownloadEvent{reset} {green}[SUCCESS]{reset} Processed for {cyan}%s{reset} (upgrade=%s)", download_id, is_upgrade)
    except Exception as e:
        logger.exception("{bold}DownloadEvent{reset} {red}[ERROR]{reset} %s", e)
        db.rollback()
    finally:
        db.close()
    return jsonify({"status": "ok"}), 200
