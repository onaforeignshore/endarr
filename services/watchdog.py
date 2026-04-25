# services/watchdog.py
import logging
import threading
import time
from typing import Any, Dict, Optional

from config_loader import get_policy_for_torrent, is_protected
from models.blacklist import Blacklist
from models.database import SessionLocal
from models.downloads import Download
from models.grabs import Grab
from models.torrent_files import TorrentFile
from services.deletion_policy import should_delete_torrent
from services.download_client import DownloadClient
from services.file_scanner import has_dangerous_files
from utils.titles import normalize_release_title
from utils.url_utils import extract_domain

logger = logging.getLogger(__name__)

class Watchdog:
    def __init__(self, config: Dict[str, Any], download_client: DownloadClient, arr_clients: Dict[str, Any], check_interval: int = 900, name: str = "default", client_id=None):
        self.config = config
        self.download_client = download_client
        self.arr_clients = arr_clients
        self.interval = check_interval
        self.name = name
        self.client_id = client_id
        self._stop_event = threading.Event()
        self.thread = None
        self.last_run = None

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._run, daemon=False)
        self.thread.start()
        logger.info("{bold}Watchdog{reset} Thread started")

    def stop(self):
        self._stop_event.set()
        if self.thread:
            self.thread.join(timeout=10)
        logger.info("{bold}Watchdog{reset} Thread stopped")

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self._cycle()
            except Exception as e:
                logger.exception("{bold}Watchdog{reset} Cycle error: %s", e)
            self._stop_event.wait(self.interval)

    def _cycle(self):
        logger.debug("{bold}Watchdog{reset} Cycle starting")
        torrents = self.download_client.get_torrents()
        db = SessionLocal()
        try:
            known_hashes = {d.hash for d in db.query(Download.hash).all()}
            for t in torrents:
                torrent_hash = t["hash"]
                if torrent_hash not in known_hashes:
                    self._handle_new_torrent(db, t)
                else:
                    self._handle_existing_torrent(db, t)
            self._prune_old_grabs(db)
            db.commit()
        finally:
            db.close()
        logger.debug("{bold}Watchdog{reset} Cycle finished")
        self.last_run = time.time()

    def _check_speed_threshold(self, torrent_info: Dict[str, Any], download: Download, db) -> bool:
        """Return True if torrent should be deleted due to slow download speed."""
        cleanup_cfg = self.config.get("stalled_download_cleanup", {})
        if not cleanup_cfg.get("enabled", False):
            return False

        # Only apply to downloading torrents (progress < 1.0)
        progress = torrent_info.get("progress", 0.0)
        if progress >= 1.0:
            # Download finished – reset tracking
            if download.speed_below_threshold_since is not None:
                download.speed_below_threshold_since = None
                db.commit()
            return False

        min_speed_kb = cleanup_cfg.get("min_speed_kb", 10)
        min_speed_duration = cleanup_cfg.get("min_speed_duration", 300)
        action = cleanup_cfg.get("action", "delete")
        blacklist_on_delete = cleanup_cfg.get("blacklist", False)

        # Current download speed in bytes/s -> KB/s
        dlspeed = torrent_info.get("dlspeed", 0)
        dlspeed_kb = dlspeed / 1024.0

        now = time.time()
        if dlspeed_kb < min_speed_kb:
            if download.speed_below_threshold_since is None:
                download.speed_below_threshold_since = now
                db.commit()
            else:
                duration = now - download.speed_below_threshold_since
                if duration >= min_speed_duration and action == "delete":
                    # Delete and optionally blacklist
                    self.download_client.delete_torrent(torrent_info["hash"], delete_files=True)
                    download.deleted_at = now
                    download.delete_reason = "slow_download_speed"
                    logger.info("{bold}Watchdog{reset} Deleted torrent {cyan}%s{reset} due to slow download speed (%.1f KB/s for %.0f sec)",
                                torrent_info.get("name", torrent_info["hash"]), dlspeed_kb, duration)
                    if blacklist_on_delete:
                        self._blacklist_torrent(db, download, torrent_info, reason="slow_download")
                    db.commit()
                    return True
        else:
            # Speed recovered – reset timer
            if download.speed_below_threshold_since is not None:
                download.speed_below_threshold_since = None
                db.commit()
        return False

    def _blacklist_torrent(self, db, download: Download, torrent_info: Dict[str, Any], reason: str):
        """Add blacklist entry for a torrent."""
        name = torrent_info.get("name", "")
        release_title = name
        arr_name = None
        grab_id = None
        if download.grab_id:
            grab = db.query(Grab).filter(Grab.id == download.grab_id).first()
            if grab:
                release_title = grab.release_title
                arr_name = grab.arr_name
                grab_id = grab.id
        blacklist = Blacklist(
            release_title=release_title,
            arr_name=arr_name,
            reason=reason,
            source="watchdog",
            blocked_at=time.time(),
            expires_at=None,
            grab_id=grab_id
        )
        db.add(blacklist)
        logger.info("{bold}Watchdog{reset} Blacklisted release {cyan}%s{reset} due to %s", release_title, reason)

    def _handle_new_torrent(self, db, torrent_info: Dict[str, Any]):
        torrent_hash = torrent_info["hash"]
        name = torrent_info.get("name", "")
        category = torrent_info.get("category", "")
        save_path = torrent_info.get("save_path", "")
        total_size = torrent_info.get("total_size", 0)
        added_on = torrent_info.get("added_on", time.time())

        normalized_name = normalize_release_title(name)

        # Try to match grab by normalized title first, then fallback to ILIKE
        grabs = db.query(Grab).all()
        grab = None
        for g in grabs:
            if normalize_release_title(g.release_title) in normalized_name:
                grab = g
                break

        if not grab:
            grab = db.query(Grab).filter(Grab.release_title.ilike(f"%{name}%")).order_by(Grab.grabbed_at.desc()).first()

        if grab:
            grab_id = grab.id
            logger.info("{bold}Watchdog{reset} Matched new torrent {cyan}%s{reset} to grab ID {cyan}%d{reset}", name, grab_id)
            # Insert tracked torrent
            download = Download(
                hash=torrent_hash,
                name=name,
                grab_id=grab_id,
                client_id=self.client_id,
                added_to_client_at=added_on,
                save_path=save_path,
                total_size=total_size,
                category=category,
                dangerous_files=0,
                last_check=time.time(),
                ignored=False
            )
            db.add(download)
            db.flush()

            # File scan for dangerous content
            try:
                files = self.download_client.get_torrent_files(torrent_hash)
                dangerous_exts = self.config.get("dangerous_extensions", [])
                is_dangerous = has_dangerous_files(files, dangerous_exts)
                for f in files:
                    tf = TorrentFile(
                        hash=torrent_hash,
                        file_path=f.get("name", ""),
                        file_size=f.get("size", 0),
                        progress=f.get("progress", 0.0),
                        is_dangerous=is_dangerous and has_dangerous_files([f], dangerous_exts)
                    )
                    db.add(tf)
                if is_dangerous:
                    download.dangerous_files = 2
                    download.delete_reason = "malicious"
                    self.download_client.delete_torrent(torrent_hash, delete_files=True)
                    blacklist = Blacklist(
                        release_title=name,
                        arr_name=grab.arr_name if grab else None,
                        indexer=grab.indexer if grab else None,
                        reason="malicious_file",
                        source="file_scanner",
                        blocked_at=time.time()
                    )
                    db.add(blacklist)
                    logger.warning("{bold}Watchdog{reset} Deleted malicious torrent {cyan}%s{reset}", name)
                else:
                    download.dangerous_files = 1
            except Exception as e:
                logger.error("{bold}Watchdog{reset} File scan failed for {cyan}%s{reset}: %s", torrent_hash, e)
            db.commit()
        else:
            # No matching grab – insert as ignored to avoid reprocessing
            logger.warning("{bold}Watchdog{reset} No matching grab for {cyan}%s{reset} – marking as ignored", name)
            download = Download(
                hash=torrent_hash,
                name=name,
                grab_id=None,
                client_id=self.client_id,
                added_to_client_at=added_on,
                save_path=save_path,
                total_size=total_size,
                category=category,
                ignored=True
            )
            db.add(download)
            db.commit()
            # No further processing

    def _handle_existing_torrent(self, db, torrent_info: Dict[str, Any]):
        torrent_hash = torrent_info["hash"]
        name = torrent_info.get("name", torrent_hash)
        download = db.query(Download).filter(Download.hash == torrent_hash).first()
        if not download or download.deleted_at:
            return

        # --- Re-check ignored torrents if the name has changed from a hash ---
        if download.ignored:
            is_hash_like = (len(name) == 40 and all(c in "0123456789abcdef" for c in name.lower())) or len(name) < 10
            if not is_hash_like:
                normalized_name = normalize_release_title(name)
                grabs = db.query(Grab).all()
                matched_grab = None
                for g in grabs:
                    if normalize_release_title(g.release_title) in normalized_name:
                        matched_grab = g
                        break
                if matched_grab:
                    download.grab_id = matched_grab.id
                    download.ignored = False
                    if name and name != download.name:
                        download.name = name
                    download.category = torrent_info.get("category", download.category)
                    download.save_path = torrent_info.get("save_path", download.save_path)
                    logger.info("{bold}Watchdog{reset} Matched previously ignored torrent {cyan}%s{reset} to grab {cyan}%d{reset} after name update", name, matched_grab.id)
                    db.commit()
                else:
                    logger.debug("{bold}Watchdog{reset} Ignored torrent {cyan}%s{reset} now has name but no grab match after normalization, still ignoring", name)
                    return
            else:
                return

        if download.ignored:
            logger.debug("{bold}Watchdog{reset} Skipping ignored torrent {cyan}%s{reset}", name)
            return

        # Update basic fields
        if name and name != download.name:
            download.name = name
        download.save_path = torrent_info.get("save_path", download.save_path)
        download.category = torrent_info.get("category", download.category)
        download.total_size = torrent_info.get("total_size", download.total_size)
        download.last_check = time.time()

        # Ensure file list exists (fetch if missing)
        files_exist = db.query(TorrentFile).filter(TorrentFile.hash == torrent_hash).first()
        if not files_exist:
            try:
                files = self.download_client.get_torrent_files(torrent_hash)
                for f in files:
                    tf = TorrentFile(
                        hash=torrent_hash,
                        file_path=f.get("name", ""),
                        file_size=f.get("size", 0),
                        progress=f.get("progress", 0.0),
                        is_dangerous=False
                    )
                    db.add(tf)
                db.commit()
                logger.debug("{bold}Watchdog{reset} Fetched file list for existing torrent {cyan}%s{reset}", name)
            except Exception as e:
                logger.warning("{bold}Watchdog{reset} Could not fetch files for {cyan}%s{reset}: %s", name, e)

        # --- General Cleanup: Torrent Age ---
        general_cleanup = self.config.get("general_cleanup", {})
        max_age_days = general_cleanup.get("torrent_age_days", 0)
        if max_age_days > 0:
            added_on = torrent_info.get("added_on", 0)
            if added_on and (time.time() - added_on) > max_age_days * 86400:
                self.download_client.delete_torrent(torrent_hash, delete_files=True)
                download.deleted_at = time.time()
                download.delete_reason = "torrent_age"
                logger.info("{bold}Watchdog{reset} Deleted torrent {cyan}%s{reset} due to age (older than %d days)", name, max_age_days)
                db.commit()
                return

        # --- Error State Check ---
        problematic_cfg = self.config.get("problematic_torrents", {})
        state = torrent_info.get("state", "")
        if state == "error" and problematic_cfg.get("error_state_enabled", False):
            self.download_client.delete_torrent(torrent_hash, delete_files=True)
            download.deleted_at = time.time()
            download.delete_reason = "error_state"
            logger.info("{bold}Watchdog{reset} Deleted torrent {cyan}%s{reset} due to error state", name)
            db.commit()
            return

        # --- Maximum Download Time Check (only for incomplete torrents) ---
        max_download_hours = problematic_cfg.get("max_download_time_hours", 0)
        if max_download_hours > 0 and not download.import_completed_at:
            added_on = torrent_info.get("added_on", 0)
            if added_on and (time.time() - added_on) > max_download_hours * 3600:
                self.download_client.delete_torrent(torrent_hash, delete_files=True)
                download.deleted_at = time.time()
                download.delete_reason = "max_download_time"
                logger.info("{bold}Watchdog{reset} Deleted torrent {cyan}%s{reset} after exceeding max download time (%d hours)", name, max_download_hours)
                db.commit()
                return

        # Speed threshold cleanup
        if self._check_speed_threshold(torrent_info, download, db):
            return

        # Determine arr_name from grab
        arr_id = None
        arr_name = "unknown"
        if download.grab_id:
            grab = db.query(Grab).filter(Grab.id == download.grab_id).first()
            if grab:
                arr_name = grab.arr_name
                arr_id = grab.arr_id

        # Extract tags from torrent_info
        tags_raw = torrent_info.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

        # Extract tracker domain
        tracker_domain = ""
        try:
            trackers = self.download_client.get_torrent_trackers(torrent_hash)
            if trackers:
                tracker_url = trackers[0].get("url", "")
                if tracker_url:
                    tracker_domain = extract_domain(tracker_url)
        except Exception as e:
            logger.debug("{bold}Watchdog{reset} Could not fetch trackers for {cyan}%s{reset}: %s", name, e)

        protected = is_protected(self.config, tags, download.category, tracker_domain)

        # Availability tracking
        seeds = torrent_info.get("num_seeds", 0)
        peers = torrent_info.get("num_peers", 0)
        if seeds + peers == 0:
            if download.availability_zero_since is None:
                download.availability_zero_since = time.time()
                db.commit()
        else:
            download.availability_zero_since = None
            db.commit()

        # --- Strike System ---
        progress = torrent_info.get("progress", 0.0)
        added_on = torrent_info.get("added_on", 0)
        age = time.time() - added_on
        cleanup_cfg = self.config.get("stalled_download_cleanup", {})
        stall_min_age = cleanup_cfg.get("min_age_seconds", 300)
        stall_progress_threshold = cleanup_cfg.get("min_progress", 0.05)

        is_stalled = (state == "stalledDL" and progress < stall_progress_threshold and age > stall_min_age)

        policy = get_policy_for_torrent(self.config, arr_id, download.category)
        strike_threshold = policy.get("strike_threshold", 3)
        strike_action = policy.get("strike_action", "delete")
        strike_blacklist = policy.get("strike_blacklist", False)

        if is_stalled:
            download.stall_strikes += 1
            db.commit()
            logger.debug("{bold}Watchdog{reset} Torrent {cyan}%s{reset} stalled, strike %d/%d", name, download.stall_strikes, strike_threshold)
            if download.stall_strikes >= strike_threshold and strike_action == "delete":
                self.download_client.delete_torrent(torrent_hash, delete_files=True)
                download.deleted_at = time.time()
                download.delete_reason = "stalled_strikes"
                logger.info("{bold}Watchdog{reset} Deleted stalled torrent {cyan}%s{reset} after %d strikes", name, download.stall_strikes)

                if strike_blacklist:
                    release_title = name
                    blacklist_arr_name = None
                    blacklist_grab_id = None
                    if download.grab_id:
                        grab = db.query(Grab).filter(Grab.id == download.grab_id).first()
                        if grab:
                            release_title = grab.release_title
                            blacklist_arr_name = grab.arr_name
                            blacklist_grab_id = grab.id
                    blacklist_entry = Blacklist(
                        release_title=release_title,
                        arr_name=blacklist_arr_name,
                        reason="stalled",
                        source="watchdog",
                        blocked_at=time.time(),
                        expires_at=None,
                        grab_id=blacklist_grab_id
                    )
                    db.add(blacklist_entry)
                    logger.info("{bold}Watchdog{reset} Blacklisted release {cyan}%s{reset} due to stall strikes", release_title)

                self._trigger_search(db, download, torrent_info, "stalled_strikes")
                db.commit()
                return
        else:
            if download.stall_strikes > 0:
                download.stall_strikes = 0
                db.commit()
                logger.debug("{bold}Watchdog{reset} Torrent {cyan}%s{reset} no longer stalled, resetting strikes", name)

        # --- Normal Deletion Policy (immediate, ratio, etc.) ---
        should_delete = should_delete_torrent(
            torrent_info, policy, protected, download.availability_zero_since,
            import_completed=bool(download.import_completed_at)
        )

        # Additional checks for advanced conditions (Upload Amount, Minimum Seeders)
        if should_delete:
            # Minimum Seeders prerequisite
            min_seeders = policy.get("min_seeders", 0)
            if min_seeders > 0 and seeds < min_seeders:
                should_delete = False
                logger.debug("{bold}Watchdog{reset} Torrent {cyan}%s{reset} deletion deferred: min seeders (%d) not met (current: %d)", name, min_seeders, seeds)

            # Upload Amount (already handled by should_delete_torrent? No, it's not in there yet. We'll add it here.)
            upload_bytes_threshold = policy.get("upload_amount_bytes", 0)
            if should_delete and upload_bytes_threshold > 0:
                total_uploaded = torrent_info.get("total_uploaded", 0)
                if total_uploaded < upload_bytes_threshold:
                    should_delete = False
                    logger.debug("{bold}Watchdog{reset} Torrent {cyan}%s{reset} deletion deferred: upload amount (%d bytes) not met (current: %d)", name, upload_bytes_threshold, total_uploaded)

        logger.debug(
            "{bold}Watchdog{reset} Torrent {cyan}%s{reset} (%s): delete=%s, policy=%s, ratio=%.2f, seeds=%d, peers=%d, "
            "import=%s, protected=%s",
            name, torrent_hash, should_delete, policy.get("delete_policy"),
            torrent_info.get("ratio", 0.0), seeds, peers,
            "yes" if download.import_completed_at else "no",
            protected
        )

        if should_delete:
            self.download_client.delete_torrent(torrent_hash, delete_files=True)
            download.deleted_at = time.time()
            download.delete_reason = "policy_met"
            if policy.get("policy_blacklist", False):
                self._blacklist_torrent(db, download, torrent_info, reason="policy_deletion")
            self._trigger_search(db, download, torrent_info, "policy_met")
            db.commit()
            logger.info("{bold}Watchdog{reset} Deleted torrent {cyan}%s{reset} due to policy {cyan}%s{reset}", name, policy.get("delete_policy"))

    def _prune_old_grabs(self, db):
        retention_days = self.config.get("grabs_retention_days", 30)
        if retention_days <= 0:
            return
        cutoff = time.time() - (retention_days * 86400)
        deleted = db.query(Grab).filter(Grab.grabbed_at < cutoff).delete()
        if deleted:
            logger.info("{bold}Watchdog{reset} Pruned {cyan}%d{reset} old grabs", deleted)

    def _trigger_search(self, db, download, torrent_info, delete_reason):
        """Trigger a search in the *Arr for a replacement."""
        if not download.grab_id:
            return
        grab = db.query(Grab).filter(Grab.id == download.grab_id).first()
        if not grab:
            return
        arr_name = grab.arr_name
        media_id = grab.media_id
        media_type = grab.media_type
        arr_client = None  # Need to pass or get from config
        # We'll need to access arr clients from a global store; we can add to self.config
        # For now, assume they are stored in self.arr_clients (we'll set in __init__)
        arr_client = self.arr_clients.get(arr_name)
        if not arr_client:
            logger.warning("{bold}Watchdog{reset} No client for {cyan}%s{reset} to trigger search", arr_name)
            return
        policy = get_policy_for_torrent(self.config, arr_name, download.category)
        if policy.get("search_on_delete", False):
            arr_client.search_for_media(media_type, int(media_id))
