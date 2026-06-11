// ui/js/app.js
import { loadConfig, saveConfig, apiCall } from './config.js'
import { initDashboard } from './dashboard.js'
import { openModal } from './modal.js'
import { initTooltips } from './tooltip.js'
import {
    showToast,
    showConfirm,
    showIconFeedback,
    confirmAction,
    showGlobalBanner,
    hideGlobalBanner,
} from './ui-helpers.js'
import { getApiKey, consoleDebug } from './utils.js'

let currentSection = null
let currentSubpage = null
window.isSettingsDirty = false

/**
 * Fetch the current log level from the server and store it in localStorage.
 * @param {string} apiKey - API key to authenticate the request.
 * @returns {Promise<void>}
 */
async function fetchLogLevel(apiKey) {
    if (!apiKey) return
    try {
        const resp = await fetch('/api/v1/system/log-level', { headers: { 'X-Api-Key': apiKey } })
        if (resp.ok) {
            const data = await resp.json()
            if (data.level) {
                localStorage.setItem('endarr_log_level', data.level)
                consoleDebug('[App] Log level cached:', data.level)
            }
        }
    } catch (err) {
        console.error('Failed to fetch log level:', err)
    }
}

// Clean URL and bootstrap API key
;(async function () {
    const urlParams = new URLSearchParams(window.location.search)
    const apiKeyFromUrl = urlParams.get('apikey')
    if (apiKeyFromUrl) {
        localStorage.setItem('endarr_api_key', apiKeyFromUrl)
        urlParams.delete('apikey')
        const newSearch = urlParams.toString()
        const newUrl =
            window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash
        window.location.replace(newUrl)
        return
    }

    const storedKey = localStorage.getItem('endarr_api_key')
    if (storedKey) {
        fetchLogLevel(storedKey)
        return
    }

    try {
        const response = await fetch('/api/v1/public_key')
        if (response.ok) {
            const data = await response.json()
            if (data.webhook_key) {
                localStorage.setItem('endarr_api_key', data.webhook_key)
                fetchLogLevel(data.webhook_key)
                window.location.reload()
                return
            }
        }
        console.warn('No API key found. UI will show error.')
    } catch (err) {
        console.error('Failed to fetch public key:', err)
    }
})()

// ========== THEME TOGGLE ==========
function initThemeToggle() {
    const toggle = document.getElementById('themeToggle')
    if (!toggle) return

    function applyTheme(theme) {
        document.documentElement.classList.toggle('light-theme', theme === 'light')
        toggle.classList.toggle('fa-moon', theme !== 'light')
        toggle.classList.toggle('fa-sun', theme === 'light')
    }

    const storedTheme = localStorage.getItem('endarr_theme') || 'dark'
    applyTheme(storedTheme)

    document.body.addEventListener('click', (e) => {
        const button = e.target.closest('#themeToggle')
        if (!button) return
        const currentTheme = localStorage.getItem('endarr_theme') || 'dark'
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('endarr_theme', newTheme)
        applyTheme(newTheme)
    })
}

async function initQueuePage() {
    const module = await import('./queue.js')
    module.initQueuePage()
}

async function initHistoryPage() {
    const module = await import('./history.js')
    module.initHistoryPage()
}

async function initBlacklistPage() {
    const module = await import('./blacklist.js')
    module.initBlacklistPage()
}

const subpageConfig = {
    'activity/queue': { file: 'queue.html', init: initQueuePage },
    'activity/history': { file: 'history.html', init: initHistoryPage },
    'activity/blacklist': { file: 'blacklist.html', init: initBlacklistPage },
    'settings/general': {
        file: 'settings_general.html',
        init: async () => {
            const m = await import('./settings_general.js')
            m.initGeneralForm(loadConfig, saveConfig)
        },
    },
    'settings/torrent': {
        file: 'settings_torrents.html',
        init: async () => {
            const m = await import('./settings_torrents.js')
            m.initTorrentsForm(loadConfig, saveConfig)
        },
    },
    'settings/upgrade': {
        file: 'settings_upgrade.html',
        init: async () => {
            const m = await import('./settings_upgrade.js')
            m.initUpgradeForm(loadConfig, saveConfig)
        },
    },
    'settings/protection': {
        file: 'settings_protection.html',
        init: async () => {
            const m = await import('./settings_protection.js')
            m.initProtectionForm(loadConfig, saveConfig)
        },
    },
    'settings/integrations': {
        file: 'settings_integrations.html',
        init: async () => {
            const m = await import('./settings_integrations.js')
            m.initIntegrationsForm(loadConfig, saveConfig, apiCall)
        },
    },
    'settings/watchdog': {
        file: 'settings_watchdog.html',
        init: async () => {
            const m = await import('./settings_watchdog.js')
            m.initWatchdogForm(loadConfig, saveConfig)
        },
    },
    'system/logs': {
        file: 'logs.html',
        init: async () => {
            const m = await import('./logs.js')
            m.initLogsPage()
        },
    },
}

