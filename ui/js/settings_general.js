// ui/js/settings_general.js
import { validatePositiveInt, displayFormErrors, initDurationInputs } from './configValidator.js'
import { escapeHtml } from './utils.js'

export function initGeneralForm(loadConfig, saveConfig) {
    console.log('Initialising General form')

    const webhookKeyInput = document.getElementById('webhookKey')
    const copyApiKeyBtn = document.getElementById('copyApiKeyBtn')
    const resetApiKeyBtn = document.getElementById('resetApiKeyBtn')
    const retentionDaysInput = document.getElementById('retentionDays')
    const strikeThresholdInput = document.getElementById('strikeThreshold')
    const strikeActionSelect = document.getElementById('strikeAction')
    const strikeBlacklistCheck = document.getElementById('strikeBlacklist')
    const saveBtn = document.getElementById('saveGeneralBtn')
    const downloadBackupBtn = document.getElementById('downloadBackupBtn')
    const restoreBackupBtn = document.getElementById('restoreBackupBtn')
    const restoreFileInput = document.getElementById('restoreFileInput')
    const hideUncategorizedCheck = document.getElementById('hideUncategorizedCheck')
    const defaultPageSizeSelect = document.getElementById('defaultPageSize')
    const confirmDataDeletionCheck = document.getElementById('confirmDataDeletionCheck')
    const confirmConfigModificationCheck = document.getElementById('confirmConfigModificationCheck')
    const uiPrefsWarning = document.getElementById('uiPrefsWarning')
    const toastDurationInput = document.getElementById('toastDuration')

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

    // Download backup
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

    // Restore: trigger file picker
    if (restoreBackupBtn && restoreFileInput) {
        restoreBackupBtn.addEventListener('click', () => {
            restoreFileInput.click()
        })

        restoreFileInput.addEventListener('change', async () => {
            const file = restoreFileInput.files[0]
            if (!file) return

            // Confirmation
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

            // Show loading indicator (optional)
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

                // Show result in persistent modal
                if (resp.ok) {
                    openModal({
                        title: 'Restore Successful',
                        bodyHtml: `<p>${data.message || 'Database restored successfully.'}</p>`,
                        rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                        onClose: () => {
                            window.location.reload()
                        },
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

    async function load() {
        const config = await loadConfig()
        webhookKeyInput.value = config.webhook_key || ''
        retentionDaysInput.value = config.grabs_retention_days || 30
        const defaults = config.defaults || {}
        strikeThresholdInput.value = defaults.strike_threshold || 3
        strikeActionSelect.value = defaults.strike_action || 'delete'
        strikeBlacklistCheck.checked = defaults.strike_blacklist || false

        const uiPrefs = config.ui_preferences || {}
        hideUncategorizedCheck.checked = uiPrefs.hide_uncategorized_by_default !== false
        confirmDataDeletionCheck.checked = uiPrefs.confirm_data_deletion !== false
        confirmConfigModificationCheck.checked = uiPrefs.confirm_config_modification !== false
        defaultPageSizeSelect.value = uiPrefs.default_page_size || 50
        toastDurationInput.value = uiPrefs.toast_duration_seconds || 5
        updateWarningIcon()

        // Fetch and display config issues
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

        // Initialize duration helpers
        initDurationInputs(document.querySelector('.settings-container') || document)
        clearFieldErrorOnInput()
    }

    async function save() {
        // Build config updates
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

        // Validate
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
            showToast('Please correct the highlighted fields.', 'error')
            return
        }

        const config = await loadConfig()
        config.webhook_key = updated.webhook_key
        config.grabs_retention_days = updated.grabs_retention_days
        if (!config.defaults) config.defaults = {}
        Object.assign(config.defaults, defaults)

        try {
            await saveConfig(config)
            showButtonFeedback(saveBtn, 'success', {
                successText: 'Saved',
                originalText: 'Save Changes',
            })
            // Refresh issues display after save
            const issuesResp = await fetch('/api/v1/config/issues', {
                headers: { 'X-Api-Key': getApiKey() },
            })
            if (issuesResp.ok) {
                const issuesData = await issuesResp.json()
                renderConfigIssues(issuesData.issues)
            }
        } catch (err) {
            showButtonFeedback(saveBtn, 'error', {
                errorText: 'Not saved',
                originalText: 'Save Changes',
            })
            showToast(`Save failed: ${err.message}`, 'error')
        }
    }

    function updateWarningIcon() {
        if (uiPrefsWarning) {
            const showWarning =
                !confirmDataDeletionCheck.checked || !confirmConfigModificationCheck.checked
            uiPrefsWarning.style.display = showWarning ? 'inline' : 'none'
        }
    }

    async function saveUiPreferences() {
        const config = await loadConfig()
        if (!config.ui_preferences) config.ui_preferences = {}
        config.ui_preferences.hide_uncategorized_by_default = hideUncategorizedCheck.checked
        config.ui_preferences.confirm_data_deletion = confirmDataDeletionCheck.checked
        config.ui_preferences.confirm_config_modification = confirmConfigModificationCheck.checked
        config.ui_preferences.default_page_size = parseInt(defaultPageSizeSelect.value, 10)
        config.ui_preferences.toast_duration_seconds = parseInt(toastDurationInput.value, 10) || 5
        await saveConfig(config)
        updateWarningIcon()
        showToast('UI preferences saved', 'success')
    }

    // Event listeners for UI preferences (auto-save on change)
    hideUncategorizedCheck.addEventListener('change', saveUiPreferences)
    confirmDataDeletionCheck.addEventListener('change', saveUiPreferences)
    confirmConfigModificationCheck.addEventListener('change', saveUiPreferences)
    defaultPageSizeSelect.addEventListener('change', saveUiPreferences)
    toastDurationInput.addEventListener('blur', saveUiPreferences) // Save on blur after potential edit

    // Copy API key
    copyApiKeyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(webhookKeyInput.value)
            showIconFeedback(copyApiKeyBtn, 'success')
        } catch (err) {
            // Fallback
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

    // Reset API key with confirmation
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

    saveBtn.addEventListener('click', save)
    load()
}
