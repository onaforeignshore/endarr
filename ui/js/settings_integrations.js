// ui/js/settings_integrations.js

import { displayFormErrors, initNumericHelpers } from './configValidator.js'
import { openModal } from './modal.js'
import {
    showToast,
    confirmAction,
    showIconFeedback,
    setupFieldErrorClearing,
    showConfirm,
} from './ui-helpers.js'
import { escapeHtml, consoleDebug, getApiKey } from './utils.js'

/**
 * Initialise the Integrations settings page (ARR and download clients).
 * @param {Function} loadConfig - Async function to load configuration.
 * @param {Function} saveConfig - Async function to save configuration.
 * @param {Function} apiCall - Generic API caller utility.
 */
export function initIntegrationsForm(loadConfig, saveConfig, apiCall) {
    consoleDebug('[Integrations] Form initialised')

    let arrClients = []
    let downloadClients = []
    let editingArrIndex = -1
    let editingDownloadIndex = -1
    let tempNewDownloadClient = null

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
    }

    // ========== ARR CLIENTS ==========
    /**
     * Render the list of ARR client cards.
     */
    function renderArrClients() {
        const container = document.getElementById('arrClientsList')
        if (!container) return
        container.innerHTML = ''

        arrClients.forEach((client, idx) => {
            const downloadClient = downloadClients.find(
                (dl) => dl.arrClientIds && dl.arrClientIds.includes(client.id)
            )
            const downloadName = downloadClient ? downloadClient.name : 'None'
            const statusBadge =
                client.enabled !== false
                    ? '<span class="status-badge enabled">Enabled</span>'
                    : '<span class="status-badge disabled">Disabled</span>'

            const card = document.createElement('div')
            card.className = 'client-card'
            card.setAttribute('role', 'listitem')
            card.dataset.index = idx
            card.innerHTML = `
                <div class="card-header">
                    <div class="client-name">${escapeHtml(client.name || client.type)}</div>
                    <button class="test-icon" data-index="${idx}" data-type="arr" title="Test connection" aria-label="Test connection to ${escapeHtml(client.name)}">
                        <i class="fas fa-flask" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="client-url" title="${client.url}">${client.url}</div>
                <div class="card-footer">
                    <div class="client-downloader">
                        <span class="chip">${escapeHtml(downloadName)}</span>
                    </div>
                    ${statusBadge}
                </div>
            `
            card.addEventListener('click', (e) => {
                if (e.target.closest('.test-icon')) return
                openArrModal(idx)
            })
            container.appendChild(card)
        })

        const addCard = document.createElement('div')
        addCard.className = 'client-card add-card'
        addCard.setAttribute('role', 'button')
        addCard.setAttribute('tabindex', '0')
        addCard.setAttribute('aria-label', 'Add ARR client')
        addCard.innerHTML = `<i class="fas fa-plus-circle" aria-hidden="true"></i><span>Add ARR</span>`
        addCard.addEventListener('click', () => openArrModal(-1))
        addCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openArrModal(-1)
            }
        })
        container.appendChild(addCard)

        document.querySelectorAll('.test-icon[data-type="arr"]').forEach((icon) => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation()
                const idx = parseInt(icon.dataset.index)
                testArrConnection(arrClients[idx], icon)
            })
        })
    }

    /**
     * Test connection to an ARR client.
     * @param {Object} client - The ARR client object.
     * @param {HTMLElement} iconElement - The test icon button.
     */
    async function testArrConnection(client, iconElement) {
        const originalIcon = iconElement.querySelector('i').className
        iconElement.querySelector('i').className = 'fas fa-spinner fa-pulse'
        iconElement.disabled = true
        try {
            await apiCall('/api/v1/test_arr', {
                method: 'POST',
                body: JSON.stringify({
                    type: client.type,
                    url: client.url,
                    api_key: client.api_key,
                }),
            })
            // Change icon to checkmark and show success feedback
            iconElement.querySelector('i').className = 'fas fa-check'
            showIconFeedback(iconElement, 'success')
        } catch (err) {
            // Change icon to cross and show error feedback
            iconElement.querySelector('i').className = 'fas fa-times'
            showIconFeedback(iconElement, 'error')
        } finally {
            setTimeout(() => {
                iconElement.querySelector('i').className = originalIcon
                iconElement.disabled = false
            }, 2000)
        }
    }

    /**
     * Open modal to add/edit an ARR client.
     * @param {number} index - Index in arrClients, or -1 for new.
     */
    function openArrModal(index) {
        editingArrIndex = index
        const isEdit = index !== -1
        const client = isEdit ? arrClients[index] : null

        // Helper to generate a sanitized ID from a name
        function sanitizeId(input) {
            return input
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '_')
                .replace(/^_+|_+$/g, '')
        }

        // Get current API key for webhook URL
        const apiKey = getApiKey()

        // Generate temporary ID for new client
        let currentId = isEdit ? client.id || '' : client?.name ? sanitizeId(client.name) : ''
        if (!isEdit && !currentId) currentId = 'arr_' + Date.now().toString(36)

        // Build webhook URL
        function buildWebhookUrl(id) {
            if (!apiKey || !id) return ''
            return `${window.location.origin}/arr?apikey=${apiKey}&arr_client=${id}`
        }

        let webhookUrl = buildWebhookUrl(currentId)

        const bodyHtml = `
             <div class="form-group">
                 <label for="modalArrType">Type</label>
                 <select id="modalArrType" ${isEdit ? 'disabled' : ''} aria-label="ARR type">
                     <option value="radarr" ${client?.type === 'radarr' ? 'selected' : ''}>Radarr</option>
                     <option value="sonarr" ${client?.type === 'sonarr' ? 'selected' : ''}>Sonarr</option>
                     <option value="lidarr" ${client?.type === 'lidarr' ? 'selected' : ''}>Lidarr</option>
                 </select>
             </div>
             <div class="form-group">
                 <label for="modalArrName">Name</label>
                 <input type="text" id="modalArrName" value="${escapeHtml(client?.name || '')}" placeholder="e.g., My Radarr" aria-label="ARR client name" data-field="arrs.name">
                 <div class="error-message" id="modalArrNameError" style="display: none;" role="alert"></div>
             </div>
             <div class="form-group">
                 <label for="modalArrId">
                     Client ID
                     <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i><span class="tooltip-text">Unique identifier used in webhook URL (URL-safe). Can be changed later, but will break existing webhooks.</span></span>
                 </label>
                 <input type="text" id="modalArrId" value="${escapeHtml(currentId)}" placeholder="e.g., radarr_hd" aria-label="ARR client ID">
                 <div id="modalArrIdWarning" class="error-message" style="display: none; color: var(--warning-color);"><i class="fas fa-exclamation-triangle"></i> Changing this ID will break existing webhook URLs that use the old ID. Update your *Arr webhook configuration accordingly.</div>
                 <div class="error-message" id="modalArrIdError" style="display: none;" role="alert"></div>
             </div>
             <div class="checkbox-row">
                 <input type="checkbox" id="modalArrEnabled" ${!isEdit || client.enabled !== false ? 'checked' : ''}>
                 <label for="modalArrEnabled">Enabled</label>
             </div>
             <div class="form-group">
                 <label for="modalArrUrl">URL</label>
                 <input type="text" id="modalArrUrl" value="${escapeHtml(client?.url || '')}" placeholder="http://radarr:7878" aria-label="ARR URL" data-field="arrs.url">
                 <div class="error-message" id="modalArrUrlError" style="display: none;" role="alert"></div>
             </div>
             <div class="form-group">
                 <label for="modalArrApiKey">API Key</label>
                 <div class="password-wrapper">
                 <input type="password" id="modalArrApiKey" value="${escapeHtml(client?.api_key || '')}" placeholder="API key from ARR settings" aria-label="API Key" data-field="arrs.api_key">
                     <button type="button" class="toggle-password" aria-label="Toggle API key visibility"><i class="fas fa-eye"></i></button>
                 </div>
                 ${isEdit ? '<p class="input-note">Leave blank to keep existing key</p>' : ''}
                 <div class="error-message" id="modalArrApiKeyError" style="display: none;" role="alert"></div>
             </div>
             <div class="form-group">
                 <label for="modalWebhookUrl">Webhook URL</label>
                 <div class="flex-row" style="align-items: center;">
                     <input type="text" id="modalWebhookUrl" value="${escapeHtml(webhookUrl)}" readonly class="monospace" style="flex: 1;">
                     <button class="icon-btn-feedback" id="copyWebhookUrlBtn" title="Copy to clipboard">
                         <span class="btn-icon-wrapper">
                             <i class="far fa-copy"></i>
                             <i class="fas fa-check"></i>
                             <i class="fas fa-times"></i>
                         </span>
                     </button>
                 </div>
                 <p class="input-note">Use this URL in your *Arr webhook configuration. The <code>arr_client</code> parameter identifies this specific ARR instance.</p>
             </div>
         `

        openModal({
            title: isEdit ? 'Edit ARR Client' : 'Add ARR Client',
            bodyHtml,
            leftButtons: isEdit
                ? [
                      {
                          text: 'Delete',
                          class: 'danger-btn',
                          onClick: async () => {
                              if (await confirmAction('data', `Delete ${client.name}?`)) {
                                  const arrId = arrClients[editingArrIndex].id
                                  downloadClients.forEach((dl) => {
                                      if (dl.arrClientIds) {
                                          dl.arrClientIds = dl.arrClientIds.filter(
                                              (id) => id !== arrId
                                          )
                                      }
                                  })
                                  arrClients.splice(editingArrIndex, 1)
                                  await persistConfig()
                                  renderArrClients()
                                  renderDownloadClients()
                                  showToast('ARR client deleted', 'success')
                              } else {
                                  return false
                              }
                          },
                      },
                  ]
                : [],
            rightButtons: [
                {
                    text: 'Test',
                    class: 'secondary-btn test-btn',
                    onClick: async (event, btnElement) => {
                        const type = document.getElementById('modalArrType').value
                        const url = document.getElementById('modalArrUrl').value.trim()
                        const apiKey = document.getElementById('modalArrApiKey').value.trim()
                        if (!url) {
                            showToast('URL is required', 'error')
                            return false
                        }
                        if (!apiKey && !isEdit) {
                            showToast('API Key is required', 'error')
                            return false
                        }
                        const testClient = {
                            type,
                            url,
                            api_key: apiKey || (isEdit ? client.api_key : ''),
                        }
                        const originalText = btnElement.innerText
                        btnElement.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>'
                        try {
                            await apiCall('/api/v1/test_arr', {
                                method: 'POST',
                                body: JSON.stringify(testClient),
                            })
                            btnElement.innerHTML = '<i class="fas fa-check"></i>'
                            btnElement.classList.add('success')
                            setTimeout(() => {
                                btnElement.innerHTML = originalText
                                btnElement.classList.remove('success')
                            }, 1500)
                        } catch (err) {
                            btnElement.innerHTML = '<i class="fas fa-times"></i>'
                            btnElement.classList.add('error')
                            setTimeout(() => {
                                btnElement.innerHTML = originalText
                                btnElement.classList.remove('error')
                            }, 1500)
                            showToast(`Connection failed: ${err.message}`, 'error')
                        }
                        return false
                    },
                },
                { text: 'Cancel', class: 'secondary-btn' },
                {
                    text: isEdit ? 'Save' : 'Add',
                    class: 'primary-btn',
                    onClick: async () => {
                        const type = document.getElementById('modalArrType').value
                        const name = document.getElementById('modalArrName').value.trim()
                        let id = document.getElementById('modalArrId').value.trim()
                        const enabled = document.getElementById('modalArrEnabled').checked
                        const url = document.getElementById('modalArrUrl').value.trim()
                        const apiKeyValue = document.getElementById('modalArrApiKey').value.trim()

                        // Validate ID
                        if (!id) {
                            showToast('Client ID is required', 'error')
                            return false
                        }
                        const idPattern = /^[a-zA-Z0-9_-]+$/
                        if (!idPattern.test(id)) {
                            showToast(
                                'Client ID must contain only letters, numbers, underscore, or hyphen',
                                'error'
                            )
                            return false
                        }
                        // Check uniqueness
                        const existingIds = arrClients
                            .filter((c) => c.id !== (client?.id || null))
                            .map((c) => c.id)
                        if (existingIds.includes(id)) {
                            showToast(`Client ID '${id}' is already in use`, 'error')
                            return false
                        }

                        const errors = []
                        if (!name) errors.push({ field: 'arrs.name', message: 'Name is required' })
                        if (!url) errors.push({ field: 'arrs.url', message: 'URL is required' })
                        if (!isEdit && !apiKeyValue)
                            errors.push({ field: 'arrs.api_key', message: 'API Key is required' })
                        if (errors.length > 0) {
                            displayFormErrors(errors, document.getElementById('globalModal'))
                            return false
                        }
                        const newClient = {
                            type,
                            name,
                            enabled,
                            url,
                            api_key: apiKeyValue || (isEdit ? client.api_key : ''),
                            id: id,
                        }
                        if (isEdit) {
                            // If ID changed, warn but allow
                            if (client.id !== id) {
                                const confirmed = await showConfirm(
                                    `Changing the Client ID from '${client.id}' to '${id}' will break existing webhook URLs. Continue?`
                                )
                                if (!confirmed) return false
                            }
                            Object.assign(arrClients[editingArrIndex], newClient)
                        } else {
                            arrClients.push(newClient)
                        }
                        await persistConfig()
                        renderArrClients()
                        renderDownloadClients()
                        showToast('ARR client saved', 'success')
                    },
                },
            ],
            onClose: () => {},
        })

        // After modal is rendered, set up event listeners
        setTimeout(() => {
            const nameInput = document.getElementById('modalArrName')
            const idInput = document.getElementById('modalArrId')
            const webhookUrlInput = document.getElementById('modalWebhookUrl')
            const copyBtn = document.getElementById('copyWebhookUrlBtn')
            const warningDiv = document.getElementById('modalArrIdWarning')

            function updateWebhookUrl() {
                const newId = idInput.value.trim()
                const newUrl = buildWebhookUrl(newId)
                webhookUrlInput.value = newUrl
            }

            // Auto-suggest ID from name only when user hasn't manually changed the ID
            if (!isEdit) {
                let userHasEditedId = false
                nameInput.addEventListener('input', () => {
                    if (!userHasEditedId) {
                        const suggested = sanitizeId(nameInput.value)
                        if (suggested) {
                            idInput.value = suggested
                            updateWebhookUrl()
                        }
                    }
                })
                idInput.addEventListener('input', () => {
                    userHasEditedId = true
                    // For new client, no warning (no original ID)
                    warningDiv.style.display = 'none'
                })
            } else {
                // For edit mode, just show warning on change
                idInput.addEventListener('input', () => {
                    if (idInput.value !== client.id) {
                        warningDiv.style.display = 'block'
                    } else {
                        warningDiv.style.display = 'none'
                    }
                    updateWebhookUrl()
                })
            }

            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(webhookUrlInput.value)
                    showIconFeedback(copyBtn, 'success')
                })
            }

            // Password toggle
            const passwordWrapper = document
                .querySelector('#modalArrApiKey')
                ?.closest('.password-wrapper')
            const toggleBtn = passwordWrapper?.querySelector('.toggle-password')
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.preventDefault()
                    const input = document.getElementById('modalArrApiKey')
                    const icon = toggleBtn.querySelector('i')
                    if (input.type === 'password') {
                        input.type = 'text'
                        icon.className = 'fas fa-eye-slash'
                    } else {
                        input.type = 'password'
                        icon.className = 'fas fa-eye'
                    }
                })
            } else {
                console.warn('[Integrations] Toggle password button not found for ARR modal')
            }

            setupFieldErrorClearing(document.getElementById('globalModal'))
        }, 50)
    }

    // ========== DOWNLOAD CLIENTS ==========
    const clientFieldTemplates = {
        qbittorrent: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'gluetun or localhost',
                default: 'gluetun',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '8080',
                default: 8080,
                required: true,
                min: 1,
                max: 65535,
            },
            { name: 'username', label: 'Username', type: 'text', placeholder: '', default: '' },
            { name: 'password', label: 'Password', type: 'password', placeholder: '', default: '' },
            { name: 'use_ssl', label: 'Use SSL', type: 'checkbox', default: false },
            {
                name: 'category',
                label: 'Category (optional)',
                type: 'text',
                placeholder: 'e.g., endarr',
                default: '',
            },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
        transmission: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'transmission',
                default: 'transmission',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '9091',
                default: 9091,
                required: true,
                min: 1,
                max: 65535,
            },
            {
                name: 'username',
                label: 'Username (optional)',
                type: 'text',
                placeholder: '',
                default: '',
            },
            {
                name: 'password',
                label: 'Password (optional)',
                type: 'password',
                placeholder: '',
                default: '',
            },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
        deluge: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'deluge',
                default: 'deluge',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '58846',
                default: 58846,
                required: true,
                min: 1,
                max: 65535,
            },
            { name: 'username', label: 'Username', type: 'text', placeholder: '', default: '' },
            { name: 'password', label: 'Password', type: 'password', placeholder: '', default: '' },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
        rtorrent: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'rtorrent',
                default: 'rtorrent',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '80',
                default: 80,
                required: true,
                min: 1,
                max: 65535,
            },
            {
                name: 'rpc_path',
                label: 'RPC Path',
                type: 'text',
                placeholder: '/RPC2',
                default: '/RPC2',
            },
            {
                name: 'username',
                label: 'Username (optional)',
                type: 'text',
                placeholder: '',
                default: '',
            },
            {
                name: 'password',
                label: 'Password (optional)',
                type: 'password',
                placeholder: '',
                default: '',
            },
            { name: 'use_ssl', label: 'Use SSL', type: 'checkbox', default: false },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
        utorrent: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'utorrent',
                default: 'utorrent',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '8080',
                default: 8080,
                required: true,
                min: 1,
                max: 65535,
            },
            { name: 'username', label: 'Username', type: 'text', placeholder: '', default: '' },
            { name: 'password', label: 'Password', type: 'password', placeholder: '', default: '' },
            { name: 'use_ssl', label: 'Use SSL', type: 'checkbox', default: false },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
        flood: [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                placeholder: 'flood',
                default: 'flood',
                required: true,
            },
            {
                name: 'port',
                label: 'Port',
                type: 'number',
                placeholder: '3000',
                default: 3000,
                required: true,
                min: 1,
                max: 65535,
            },
            { name: 'username', label: 'Username', type: 'text', placeholder: '', default: '' },
            { name: 'password', label: 'Password', type: 'password', placeholder: '', default: '' },
            { name: 'use_ssl', label: 'Use SSL', type: 'checkbox', default: false },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                placeholder: '10',
                default: 10,
                min: 1,
                'data-field': 'download_clients.timeout_seconds',
            },
        ],
    }

    function renderDownloadClientFields(type, isEditMode = false) {
        // unchanged from original, but using setupFieldErrorClearing later
        const container = document.getElementById('modalDownloadFields')
        const fields = clientFieldTemplates[type] || []
        container.innerHTML = ''
        fields.forEach((field) => {
            const div = document.createElement('div')
            div.className = 'form-group'
            if (field.type === 'checkbox') {
                div.innerHTML = `
                    <label class="checkbox-group">
                        <input type="checkbox" id="dl_${field.name}">
                        <span>${field.label}</span>
                    </label>
                `
            } else {
                div.innerHTML = `
                    <label for="dl_${field.name}">${field.label}</label>
                    ${
                        field.type === 'password' && isEditMode
                            ? `
                        <div class="password-wrapper">
                            <input type="password" id="dl_${field.name}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field['data-field'] ? `data-field="${field['data-field']}"` : ''}>
                            <button type="button" class="toggle-password" aria-label="Toggle visibility"><i class="fas fa-eye"></i></button>
                        </div>
                    `
                            : `
                        <input type="${field.type}" id="dl_${field.name}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field['data-field'] ? `data-field="${field['data-field']}"` : ''}>
                    `
                    }
                    <div class="error-message" id="dl_${field.name}Error" style="display: none;" role="alert"></div>
                `
            }
            container.appendChild(div)
        })

        const watchdogDiv = document.createElement('div')
        watchdogDiv.className = 'form-group'
        watchdogDiv.innerHTML = `
            <label for="dl_watchdog_interval">
                Watchdog Interval (seconds)
                <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i><span class="tooltip-text">Leave empty to use global interval</span></span>
            </label>
            <input type="text" id="dl_watchdog_interval" data-field="download_clients.watchdog_interval" data-duration placeholder="e.g., 900 or 15m">
            <span class="helper-text" id="dl_watchdog_intervalHelper"></span>
            <div class="error-message" id="dl_watchdog_intervalError" style="display: none;" role="alert"></div>
        `
        container.appendChild(watchdogDiv)
    }

    /**
     * Render the list of download client cards.
     */
    function renderDownloadClients() {
        const container = document.getElementById('downloadClientsList')
        if (!container) return
        container.innerHTML = ''

        downloadClients.forEach((client, idx) => {
            const statusBadge =
                client.enabled !== false
                    ? '<span class="status-badge enabled">Enabled</span>'
                    : '<span class="status-badge disabled">Disabled</span>'
            const arrNames = (client.arrClientIds || [])
                .map((arrId) => {
                    const arr = arrClients.find((a) => a.id === arrId)
                    return arr ? arr.name : arrId
                })
                .filter((n) => n)
            const chipsHtml = arrNames
                .map((name) => `<span class="chip">${escapeHtml(name)}</span>`)
                .join('')

            const card = document.createElement('div')
            card.className = 'client-card'
            card.setAttribute('role', 'listitem')
            card.dataset.index = idx
            card.innerHTML = `
                <div class="card-header">
                    <div class="client-name">${escapeHtml(client.name)} (${client.type})</div>
                    <button class="test-icon" data-index="${idx}" data-type="download" title="Test connection" aria-label="Test connection to ${escapeHtml(client.name)}">
                        <i class="fas fa-flask" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="client-url">${client.host}:${client.port}</div>
                <div class="card-footer">
                    <div class="client-arrs">${chipsHtml}</div>
                    ${statusBadge}
                </div>
            `
            card.addEventListener('click', (e) => {
                if (e.target.closest('.test-icon')) return
                openDownloadModal(idx)
            })
            container.appendChild(card)
        })

        const addCard = document.createElement('div')
        addCard.className = 'client-card add-card'
        addCard.setAttribute('role', 'button')
        addCard.setAttribute('tabindex', '0')
        addCard.setAttribute('aria-label', 'Add download client')
        addCard.innerHTML = `<i class="fas fa-plus-circle" aria-hidden="true"></i><span>Add download client</span>`
        addCard.addEventListener('click', () => openDownloadModal(-1))
        addCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openDownloadModal(-1)
            }
        })
        container.appendChild(addCard)

        document.querySelectorAll('.test-icon[data-type="download"]').forEach((icon) => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation()
                const idx = parseInt(icon.dataset.index)
                testDownloadConnectionForClient(downloadClients[idx], icon)
            })
        })
    }

    async function testDownloadConnectionForClient(client, iconElement) {
        const originalIcon = iconElement.querySelector('i').className
        iconElement.querySelector('i').className = 'fas fa-spinner fa-pulse'
        iconElement.disabled = true
        try {
            await apiCall('/api/v1/test_download_client', {
                method: 'POST',
                body: JSON.stringify({ type: client.type, ...client }),
            })
            iconElement.querySelector('i').className = 'fas fa-check'
            showIconFeedback(iconElement, 'success')
        } catch (err) {
            iconElement.querySelector('i').className = 'fas fa-times'
            showIconFeedback(iconElement, 'error')
        } finally {
            setTimeout(() => {
                iconElement.querySelector('i').className = originalIcon
                iconElement.disabled = false
            }, 2000)
        }
    }

    /**
     * Open modal to add/edit a download client.
     * @param {number} index - Index in downloadClients, or -1 for new.
     */
    function openDownloadModal(index) {
        editingDownloadIndex = index
        const isEdit = index !== -1
        const client = isEdit ? downloadClients[index] : null
        tempNewDownloadClient = isEdit ? null : { arrClientIds: [] }

        const bodyHtml = `
            <div class="form-group">
                <label for="modalDownloadType">Type</label>
                <select id="modalDownloadType" ${isEdit ? 'disabled' : ''} aria-label="Download client type">
                    <option value="qbittorrent" ${client?.type === 'qbittorrent' ? 'selected' : ''}>qBittorrent</option>
                    <option value="transmission" ${client?.type === 'transmission' ? 'selected' : ''}>Transmission</option>
                    <option value="deluge" ${client?.type === 'deluge' ? 'selected' : ''}>Deluge</option>
                    <option value="rtorrent" ${client?.type === 'rtorrent' ? 'selected' : ''}>rTorrent</option>
                    <option value="utorrent" ${client?.type === 'utorrent' ? 'selected' : ''}>uTorrent</option>
                    <option value="flood" ${client?.type === 'flood' ? 'selected' : ''}>Flood</option>
                </select>
            </div>
            <div class="form-group">
                <label for="modalDownloadName">Name</label>
                <input type="text" id="modalDownloadName" value="${escapeHtml(client?.name || '')}" placeholder="e.g., My qBittorrent" aria-label="Client name" data-field="download_clients.name">
                <div class="error-message" id="modalDownloadNameError" style="display: none;" role="alert"></div>
            </div>
            <div class="checkbox-row">
                <input type="checkbox" id="modalDownloadEnabled" ${!isEdit || client?.enabled !== false ? 'checked' : ''}>
                <label for="modalDownloadEnabled">Enabled</label>
            </div>
            <div id="modalDownloadFields"></div>
            <div class="form-group" id="modalAssociatedArrSection">
                <label>Associated ARR Clients</label>
                <div id="modalDownloadArrChips" class="chips-list"></div>
                <div id="modalArrAssociationControls"></div>
            </div>
        `

        openModal({
            title: isEdit ? 'Edit Download Client' : 'Add Download Client',
            bodyHtml,
            leftButtons: isEdit
                ? [
                      {
                          text: 'Delete',
                          class: 'danger-btn',
                          onClick: async () => {
                              if (await confirmAction('data', `Delete ${client.name}?`)) {
                                  downloadClients.splice(editingDownloadIndex, 1)
                                  await persistConfig()
                                  renderDownloadClients()
                                  renderArrClients()
                                  showToast('Download client deleted', 'success')
                              } else {
                                  return false
                              }
                          },
                      },
                  ]
                : [],
            rightButtons: [
                {
                    text: 'Test',
                    class: 'secondary-btn test-btn',
                    onClick: async (event, btnElement) => {
                        const type = document.getElementById('modalDownloadType').value
                        const fields = clientFieldTemplates[type]
                        const testClient = { type }
                        let isValid = true
                        fields.forEach((f) => {
                            const el = document.getElementById(`dl_${f.name}`)
                            if (el) {
                                let value = f.type === 'checkbox' ? el.checked : el.value.trim()
                                // For password field in edit mode, if empty, use existing password from client
                                if (f.name === 'password' && isEdit && !value && client) {
                                    value = client.password || ''
                                }
                                if (f.required && !value) {
                                    showToast(`${f.label} is required`, 'error')
                                    isValid = false
                                }
                                testClient[f.name] = value
                            }
                        })
                        if (!isValid) return false
                        const watchdogEl = document.getElementById('dl_watchdog_interval')
                        if (watchdogEl && watchdogEl.value.trim()) {
                            testClient.watchdog_interval = parseInt(watchdogEl.value, 10)
                        }
                        // Clean up undefined fields
                        Object.keys(testClient).forEach(
                            (k) => testClient[k] === undefined && delete testClient[k]
                        )
                        const originalText = btnElement.innerText
                        btnElement.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>'
                        try {
                            await apiCall('/api/v1/test_download_client', {
                                method: 'POST',
                                body: JSON.stringify(testClient),
                            })
                            btnElement.innerHTML = '<i class="fas fa-check"></i>'
                            btnElement.classList.add('success')
                            setTimeout(() => {
                                btnElement.innerHTML = originalText
                                btnElement.classList.remove('success')
                            }, 1500)
                        } catch (err) {
                            btnElement.innerHTML = '<i class="fas fa-times"></i>'
                            btnElement.classList.add('error')
                            setTimeout(() => {
                                btnElement.innerHTML = originalText
                                btnElement.classList.remove('error')
                            }, 1500)
                            showToast(`Connection failed: ${err.message}`, 'error')
                        }
                        return false
                    },
                },
                { text: 'Cancel', class: 'secondary-btn' },
                {
                    text: isEdit ? 'Save' : 'Add',
                    class: 'primary-btn',
                    onClick: async () => {
                        const type = document.getElementById('modalDownloadType').value
                        const name = document.getElementById('modalDownloadName').value.trim()
                        const enabled = document.getElementById('modalDownloadEnabled').checked
                        const fields = clientFieldTemplates[type]
                        const clientData = { type, name, enabled }
                        const errors = []
                        if (!name)
                            errors.push({
                                field: 'download_clients.name',
                                message: 'Name is required',
                            })
                        fields.forEach((f) => {
                            const el = document.getElementById(`dl_${f.name}`)
                            if (el) {
                                let value = f.type === 'checkbox' ? el.checked : el.value.trim()
                                if (f.required && !value)
                                    errors.push({
                                        field: `download_clients.${f.name}`,
                                        message: `${f.label} is required`,
                                    })
                                if (f.name === 'port' && value) {
                                    const port = parseInt(value, 10)
                                    if (isNaN(port) || port < 1 || port > 65535)
                                        errors.push({
                                            field: 'download_clients.port',
                                            message: 'Port must be between 1 and 65535',
                                        })
                                    clientData[f.name] = port
                                } else if (f.name === 'timeout_seconds' && value) {
                                    const timeout = parseInt(value, 10)
                                    if (isNaN(timeout) || timeout < 1)
                                        errors.push({
                                            field: 'download_clients.timeout_seconds',
                                            message: 'Timeout must be at least 1 second',
                                        })
                                    clientData[f.name] = timeout
                                } else {
                                    clientData[f.name] = value
                                }
                            }
                        })
                        const watchdogIntervalEl = document.getElementById('dl_watchdog_interval')
                        if (watchdogIntervalEl && watchdogIntervalEl.value.trim()) {
                            const interval = parseInt(watchdogIntervalEl.value, 10)
                            if (isNaN(interval) || interval < 60)
                                errors.push({
                                    field: 'download_clients.watchdog_interval',
                                    message: 'Interval must be at least 60 seconds',
                                })
                            else clientData.watchdog_interval = interval
                        }
                        const currentClient = isEdit ? client : tempNewDownloadClient
                        clientData.arrClientIds = currentClient?.arrClientIds || []
                        if (errors.length > 0) {
                            displayFormErrors(errors, document.getElementById('globalModal'))
                            return false
                        }
                        if (isEdit) {
                            Object.assign(downloadClients[editingDownloadIndex], clientData)
                        } else {
                            clientData.id = generateId()
                            downloadClients.push(clientData)
                        }
                        await persistConfig()
                        renderDownloadClients()
                        renderArrClients()
                        showToast('Download client saved', 'success')
                    },
                },
            ],
            onClose: () => {
                tempNewDownloadClient = null
            },
        })

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                renderDownloadClientFields(client?.type || 'qbittorrent', isEdit)
                if (client) {
                    const fields = clientFieldTemplates[client.type]
                    fields.forEach((f) => {
                        const el = document.getElementById(`dl_${f.name}`)
                        if (el) {
                            if (f.type === 'checkbox') el.checked = client[f.name] || false
                            else el.value = client[f.name] || ''
                        }
                    })
                    const watchdogEl = document.getElementById('dl_watchdog_interval')
                    if (watchdogEl && client.watchdog_interval)
                        watchdogEl.value = client.watchdog_interval
                }
                initNumericHelpers(document.getElementById('globalModal'))

                const currentClient = isEdit ? client : tempNewDownloadClient
                const arrIds = currentClient?.arrClientIds || []
                const chipsContainer = document.getElementById('modalDownloadArrChips')
                const controlsContainer = document.getElementById('modalArrAssociationControls')
                const section = document.getElementById('modalAssociatedArrSection')

                function renderArrChips() {
                    chipsContainer.innerHTML = ''
                    arrIds.forEach((arrId) => {
                        const arr = arrClients.find((a) => a.id === arrId)
                        if (arr) {
                            const chip = document.createElement('span')
                            chip.className = 'removable-item'
                            chip.innerHTML = `${escapeHtml(arr.name)} <button class="remove-item" data-id="${arrId}" aria-label="Remove ${arr.name}"><i class="fas fa-times-circle"></i></button>`
                            chip.querySelector('.remove-item').addEventListener('click', () => {
                                const idx = arrIds.indexOf(arrId)
                                if (idx > -1) arrIds.splice(idx, 1)
                                renderArrChips()
                                updateAssociationControls()
                            })
                            chipsContainer.appendChild(chip)
                        }
                    })
                }

                function updateAssociationControls() {
                    const associatedIds = arrIds
                    const available = arrClients.filter((arr) => !associatedIds.includes(arr.id))
                    if (available.length === 0) {
                        controlsContainer.innerHTML = ''
                        if (arrClients.length === 0) section.style.display = 'none'
                        else section.style.display = 'block'
                        return
                    }
                    section.style.display = 'block'
                    controlsContainer.innerHTML = `
                        <div class="add-item-row">
                            <select id="modalDownloadArrSelect" aria-label="Select ARR client to associate">
                                ${available.map((arr) => `<option value="${escapeHtml(arr.id)}">${escapeHtml(arr.name)}</option>`).join('')}
                            </select>
                            <button id="modalAddDownloadArrBtn" class="secondary-btn">+ Add</button>
                        </div>
                    `
                    document
                        .getElementById('modalAddDownloadArrBtn')
                        .addEventListener('click', () => {
                            const select = document.getElementById('modalDownloadArrSelect')
                            const selectedId = select.value
                            if (!selectedId) return
                            if (!arrIds.includes(selectedId)) {
                                arrIds.push(selectedId)
                                renderArrChips()
                                updateAssociationControls()
                            }
                            select.value = ''
                        })
                }

                renderArrChips()
                updateAssociationControls()

                // Remove duplicate broken listener that used undefined variables
                // (the correct listener is already inside updateAssociationControls)

                document.querySelectorAll('.toggle-password').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const input = btn.previousElementSibling
                        const icon = btn.querySelector('i')
                        if (input.type === 'password') {
                            input.type = 'text'
                            icon.className = 'fas fa-eye-slash'
                        } else {
                            input.type = 'password'
                            icon.className = 'fas fa-eye'
                        }
                    })
                })
                setupFieldErrorClearing(document.getElementById('globalModal'))
            })
        })
    }

    /**
     * Persist all ARR and download clients to configuration.
     * @returns {Promise<void>}
     */
    async function persistConfig() {
        const config = await loadConfig()
        config.arrs = arrClients
        config.download_clients = downloadClients
        await saveConfig(config)
    }

    /**
     * Load configuration and render all client lists.
     * @returns {Promise<void>}
     */
    async function load() {
        const config = await loadConfig()
        arrClients = config.arrs || []
        downloadClients = config.download_clients || []
        renderArrClients()
        renderDownloadClients()
        setupFieldErrorClearing(document.querySelector('#pageContent'))
    }

    load()
}
