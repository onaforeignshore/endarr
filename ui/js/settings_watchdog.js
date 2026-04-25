// ui/js/settings_watchdog.js
import { validatePositiveInt, displayFormErrors, initDurationInputs } from './configValidator.js'
import { escapeHtml, formatDate } from './utils.js'

export function initWatchdogForm(loadConfig, saveConfig) {
    console.log('Initialising Watchdog form')

    const instancesList = document.getElementById('watchdogInstancesList')
    const intervalInput = document.getElementById('watchdogInterval')
    const saveBtn = document.getElementById('saveWatchdogBtn')

    // Helper to clear error on input
    function clearFieldErrorOnInput() {
        document.querySelectorAll('[data-field]').forEach((input) => {
            const handler = () => {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                const errorDiv = document.getElementById(input.id + 'Error')
                if (errorDiv) {
                    errorDiv.style.display = 'none'
                    errorDiv.textContent = ''
                }
            }
            input.removeEventListener('input', handler)
            input.addEventListener('input', handler)
        })
    }

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
                    ? ' <span class="tooltip"><i class="fas fa-asterisk" style="font-size:0.7rem; color:var(--accent-color);" aria-hidden="true"></i><span class="tooltip-text" role="tooltip">Overrides global interval</span></span>'
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
                    <button class="action-btn restart-watchdog" data-client="${escapeHtml(client.name)}" title="Restart this watchdog" aria-label="Restart watchdog for ${escapeHtml(client.name)}">
                        <i class="fas fa-sync-alt" aria-hidden="true"></i> Restart
                    </button>
                    <button class="action-btn force-scan" data-client="${escapeHtml(client.name)}" title="Force an immediate scan" aria-label="Force scan for ${escapeHtml(client.name)}">
                        <i class="fas fa-bolt" aria-hidden="true"></i> Force Scan
                    </button>
                </div>
            `
            instancesList.appendChild(card)
        })

        // Attach event listeners (unchanged)
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
                        if (resp.ok) {
                            showToast('Scan triggered', 'success')
                        } else {
                            showToast('Failed to trigger scan', 'error')
                        }
                    } catch (err) {
                        showToast(`Error: ${err.message}`, 'error')
                    }
                }
            })
        })
    }

    async function load() {
        const config = await loadConfig()
        const watchdog = config.watchdog || {}
        intervalInput.value = watchdog.interval_seconds || 900
        await renderInstances()
        initDurationInputs(document.querySelector('.settings-container') || document)
        clearFieldErrorOnInput()
    }

    async function save() {
        const interval = parseInt(intervalInput.value, 10)
        const error = validatePositiveInt(interval, 'watchdog.interval_seconds', false)
        if (error) {
            displayFormErrors([{ field: 'watchdog.interval_seconds', message: error }])
            showToast('Please correct the highlighted field.', 'error')
            return
        }

        const config = await loadConfig()
        if (!config.watchdog) config.watchdog = {}
        config.watchdog.interval_seconds = interval
        try {
            await saveConfig(config)
            showButtonFeedback(saveBtn, 'success', {
                successText: 'Saved',
                originalText: 'Save Settings',
            })
            await renderInstances()
        } catch (err) {
            showButtonFeedback(saveBtn, 'error', {
                errorText: 'Not saved',
                originalText: 'Save Settings',
            })
            showToast(`Save failed: ${err.message}`, 'error')
        }
    }

    saveBtn.addEventListener('click', save)
    load()
}
