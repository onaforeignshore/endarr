// ui/js/settings.js
let globalConfig = null

async function loadConfig() {
    if (globalConfig) return globalConfig
    const key = localStorage.getItem('endarr_api_key')
    if (!key) throw new Error('No API key')
    const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
    if (!resp.ok) throw new Error('Failed to load config')
    globalConfig = await resp.json()
    return globalConfig
}

async function saveConfig(config) {
    const key = localStorage.getItem('endarr_api_key')
    if (!key) throw new Error('No API key')
    const resp = await fetch('/api/v1/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify(config),
    })
    if (!resp.ok) throw new Error('Failed to save config')
    globalConfig = config
}

async function apiCall(endpoint, options = {}) {
    const key = localStorage.getItem('endarr_api_key')
    if (!key) throw new Error('No API key')
    const headers = {
        'X-Api-Key': key,
        'Content-Type': 'application/json',
        ...options.headers,
    }
    const resp = await fetch(endpoint, { ...options, headers })
    if (!resp.ok) {
        const error = await resp.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(error.error || `HTTP ${resp.status}`)
    }
    return resp.json()
}

const settingsSubpages = {
    general: {
        file: 'settings_general.html',
        init: async () => {
            const m = await import('./settings_general.js')
            return m.initGeneralForm(loadConfig, saveConfig)
        },
    },
    torrent: {
        file: 'settings_torrents.html',
        init: async () => {
            const m = await import('./settings_torrents.js')
            return m.initTorrentsForm(loadConfig, saveConfig)
        },
    },
    upgrade: {
        file: 'settings_upgrade.html',
        init: async () => {
            const m = await import('./settings_upgrade.js')
            return m.initUpgradeForm(loadConfig, saveConfig)
        },
    },
    protection: {
        file: 'settings_protection.html',
        init: async () => {
            const m = await import('./settings_protection.js')
            return m.initProtectionForm(loadConfig, saveConfig)
        },
    },
    integrations: {
        file: 'settings_integrations.html',
        init: async () => {
            const m = await import('./settings_integrations.js')
            return m.initIntegrationsForm(loadConfig, saveConfig, apiCall)
        },
    },
    watchdog: {
        file: 'settings_watchdog.html',
        init: async () => {
            const m = await import('./settings_watchdog.js')
            return m.initWatchdogForm(loadConfig, saveConfig)
        },
    },
}

let currentSettingsPage = 'general'

async function loadSettingsSubpage(pageId) {
    const page = settingsSubpages[pageId]
    if (!page) return

    // Update active state in sidebar sub-items
    document.querySelectorAll('#settingsSubNav .sub-item').forEach((item) => {
        item.classList.remove('active')
        item.removeAttribute('aria-current')
        if (item.getAttribute('data-settings-page') === pageId) {
            item.classList.add('active')
            item.setAttribute('aria-current', 'page')
        }
    })

    const contentDiv = document.getElementById('settingsContent')
    if (!contentDiv) return
    contentDiv.innerHTML = '<div class="loading">Loading...</div>'
    try {
        const response = await fetch(`/ui/pages/${page.file}`)
        if (!response.ok) throw new Error('Subpage not found')
        const html = await response.text()
        contentDiv.innerHTML = html
        currentSettingsPage = pageId
        if (page.init && typeof page.init === 'function') {
            await page.init()
        }
    } catch (err) {
        contentDiv.innerHTML = `<div class="placeholder-text">Error loading subpage: ${err.message}</div>`
        showToast(`Failed to load settings: ${err.message}`, 'error')
    }
}

// Expose to global scope so the main sidebar can call it
window.loadSettingsSubpage = loadSettingsSubpage

export function initSettingsSubpage() {
    // Load the default settings subpage (General)
    loadSettingsSubpage('general')
}
