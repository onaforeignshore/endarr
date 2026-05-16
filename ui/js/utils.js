// ui/js/utils.js – Shared front‑end utilities

/**
 * Escape HTML special characters to prevent XSS.
 * @param {any} str - Input string (will be converted to string).
 * @returns {string} Escaped HTML string.
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return ''
    if (typeof str !== 'string') str = String(str)
    return str.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m)
}

/**
 * Format a Unix timestamp (seconds) to a locale date/time string.
 * @param {number} ts - Unix timestamp in seconds.
 * @returns {string} Formatted date string, or '—' if falsy.
 */
export function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleString()
}

/**
 * Format bytes to a human‑readable string (e.g., '1.5 MB').
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted string, e.g., '0 B', '1.5 MB'.
 */
export function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || bytes === '') return '0 B'
    const num = Number(bytes)
    if (isNaN(num) || num < 0) return '0 B'
    if (num === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(num) / Math.log(1024))
    return (num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
}

/**
 * Format seconds to a compact human‑readable duration (e.g., '1d', '2h 30m').
 * @param {number} seconds - Duration in seconds.
 * @returns {string} Compact duration string.
 */
export function formatDuration(seconds) {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
    return `${seconds}s`
}

let cachedKey = null

/**
 * Get the API key from local storage.
 * @returns {string} The API key, or null if not found.
 */
export function getApiKey() {
    if (cachedKey) return cachedKey
    const stored = localStorage.getItem('endarr_api_key')
    if (stored) cachedKey = stored
    return cachedKey
}

/**
 * Conditional debug logging. Only outputs to console if the current log level is DEBUG.
 * The log level is retrieved from localStorage (set by app.js after fetching from server).
 * @param {...any} args - Arguments to pass to console.log
 */
export function consoleDebug(...args) {
    const level = localStorage.getItem('endarr_log_level') || 'INFO'
    if (level === 'DEBUG') {
        console.log(...args)
    }
}

/**
 * Parse filter values from the current URL query string.
 * @returns {Object} Parsed filter object.
 */
export function getFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search)
    const filters = {}
    for (const [key, value] of params.entries()) {
        filters[key] = value
    }
    return filters
}

/**
 * Update the browser URL with the given filter values without reloading.
 * @param {Object} filters - Key‑value pairs to store in the query string.
 */
export function updateUrlFilters(filters) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== '__all__' && value !== '') {
            params.set(key, value)
        }
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`
    history.pushState(null, '', newUrl)
}