const sectionDefaults = {
    activity: 'queue',
    settings: 'general',
    system: 'logs',
}

/**
 * Load a subpage (settings section, activity page, etc.).
 * @param {string} section - The parent section (activity, settings, system).
 * @param {string} pageId - The specific page identifier (queue, history, general, etc.).
 * @returns {Promise<void>}
 */
async function loadSubpage(section, pageId) {
    if (currentSection === 'settings' && window.isSettingsDirty) {
        const leave = await showConfirm('You have unsaved changes. Leave anyway?')
        if (!leave) return
        window.isSettingsDirty = false
    }

    document.querySelectorAll('[id$="SubNav"]').forEach((el) => {
        const otherSection = el.id.replace('SubNav', '')
        if (otherSection !== section) {
            el.style.display = 'none'
            const parent = document.querySelector(`.nav-item[data-page="${otherSection}"]`)
            if (parent) parent.setAttribute('aria-expanded', 'false')
        }
    })

    const subNav = document.getElementById(section + 'SubNav')
    if (subNav) {
        subNav.style.display = 'block'
        const parentItem = document.querySelector(`.nav-item[data-page="${section}"]`)
        if (parentItem) parentItem.setAttribute('aria-expanded', 'true')
    }

    document.querySelectorAll('.nav-item.active').forEach((el) => {
        el.classList.remove('active')
        el.removeAttribute('aria-current')
    })

    if (subNav) {
        const parentItem = document.querySelector(`.nav-item[data-page="${section}"]`)
        if (parentItem) {
            parentItem.classList.add('active')
            parentItem.setAttribute('aria-current', 'page')
        }
    }

    const subItem = document.querySelector(
        `.nav-item[data-section="${section}"][data-page="${pageId}"]`
    )
    if (subItem) {
        subItem.classList.add('active')
        subItem.setAttribute('aria-current', 'page')
    }

    const key = `${section}/${pageId}`
    const cfg = subpageConfig[key]
    const contentDiv = document.getElementById('pageContent')
    if (!cfg) {
        contentDiv.innerHTML = '<div class="placeholder-text">Unknown page</div>'
        return
    }
    contentDiv.innerHTML = '<div class="loading">Loading...</div>'
    fetch(`/ui/pages/${cfg.file}`)
        .then((r) => r.text())
        .then(async (html) => {
            contentDiv.innerHTML = html
            if (cfg.init) await cfg.init()
            initTooltips(contentDiv)
            checkConfigIssues()
        })
        .catch((err) => {
            contentDiv.innerHTML = `<div class="placeholder-text">Error loading page: ${err.message}</div>`
        })

    currentSection = section
    currentSubpage = pageId
}

/**
 * Toggle the visibility of a sub‑navigation menu.
 * @param {string} section - The parent section (activity, settings, system).
 */
function toggleSubNav(section) {
    const subNav = document.getElementById(section + 'SubNav')
    if (!subNav) return
    const parentItem = document.querySelector(`.nav-item[data-page="${section}"]`)
    ;['activity', 'settings', 'system'].forEach((s) => {
        if (s !== section) {
            const otherSub = document.getElementById(s + 'SubNav')
            if (otherSub) otherSub.style.display = 'none'
            const otherParent = document.querySelector(`.nav-item[data-page="${s}"]`)
            if (otherParent) otherParent.setAttribute('aria-expanded', 'false')
        }
    })
    const isVisible = subNav.style.display === 'block'
    subNav.style.display = isVisible ? 'none' : 'block'
    if (parentItem) parentItem.setAttribute('aria-expanded', !isVisible)
}

