// ui/js/chipStyles.js – shared chip colours and labels

/**
 * Convert snake_case to Title Case.
 * @param {string} str
 * @returns {string}
 */
function toTitle(str) {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Return chip label and CSS class for an event type and optional reason.
 * @param {string} type - Event type (grab, import, deletion, upgrade, blacklist, stall, malicious).
 * @param {string} [reason] - Deletion or blacklist reason.
 * @returns {{label: string, chipClass: string}}
 */
export function getStatusChip(type, reason) {
    const key =
        type === 'deletion' || type === 'stall' || type === 'malicious' || type === 'blacklist'
            ? `${type}:${reason || 'policy_met'}`
            : type

    const map = {
        // Simple types
        grab: { label: 'Grabbed', chipClass: 'chip-info' },
        import: { label: 'Imported', chipClass: 'chip-success' },
        upgrade: { label: 'Upgraded', chipClass: 'chip-accent' },

        // Deletion reasons
        'deletion:policy_met': { label: 'Policy Met', chipClass: 'chip-danger' },
        'deletion:stalled_strikes': { label: 'Stalled Strikes', chipClass: 'chip-warning' },
        'deletion:slow_download_speed': { label: 'Slow Download Speed', chipClass: 'chip-danger' },
        'deletion:slow_download': { label: 'Slow Download', chipClass: 'chip-warning' },
        'deletion:max_download_time': { label: 'Max Download Time', chipClass: 'chip-warning' },
        'deletion:torrent_age': { label: 'Torrent Age', chipClass: 'chip-warning' },
        'deletion:error_state': { label: 'Error State', chipClass: 'chip-danger' },
        'deletion:malicious': { label: 'Malicious File', chipClass: 'chip-danger' },
        'deletion:malicious_file': { label: 'Malicious File', chipClass: 'chip-danger' },
        'deletion:manual': { label: 'Manual', chipClass: 'chip-danger' },
        'deletion:manual_batch': { label: 'Manual (Batch)', chipClass: 'chip-danger' },
        'deletion:removed_from_client': { label: 'Removed From Client', chipClass: 'chip-teal' },
        'deletion:upgraded': { label: 'Upgraded', chipClass: 'chip-accent' },

        // Blacklist reasons (use same colours as deletion)
        'blacklist:manual': { label: 'Manual', chipClass: 'chip-danger' },
        'blacklist:malicious_file': { label: 'Malicious File', chipClass: 'chip-danger' },
        'blacklist:stalled': { label: 'Stalled', chipClass: 'chip-warning' },
        'blacklist:stalled_strikes': { label: 'Stalled Strikes', chipClass: 'chip-warning' },
        'blacklist:slow_download': { label: 'Slow Download', chipClass: 'chip-warning' },
        'blacklist:slow_download_speed': {
            label: 'Slow Download Speed',
            chipClass: 'chip-warning',
        },
        'blacklist:policy_met': { label: 'Policy Met', chipClass: 'chip-warning' },
        'blacklist:policy_deletion': { label: 'Policy Deletion', chipClass: 'chip-warning' },
    }

    return map[key] || { label: toTitle(type), chipClass: 'chip-neutral' }
}

/**
 * Return CSS class for an ARR name chip.
 * @param {string} arrName - Name of the ARR (radarr, sonarr, lidarr, etc.)
 * @returns {string}
 */
export function getArrChipClass(arrName) {
    const ARR_CHIP_CLASSES = {
        radarr: 'chip-radarr',
        sonarr: 'chip-sonarr',
        lidarr: 'chip-lidarr',
    }
    return ARR_CHIP_CLASSES[arrName] || 'chip-neutral'
}
