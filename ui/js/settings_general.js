// ui/js/settings_general.js
import { validatePositiveInt, displayFormErrors, initNumericHelpers } from './configValidator.js'
import { openModal } from './modal.js'
import { SettingsToolbar } from './SettingsToolbar.js'
import { showToast, showConfirm, showIconFeedback, setupFieldErrorClearing } from './ui-helpers.js'
import { escapeHtml, getApiKey, consoleDebug } from './utils.js'

/**
 * Initialise the General settings page: load config, set up event listeners, and initialise toolbar.
 * @param {Function} loadConfig - Async function to load configuration from server.
 * @param {Function} saveConfig - Async function to save configuration to server.
 */
export function initGeneralForm(loadConfig, saveConfig) {
    consoleDebug('[General] Form initialised')

    const webhookKeyInput = document.getElementById('webhookKey')
    const copyApiKeyBtn = document.getElementById('copyApiKeyBtn')
    const resetApiKeyBtn = document.getElementById('resetApiKeyBtn')
    const retentionDaysInput = document.getElementById('retentionDays')
    const strikeThresholdInput = document.getElementById('strikeThreshold')
    const strikeActionSelect = document.getElementById('strikeAction')
    const strikeBlacklistCheck = document.getElementById('strikeBlacklist')
    const logLevelSelect = document.getElementById('logLevelSelect')
    const downloadBackupBtn = document.getElementById('downloadBackupBtn')
    const restoreBackupBtn = document.getElementById('restoreBackupBtn')
    const restoreFileInput = document.getElementById('restoreFileInput')
    const hideUncategorizedCheck = document.getElementById('hideUncategorizedCheck')
    const defaultPageSizeSelect = document.getElementById('defaultPageSize')
    const confirmDataDeletionCheck = document.getElementById('confirmDataDeletionCheck')
    const confirmConfigModificationCheck = document.getElementById('confirmConfigModificationCheck')
    const uiPrefsWarning = document.getElementById('uiPrefsWarning')
    const toastDurationInput = document.getElementById('toastDuration')

    // ── Backup & Restore handlers (no comments needed, straightforward) ──
    if (downloadBackupBtn) {
        downloadBackupBtn.addEventListener('click', async () => {
            const key = getApiKey()
            if (!key) return
            const url = `/api/v1/db/backup`
            const resp = await fetch(url, { headers: { 'X-Api-Key': key } })
            if (resp.ok) {
                const blob = await resp.blob()
                const downloadUrl = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = downloadUrl
                const contentDisposition = resp.headers.get('Content-Disposition')
                let filename = 'endarr_backup.db'
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
                    if (match && match[1]) filename = match[1].replace(/['"]/g, '')
                }
                a.download = filename
                document.body.appendChild(a)
                a.click()
                a.remove()
                window.URL.revokeObjectURL(downloadUrl)
                showToast('Backup downloaded', 'success')
            } else {
                const err = await resp.json().catch(() => ({ error: 'Download failed' }))
                showToast(err.error || 'Download failed', 'error')
            }
        })
    }

    if (restoreBackupBtn && restoreFileInput) {
        restoreBackupBtn.addEventListener('click', () => {
            restoreFileInput.click()
        })

        restoreFileInput.addEventListener('change', async () => {
            const file = restoreFileInput.files[0]
            if (!file) return
            const confirmed = await showConfirm(
                `Restore database from "${file.name}"?\n\nThis will replace the current database and cannot be undone.`
            )
            if (!confirmed) {
                restoreFileInput.value = ''
                return
            }
            const key = getApiKey()
            if (!key) return
            const formData = new FormData()
            formData.append('file', file)
            const originalText = restoreBackupBtn.innerHTML
            restoreBackupBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Restoring...'
            restoreBackupBtn.disabled = true
            try {
                const resp = await fetch('/api/v1/db/restore', {
                    method: 'POST',
                    headers: { 'X-Api-Key': key },
                    body: formData,
                })
                const data = await resp.json().catch(() => ({ error: 'Unknown error' }))
                if (resp.ok) {
                    openModal({
                        title: 'Restore Successful',
                        bodyHtml: `<p>${data.message || 'Database restored successfully.'}</p>`,
                        rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                        onClose: () => window.location.reload(),
                    })
                } else {
                    openModal({
                        title: 'Restore Failed',
                        bodyHtml: `<p style="color: var(--danger-color);">${data.error || 'Restore failed'}</p><p>The database has been rolled back to its previous state.</p>`,
                        rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                    })
                }
            } catch (err) {
                openModal({
                    title: 'Restore Error',
                    bodyHtml: `<p style="color: var(--danger-color);">${err.message}</p>`,
                    rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                })
            } finally {
                restoreBackupBtn.innerHTML = originalText
                restoreBackupBtn.disabled = false
                restoreFileInput.value = ''
            }
        })
    }

    /**
     * Render configuration issues in the UI.
     * @param {Array<{field: string, message: string}>} issues - List of validation issues
     */
    function renderConfigIssues(issues) {
        const section = document.getElementById('configIssuesSection')
        const list = document.getElementById('configIssuesList')
        if (!section || !list) return

        if (!issues || issues.length === 0) {
            section.style.display = 'none'
            return
        }

        list.innerHTML = issues
            .map(
                (issue) => `
            <li style="padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                <strong style="font-family: monospace;">${escapeHtml(issue.field)}</strong><br>
                <span style="color: var(--text-secondary);">${escapeHtml(issue.message)}</span>
            </li>
        `
            )
            .join('')
        section.style.display = 'block'
    }

    /**
     * Load configuration and populate all form fields.
     * @returns {Promise<void>}
     */
    async function load() {
        const config = await loadConfig()
        const uiPrefs = config.ui_preferences || {}
        const initiallyAdvanced = uiPrefs.show_advanced || false
        toolbar.setAdvancedVisible(initiallyAdvanced)

        webhookKeyInput.value = config.webhook_key || ''
        retentionDaysInput.value = config.grabs_retention_days || 30
        const defaults = config.defaults || {}
        strikeThresholdInput.value = defaults.strike_threshold || 3
        strikeActionSelect.value = defaults.strike_action || 'delete'
        strikeBlacklistCheck.checked = defaults.strike_blacklist || false

        try {
            const key = getApiKey()
            const resp = await fetch('/api/v1/system/log-level', { headers: { 'X-Api-Key': key } })
            if (resp.ok) {
                const data = await resp.json()
                logLevelSelect.value = data.level
            }
        } catch (err) {
            console.error('Failed to fetch log level', err)
        }

        hideUncategorizedCheck.checked = uiPrefs.hide_uncategorized_by_default !== false
        confirmDataDeletionCheck.checked = uiPrefs.confirm_data_deletion !== false
        confirmConfigModificationCheck.checked = uiPrefs.confirm_config_modification !== false
        defaultPageSizeSelect.value = uiPrefs.default_page_size || 50
        toastDurationInput.value = uiPrefs.toast_duration_seconds || 5
        updateWarningIcon()

        const key = getApiKey()
        if (key) {
            try {
                const issuesResp = await fetch('/api/v1/config/issues', {
                    headers: { 'X-Api-Key': key },
                })
                if (issuesResp.ok) {
                    const issuesData = await issuesResp.json()
                    renderConfigIssues(issuesData.issues)
                }
            } catch (err) {
                console.error('Failed to fetch config issues:', err)
            }
        }

        initNumericHelpers(document.querySelector('#pageContent'))
        setupFieldErrorClearing(document.querySelector('#pageContent'))
    }

    /**
     * Update the warning icon for disabled confirmation dialogs.
     */
    function updateWarningIcon() {
        if (uiPrefsWarning) {
            const showWarning =
                !confirmDataDeletionCheck.checked || !confirmConfigModificationCheck.checked
            uiPrefsWarning.style.display = showWarning ? 'inline' : 'none'
        }
    }

    // Copy API key button
    copyApiKeyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(webhookKeyInput.value)
            showIconFeedback(copyApiKeyBtn, 'success')
        } catch (err) {
            const textarea = document.createElement('textarea')
            textarea.value = webhookKeyInput.value
            document.body.appendChild(textarea)
            textarea.select()
            try {
                document.execCommand('copy')
                showIconFeedback(copyApiKeyBtn, 'success')
            } catch (e) {
                showIconFeedback(copyApiKeyBtn, 'error')
            }
            document.body.removeChild(textarea)
        }
    })

    // Reset API key button
    resetApiKeyBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'Are you sure you want to reset your API Key? Any existing webhook URLs will stop working until updated.'
        )
        if (!confirmed) return
        const key = getApiKey()
        try {
            const resp = await fetch('/api/v1/webhook_key/reset', {
                method: 'POST',
                headers: { 'X-Api-Key': key },
            })
            if (!resp.ok) throw new Error('Reset failed')
            const data = await resp.json()
            webhookKeyInput.value = data.webhook_key
            showIconFeedback(resetApiKeyBtn, 'success')
        } catch (err) {
            showIconFeedback(resetApiKeyBtn, 'error')
            showToast(`Reset failed: ${err.message}`, 'error')
        }
    })

    /**
     * Save all general settings, including UI preferences and log level.
     * @returns {Promise<void>}
     * @throws Will throw if validation fails.
     */
    async function save() {
        const updated = {
            webhook_key: webhookKeyInput.value,
            grabs_retention_days: parseInt(retentionDaysInput.value, 10),
        }
        if (!updated.grabs_retention_days || updated.grabs_retention_days < 0)
            updated.grabs_retention_days = 30

        const defaults = {
            strike_threshold: parseInt(strikeThresholdInput.value, 10),
            strike_action: strikeActionSelect.value,
            strike_blacklist: strikeBlacklistCheck.checked,
        }

        const errors = []
        const retentionErr = validatePositiveInt(
            updated.grabs_retention_days,
            'grabs_retention_days'
        )
        if (retentionErr) errors.push({ field: 'grabs_retention_days', message: retentionErr })
        const thresholdErr = validatePositiveInt(
            defaults.strike_threshold,
            'defaults.strike_threshold',
            false
        )
        if (thresholdErr) errors.push({ field: 'defaults.strike_threshold', message: thresholdErr })

        if (errors.length > 0) {
            displayFormErrors(errors)
            throw new Error('Validation failed')
        }

        const config = await loadConfig()
        config.webhook_key = updated.webhook_key
        config.grabs_retention_days = updated.grabs_retention_days
        if (!config.defaults) config.defaults = {}
        Object.assign(config.defaults, defaults)

        const level = logLevelSelect.value
        await fetch('/api/v1/system/log-level', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': getApiKey() },
            body: JSON.stringify({ level }),
        })
        localStorage.setItem('endarr_log_level', level)

        if (!config.ui_preferences) config.ui_preferences = {}
        config.ui_preferences.hide_uncategorized_by_default = hideUncategorizedCheck.checked
        config.ui_preferences.confirm_data_deletion = confirmDataDeletionCheck.checked
        config.ui_preferences.confirm_config_modification = confirmConfigModificationCheck.checked
        config.ui_preferences.default_page_size = parseInt(defaultPageSizeSelect.value, 10)
        config.ui_preferences.toast_duration_seconds = parseInt(toastDurationInput.value, 10) || 5
        config.ui_preferences.show_advanced = toolbar._advancedVisible

        await saveConfig(config)
        updateWarningIcon()

        const issuesResp = await fetch('/api/v1/config/issues', {
            headers: { 'X-Api-Key': getApiKey() },
        })
        if (issuesResp.ok) {
            const issuesData = await issuesResp.json()
            renderConfigIssues(issuesData.issues)
        }
    }

    // ── Toolbar initialisation ──
    const toolbar = new SettingsToolbar({
        container: '#pageContent',
        save,
        showAdvanced: true,
    })
    toolbar.init()
    load().then(() => toolbar.captureSnapshot())
}