// Sidebar navigation click handlers
document.querySelector('.sidebar .nav').addEventListener('click', (e) => {
    const subItem = e.target.closest('.sub-item[data-section][data-page]')
    if (!subItem) return
    const section = subItem.dataset.section
    const page = subItem.dataset.page
    if (section && page) {
        loadSubpage(section, page)
    }
})

document.querySelectorAll('.nav-item:not(.sub-item)').forEach((item) => {
    item.addEventListener('click', () => {
        const pageId = item.getAttribute('data-page')
        const subNav = document.getElementById(pageId + 'SubNav')
        const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]')
        if (dashboardItem && pageId !== 'dashboard') {
            dashboardItem.classList.remove('active')
            dashboardItem.removeAttribute('aria-current')
        }

        if (subNav) {
            toggleSubNav(pageId)
            if (subNav.style.display === 'block' && sectionDefaults[pageId]) {
                loadSubpage(pageId, sectionDefaults[pageId])
            }
        } else if (pageId === 'dashboard') {
            ;['activity', 'settings', 'system'].forEach((s) => {
                const otherSub = document.getElementById(s + 'SubNav')
                if (otherSub) otherSub.style.display = 'none'
                const parent = document.querySelector(`.nav-item[data-page="${s}"]`)
                if (parent) parent.setAttribute('aria-expanded', 'false')
            })

            document.querySelectorAll('.nav-item.active').forEach((el) => {
                el.classList.remove('active')
                el.removeAttribute('aria-current')
            })

            item.classList.add('active')
            item.setAttribute('aria-current', 'page')

            const contentDiv = document.getElementById('pageContent')
            contentDiv.innerHTML = '<div class="loading">Loading...</div>'
            fetch('/ui/pages/dashboard.html')
                .then((r) => r.text())
                .then(async (html) => {
                    contentDiv.innerHTML = html
                    await initDashboard()
                    initTooltips(contentDiv)
                })
                .catch((err) => {
                    contentDiv.innerHTML = `<div class="placeholder-text">Error loading page: ${err.message}</div>`
                })

            currentSection = null
            currentSubpage = 'dashboard'
        }
    })

    item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            item.click()
        }
    })
})

/**
 * Show the onboarding modal for API key generation.
 * @returns {Promise<void>}
 */
export async function showOnboardingModal() {
    const bodyHtml = `
        <p>An API key is required to authenticate webhooks from Sonarr, Radarr, and Lidarr.</p>
        <p>Click below to generate a secure random key.</p>
        <p class="input-note">You can generate a new key at any time from Settings → General.</p>
    `

    openModal({
        title: 'Set Up API Key',
        bodyHtml,
        rightButtons: [
            { text: 'Cancel', class: 'secondary-btn' },
            {
                text: 'Generate API Key',
                class: 'primary-btn',
                onClick: async () => {
                    try {
                        const resp = await fetch('/api/v1/webhook_key/generate', { method: 'POST' })
                        if (!resp.ok) throw new Error('Failed to generate key')
                        const data = await resp.json()
                        localStorage.setItem('endarr_api_key', data.webhook_key)
                        fetchLogLevel(data.webhook_key)
                        const successHtml = `
                            <p>Your new API key:</p>
                            <div class="flex-row">
                                <input type="text" id="newApiKeyDisplay" value="${data.webhook_key}" readonly class="monospace">
                                <button class="icon-btn-feedback" id="copyNewApiKeyBtn" title="Copy to clipboard">
                                    <span class="btn-icon-wrapper">
                                        <i class="far fa-copy"></i>
                                        <i class="fas fa-check"></i>
                                    </span>
                                </button>
                            </div>
                            <p>Use this key in your *Arr webhook URL:<br>
                            <code>http://endarr:7070/arr?apikey=${data.webhook_key}</code></p>
                        `
                        openModal({
                            title: 'API Key Generated',
                            bodyHtml: successHtml,
                            rightButtons: [{ text: 'Done', class: 'primary-btn' }],
                            onClose: () => window.location.reload(),
                        })
                        setTimeout(() => {
                            const copyBtn = document.getElementById('copyNewApiKeyBtn')
                            const displayInput = document.getElementById('newApiKeyDisplay')
                            if (copyBtn) {
                                copyBtn.addEventListener('click', () => {
                                    navigator.clipboard.writeText(displayInput.value)
                                    showIconFeedback(copyBtn, 'success')
                                })
                            }
                        }, 50)
                    } catch (err) {
                        openModal({
                            title: 'Error',
                            bodyHtml: `<p class="error-text">${err.message}</p>`,
                            rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                        })
                    }
                },
            },
        ],
    })
}

