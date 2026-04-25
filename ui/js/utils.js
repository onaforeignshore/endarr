// ui/js/utils.js – Shared front‑end utilities

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m);
}

/**
 * Format a Unix timestamp (seconds) to a locale date/time string.
 */
export function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
}

/**
 * Format bytes to a human‑readable string.
 */
export function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
}

/**
 * Format seconds to a compact human‑readable duration (e.g., '1h 30m').
 */
export function formatDuration(seconds) {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
}

/**
 * Parse filter values from the current URL query string.
 * @returns {Object} Parsed filter object.
 */
export function getFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const filters = {};
    for (const [key, value] of params.entries()) {
        filters[key] = value;
    }
    return filters;
}

/**
 * Update the browser URL with the given filter values without reloading.
 * @param {Object} filters - Key‑value pairs to store in the query string.
 */
export function updateUrlFilters(filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== '__all__' && value !== '') {
            params.set(key, value);
        }
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.pushState(null, '', newUrl);
}