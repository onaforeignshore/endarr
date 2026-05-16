// ui/js/config.js
import { getApiKey, consoleDebug } from './utils.js'

/**
 * Load configuration from the server.
 * @returns {Promise<Object>}
 */
export async function loadConfig() {
    const key = getApiKey()
    if (!key) throw new Error('No API key')
    const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
    if (!resp.ok) throw new Error('Failed to load config')
    return await resp.json()
}

/**
 * Save configuration to the server.
 * @param {Object} config - Configuration object.
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
    const key = getApiKey()
    const resp = await fetch('/api/v1/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify(config),
    })
    if (!resp.ok) throw new Error('Failed to save config')
    window.isSettingsDirty = false
}

/**
 * Generic API caller with authentication.
 * @param {string} endpoint - API endpoint URL.
 * @param {Object} [options] - Fetch options (method, body, etc.).
 * @returns {Promise<any>}
 */
export async function apiCall(endpoint, options = {}) {
    const key = getApiKey()
    const resp = await fetch(endpoint, {
        ...options,
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', ...options.headers },
    })
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || `HTTP ${resp.status}`)
    }
    return resp.json()
}