/**
 * Fetch configuration issues and show global banner if any.
 * @returns {Promise<void>}
 */
async function checkConfigIssues() {
    const key = getApiKey()
    if (!key) return

    // First, check for deprecated legacy fields
    try {
        const deprecatedResp = await fetch('/api/v1/config/deprecated', {
            headers: { 'X-Api-Key': key },
        })
        if (deprecatedResp.ok) {
            const deprecatedData = await deprecatedResp.json()
            if (deprecatedData.has_deprecated) {
                showGlobalBanner(
                    'warning',
                    'Legacy seeding policy fields detected. Please migrate to the new "Calculated" policy.',
                    [
                        {
                            text: 'Migrate',
                            class: 'primary-btn',
                            onClick: async () => {
                                const migrateResp = await fetch('/api/v1/config/migrate_legacy', {
                                    method: 'POST',
                                    headers: { 'X-Api-Key': key },
                                })
                                if (migrateResp.ok) {
                                    showToast(
                                        'Configuration cleaned. The page will reload.',
                                        'success'
                                    )
                                    setTimeout(() => window.location.reload(), 1500)
                                } else {
                                    showToast('Migration failed. Check logs.', 'error')
                                }
                            },
                        },
                        {
                            text: 'View in Settings',
                            class: 'secondary-btn',
                            onClick: () => {
                                toggleSubNav('settings')
                                loadSubpage('settings', 'torrent')
                            },
                        },
                    ],
                    true
                )
                return // Don't show config issues banner if deprecated banner is shown
            }
        }
    } catch (err) {
        console.error('Failed to check deprecated fields:', err)
    }

    // Then check for regular config issues
    try {
        const resp = await fetch('/api/v1/config/issues', { headers: { 'X-Api-Key': key } })
        if (resp.ok) {
            const data = await resp.json()
            if (data.issues && data.issues.length > 0) {
                showGlobalBanner(
                    'warning',
                    `${data.issues.length} configuration issue(s) detected.`,
                    [
                        {
                            text: 'View Issues',
                            class: 'primary-btn',
                            onClick: () => {
                                toggleSubNav('settings')
                                loadSubpage('settings', 'general')
                            },
                        },
                    ],
                    true
                )
                return
            }
        }
    } catch (err) {
        console.error('Failed to fetch config issues:', err)
    }
    hideGlobalBanner()
}

// ========== Connection Monitoring ==========
const CONNECTION_CHECK_INTERVAL = 30000
let lastConnectionStates = { downloadClients: {}, arrClients: {} }
let connectionCheckIntervalId = null
let hasShownFetchError = false

/**
 * Check connection status of download and ARR clients, show toasts on state change.
 * @returns {Promise<void>}
 */
async function checkConnectionStatus() {
    const key = getApiKey()
    if (!key) return
    try {
        const resp = await fetch('/api/v1/status', { headers: { 'X-Api-Key': key } })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const status = await resp.json()
        hasShownFetchError = false
        const downloadClients = status.download_clients || []
        const arrClients = status.arr_clients || []
        for (const client of downloadClients) {
            const name = client.name
            const connected = client.connected
            const previous = lastConnectionStates.downloadClients[name]
            if (previous !== undefined && previous !== connected) {
                const message = connected
                    ? `Download client "${name}" reconnected`
                    : `Download client "${name}" disconnected`
                showToast(message, connected ? 'success' : 'error')
            }
            lastConnectionStates.downloadClients[name] = connected
        }
        for (const client of arrClients) {
            const name = client.name
            const connected = client.connected
            const previous = lastConnectionStates.arrClients[name]
            if (previous !== undefined && previous !== connected) {
                const message = connected
                    ? `ARR client "${name}" reconnected`
                    : `ARR client "${name}" disconnected`
                showToast(message, connected ? 'success' : 'error')
            }
            lastConnectionStates.arrClients[name] = connected
        }
    } catch (err) {
        console.error('Connection status check failed:', err)
        if (!hasShownFetchError) {
            showToast('Unable to fetch connection status', 'error')
            hasShownFetchError = true
        }
    }
}

