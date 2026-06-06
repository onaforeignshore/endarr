// ui/js/settings_watchdog.js
import { validatePositiveInt, displayFormErrors, initNumericHelpers } from './configValidator.js'
import { SettingsToolbar } from './SettingsToolbar.js'
import { showToast, confirmAction, setupFieldErrorClearing } from './ui-helpers.js'
import { escapeHtml, formatDate, consoleDebug } from './utils.js'

/**
 * Initialise the Watchdog settings page.
 * @param {Function} loadConfig - Async function to load configuration.
 * @param {Function} saveConfig - Async function to save configuration.
 */
export function initWatchdogForm(loadConfig, saveConfig) {
    consoleDebug('[Watchdog] Form initialised')

    const instancesList = document.getElementById('watchdogInstancesList')
    const intervalInput = document.getElementById('watchdogInterval')

    /**
     * Render the list of watchdog instances (cards).
     * @returns {Promise<void>}
     */
    async function renderInstances() {
        if (!instancesList) return
        instancesList.innerHTML = '<div class="loading">Loading instances...</div>'

        const key = localStorage.getItem('endarr_api_key')
        if (!key) {
            instancesList.innerHTML = '<div class="placeholder-text">No API key available</div>'
            return
        }

        const [status, config] = await Promise.all([
            fetch('/api/v1/status', { headers: { 'X-Api-Key': key } }).then((r) =>
                r.ok ? r.json() : null
            ),
            fetch('/api/v1/config', { headers: { 'X-Api-Key': key } }).then((r) =>
                r.ok ? r.json() : null
            ),
        ])

        if (!status) {
            instancesList.innerHTML =
                '<div class="placeholder-text">Unable to load watchdog status</div>'
            return
        }

        const clients = status.download_clients || []
        if (clients.length === 0) {
            instancesList.innerHTML =
                '<div class="placeholder-text">No download clients configured</div>'
            return
        }

        const globalInterval = config?.watchdog?.interval_seconds || 900
        const downloadClientsConfig = config?.download_clients || []

        instancesList.innerHTML = ''
        clients.forEach((client) => {
            const clientConfig = downloadClientsConfig.find((c) => c.name === client.name)
            const clientInterval = clientConfig?.watchdog_interval
            const effectiveInterval = clientInterval || globalInterval
            const isOverridden = clientInterval && clientInterval != globalInterval

            const connectedBadge = client.connected
                ? '<span class="status-badge enabled">Connected</span>'
                : '<span class="status-badge disabled">Disconnected</span>'
            const runningBadge = client.watchdog_running
                ? '<span class="status-badge enabled">Running</span>'
                : '<span class="status-badge disabled">Stopped</span>'

            const intervalDisplay =
                `${effectiveInterval}s` +
                (isOverridden
                    ? ' <span class="tooltip"><i class="fas fa-asterisk" style="font-size:0.7rem; color:var(--accent-color);"></i><span class="tooltip-text">Overrides global interval</span></span>'
                    : '')

            const card = document.createElement('div')
            card.className = 'client-card'
            card.setAttribute('role', 'listitem')
            card.innerHTML = `
                <div class="card-header">
                    <div class="client-name">${escapeHtml(client.name)}</div>
                </div>
                <div class="card-body">
                    <div class="status-item"><span>Status</span> <span>${connectedBadge} ${runningBadge}</span></div>
                    <div class="status-item"><span>Interval</span> <span>${intervalDisplay}</span></div>
                    <div class="status-item"><span>Last Run</span> <span>${formatDate(client.watchdog_last_run)}</span></div>
                </div>
                <div class="card-footer">
                    <button class="action-btn restart-watchdog" data-client="${escapeHtml(client.name)}" title="Restart this watchdog">
                        <i class="fas fa-sync-alt"></i> Restart
                    </button>
                    <button class="action-btn force-scan" data-client="${escapeHtml(client.name)}" title="Force an immediate scan">
                        <i class="fas fa-bolt"></i> Force Scan
                    </button>
                </div>
            `
            instancesList.appendChild(card)
        })

        // Attach event listeners
        document.querySelectorAll('.restart-watchdog').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const clientName = btn.dataset.client
                if (await confirmAction('config', `Restart watchdog for ${clientName}?`)) {
                    try {
                        const resp = await fetch('/api/v1/restart_watchdog', {
                            method: 'POST',
                            headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ client_name: clientName }),
                        })
                        if (resp.ok) {
                            showToast('Watchdog restarted', 'success')
                            setTimeout(renderInstances, 2000)
                        } else {
                            const error = await resp
                                .json()
                                .catch(() => ({ error: 'Unknown error' }))
                            showToast(error.error || 'Failed to restart watchdog', 'error')
                        }
                    } catch (err) {
                        showToast(`Error: ${err.message}`, 'error')
                    }
                }
            })
        })

        document.querySelectorAll('.force-scan').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const clientName = btn.dataset.client
                if (await confirmAction('config', `Force an immediate scan for ${clientName}?`)) {
                    try {
                        const resp = await fetch('/api/v1/force_watchdog_scan', {
                            method: 'POST',
                            headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ client_name: clientName }),
                        })
                        if (resp.ok) showToast('Scan triggered', 'success')
                        else showToast('Failed to trigger scan', 'error')
                    } catch (err) {
                        showToast(`Error: ${err.message}`, 'error')
                    }
                }
            })
        })
    }

    /**
     * Load configuration and populate the form.
     * @returns {Promise<void>}
     */
    async function load() {
        const config = await loadConfig()
        const watchdog = config.watchdog || {}
        intervalInput.value = watchdog.interval_seconds || 900
        await renderInstances()
        initNumericHelpers(document.querySelector('#pageContent'))
        setupFieldErrorClearing(document.querySelector('#pageContent'))
    }

    /**
     * Save watchdog global interval.
     * @returns {Promise<void>}
     * @throws Will throw if validation fails.
     */
    async function save() {
        const interval = parseInt(intervalInput.value, 10)
        const error = validatePositiveInt(interval, 'watchdog.interval_seconds', false)
        if (error) {
            displayFormErrors([{ field: 'watchdog.interval_seconds', message: error }])
            throw new Error('Validation failed')
        }
        const config = await loadConfig()
        if (!config.watchdog) config.watchdog = {}
        config.watchdog.interval_seconds = interval
        await saveConfig(config)
        await renderInstances()
    }

    // Toolbar initialisation (no advanced toggle needed)
    const toolbar = new SettingsToolbar({ container: '#pageContent', save })
    toolbar.init()
    load().then(() => toolbar.captureSnapshot())
}