/**
 * Start periodic connection monitoring.
 */
function startConnectionMonitoring() {
    if (connectionCheckIntervalId) clearInterval(connectionCheckIntervalId)
    checkConnectionStatus().then(() => {
        connectionCheckIntervalId = setInterval(checkConnectionStatus, CONNECTION_CHECK_INTERVAL)
    })
}

function stopConnectionMonitoring() {
    if (connectionCheckIntervalId) {
        clearInterval(connectionCheckIntervalId)
        connectionCheckIntervalId = null
    }
}

// Global initialisation
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle()
    setTimeout(() => {
        if (getApiKey()) startConnectionMonitoring()
    }, 500)

    const key = getApiKey()
    if (!key) {
        showGlobalBanner(
            'info',
            'No API key configured. Webhooks from *Arr apps will not work.',
            [{ text: 'Set up now', class: 'primary-btn', onClick: () => showOnboardingModal() }],
            false
        )
    } else {
        checkConfigIssues()
    }

    const menuBtn = document.getElementById('menuBtn')
    const menuDropdown = document.getElementById('menuDropdown')
    const restartBtn = document.getElementById('restartBtn')
    const shutdownBtn = document.getElementById('shutdownBtn')

    ;(async () => {
        try {
            const key = getApiKey()
            if (!key) return
            const resp = await fetch('/api/v1/system/environment', {
                headers: { 'X-Api-Key': key },
            })
            if (resp.ok) {
                const data = await resp.json()
                if (!data.is_docker && shutdownBtn) shutdownBtn.style.display = 'block'
            }
        } catch (e) {}
    })()

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            const expanded = menuBtn.getAttribute('aria-expanded') === 'true'
            menuDropdown.style.display = expanded ? 'none' : 'block'
            menuBtn.setAttribute('aria-expanded', !expanded)
        })
        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.style.display = 'none'
                menuBtn.setAttribute('aria-expanded', 'false')
            }
        })
        menuDropdown.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                menuDropdown.style.display = 'none'
                menuBtn.setAttribute('aria-expanded', 'false')
                menuBtn.focus()
            }
        })
        restartBtn?.addEventListener('click', async () => {
            if (await confirmAction('config', 'Restart Endarr?')) {
                try {
                    await fetch('/api/v1/system/restart', {
                        method: 'POST',
                        headers: { 'X-Api-Key': getApiKey() },
                    })
                    showToast('Restarting…', 'success')
                } catch (err) {
                    showToast('Failed to restart', 'error')
                }
            }
            menuDropdown.style.display = 'none'
            menuBtn.setAttribute('aria-expanded', 'false')
        })
        shutdownBtn?.addEventListener('click', async () => {
            if (await confirmAction('config', 'Shutdown Endarr?')) {
                try {
                    const resp = await fetch('/api/v1/system/shutdown', {
                        method: 'POST',
                        headers: { 'X-Api-Key': getApiKey() },
                    })
                    if (resp.ok) showToast('Shutting down…', 'success')
                    else {
                        const err = await resp.json()
                        showToast(err.error || 'Shutdown failed', 'error')
                    }
                } catch (err) {
                    showToast('Failed to shutdown', 'error')
                }
            }
            menuDropdown.style.display = 'none'
            menuBtn.setAttribute('aria-expanded', 'false')
        })
    }

    window.addEventListener('beforeunload', (e) => {
        if (window.isSettingsDirty) e.preventDefault()
    })
})

window.addEventListener('beforeunload', stopConnectionMonitoring)

// Load initial Dashboard
;(function initFirstPage() {
    const contentDiv = document.getElementById('pageContent')
    if (!contentDiv) return
    contentDiv.innerHTML = '<div class="loading">Loading...</div>'
    fetch('/ui/pages/dashboard.html')
        .then((r) => r.text())
        .then(async (html) => {
            contentDiv.innerHTML = html
            await initDashboard()
            initTooltips(contentDiv)
        })
        .catch((err) => {
            contentDiv.innerHTML = `<div class="placeholder-text">Error loading page: ${err.message}</div>`
        })
})()
