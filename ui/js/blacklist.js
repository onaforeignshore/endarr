// ui/js/blacklist.js
import { getStatusChip, getArrChipClass } from './chipStyles.js'
import { DataTable } from './DataTable.js'
import { openModal } from './modal.js'
import { escapeHtml, formatDate, getApiKey, consoleDebug } from './utils.js'
import { showToast, confirmAction } from './ui-helpers.js'

/* global openModal, closeModal */

/**
 * Delete a blacklist entry by ID.
 * @param {number} id - Entry ID.
 */
async function deleteBlacklistEntry(id) {
    const key = getApiKey()
    try {
        const resp = await fetch('/api/v1/blacklist', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
            body: JSON.stringify({ id }),
        })
        if (!resp.ok) throw new Error('Delete failed')
        showToast('Entry removed', 'success')
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error')
    }
}

/**
 * Add a new blacklist entry.
 * @param {string} title - Release title.
 * @param {string|null} arrName - Associated ARR name (or null for global).
 * @param {string} reason - Reason for blacklisting.
 * @param {number|null} expiresAt - Expiration timestamp (seconds) or null.
 */
async function addBlacklistEntry(title, arrName, reason, expiresAt) {
    const key = getApiKey()
    try {
        const body = { release_title: title, reason }
        if (arrName) body.arr_name = arrName
        if (expiresAt) body.expires_at = expiresAt
        const resp = await fetch('/api/v1/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
            body: JSON.stringify(body),
        })
        if (!resp.ok) {
            const err = await resp.json()
            throw new Error(err.error || 'Failed')
        }
        showToast('Blacklist entry added', 'success')
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error')
    }
}

/**
 * Open modal to add a new blacklist entry.
 */
async function openAddBlacklistModal() {
    let arrOptions = '<option value="">Global (all ARRs)</option>'
    try {
        const key = getApiKey()
        const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
        if (resp.ok) {
            const config = await resp.json()
            ;(config.arrs || []).forEach((arr) => {
                if (arr.enabled) {
                    arrOptions += `<option value="${escapeHtml(arr.name || arr.type)}">${escapeHtml(arr.name || arr.type)}</option>`
                }
            })
        }
    } catch (e) {}

    const bodyHtml = `
        <div class="form-group">
            <label>Release Title <span style="color: var(--danger-color);">*</span>
                <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i>
                    <span class="tooltip-text">The exact release title to block (case‑sensitive).</span>
                </span>
            </label>
            <input type="text" id="modalBlacklistTitle" placeholder="e.g., Bad.Release.2024.1080p" required>
            <div id="titleError" class="error-message" style="display: none;"><i class="fas fa-exclamation-circle"></i> Release title is required</div>
        </div>
        <div class="form-group">
            <label>ARR
                <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i>
                    <span class="tooltip-text">If selected, the blacklist applies only to this ARR.</span>
                </span>
            </label>
            <select id="modalBlacklistArr">${arrOptions}</select>
        </div>
        <div class="form-group">
            <label>Reason
                <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i>
                    <span class="tooltip-text">Why this release is blacklisted (informational).</span>
                </span>
            </label>
            <select id="modalBlacklistReason">
                <option value="manual">Manual</option>
                <option value="malicious_file">Malicious File</option>
                <option value="stalled">Stalled</option>
                <option value="slow_download">Slow Download</option>
            </select>
        </div>
        <div class="form-group">
            <label>Expires
                <span class="tooltip"><i class="fas fa-question-circle tooltip-icon"></i>
                    <span class="tooltip-text">How long before the blacklist entry expires (optional).</span>
                </span>
            </label>
            <select id="modalBlacklistExpiry">
                <option value="">Never</option>
                <option value="86400">1 day</option>
                <option value="604800">7 days</option>
                <option value="2592000">30 days</option>
                <option value="7776000">90 days</option>
                <option value="custom">Custom...</option>
            </select>
        </div>
        <div class="form-group" id="modalCustomExpiryGroup" style="display: none;">
            <label>Custom Expiry (days)</label>
            <input type="number" id="modalCustomExpiryDays" min="1" placeholder="Number of days">
        </div>
    `

    openModal({
        title: 'Add Blacklist Entry',
        bodyHtml,
        buttons: [
            { text: 'Cancel', class: 'secondary-btn', onClick: () => {} },
            {
                text: 'Add',
                class: 'primary-btn',
                onClick: async () => {
                    const titleInput = document.getElementById('modalBlacklistTitle')
                    const title = titleInput.value.trim()
                    const titleError = document.getElementById('titleError')
                    if (!title) {
                        titleError.style.display = 'flex'
                        titleInput.focus()
                        return false
                    }
                    const arrSelect = document.getElementById('modalBlacklistArr')
                    const reasonSelect = document.getElementById('modalBlacklistReason')
                    const expirySelect = document.getElementById('modalBlacklistExpiry')
                    let expiresAt = null
                    if (expirySelect.value === 'custom') {
                        const days = parseInt(
                            document.getElementById('modalCustomExpiryDays').value,
                            10
                        )
                        if (days && days > 0)
                            expiresAt = Math.floor(Date.now() / 1000) + days * 86400
                    } else if (expirySelect.value) {
                        expiresAt = Math.floor(Date.now() / 1000) + parseInt(expirySelect.value, 10)
                    }
                    await addBlacklistEntry(
                        title,
                        arrSelect.value || null,
                        reasonSelect.value,
                        expiresAt
                    )
                    window.blacklistDt.fetch()
                },
            },
        ],
        onClose: () => {},
    })

    const expirySelect = document.getElementById('modalBlacklistExpiry')
    const customGroup = document.getElementById('modalCustomExpiryGroup')
    expirySelect.addEventListener('change', () => {
        customGroup.style.display = expirySelect.value === 'custom' ? 'block' : 'none'
    })
    const titleInput = document.getElementById('modalBlacklistTitle')
    titleInput.addEventListener('input', () => {
        document.getElementById('titleError').style.display = 'none'
    })
}

/**
 * Render the delete action button for a blacklist row.
 * @param {number} id - Entry ID.
 * @returns {string} HTML string.
 */
function renderActions(id) {
    const safeId = escapeHtml(String(id))
    return `<button class="action-btn delete-blacklist" data-id="${safeId}" title="Remove from blacklist" aria-label="Delete entry">
        <i class="fas fa-trash-alt"></i>
    </button>`
}

/**
 * Initialise the Blacklist page with a DataTable.
 */
export function initBlacklistPage() {
    consoleDebug('[Blacklist] Initialising')

    const dt = new DataTable({
        containerId: 'blacklistTableContainer',
        apiPath: '/api/v1/blacklist',
        defaultFilters: {},
        filterConfig: false,
        addButton: { text: 'Add Entry', onClick: () => openAddBlacklistModal() },
        columns: [
            {
                key: 'release_title',
                header: 'Release Title',
                visible: true,
                required: true,
                sortable: true,
                render: escapeHtml,
            },
            {
                key: 'arr_name',
                header: 'ARR',
                visible: true,
                sortable: true,
                chip: true,
                chipClass: (v) => getArrChipClass(v),
            },
            {
                key: 'blocked_at',
                header: 'Blocked At',
                visible: true,
                sortable: true,
                render: formatDate,
            },
            {
                key: 'reason',
                header: 'Reason',
                visible: true,
                sortable: true,
                chip: true,
                chipClass: (_, row) => getStatusChip('deletion', row.reason).chipClass,
                render: (_, row) => (row.reason ? getStatusChip('deletion', row.reason).label : ''),
            },
            {
                key: 'expires_at',
                header: 'Expires',
                visible: true,
                sortable: true,
                render: (v) => (v ? formatDate(v) : 'Never'),
            },
            {
                key: 'id',
                header: 'Actions',
                visible: true,
                required: true,
                sortable: false,
                width: '80px',
                html: true,
                render: renderActions,
            },
        ],
        pageSizeKey: 'endarr_blacklist_pageSize',
        urlSync: true,
        detailModal: {
            title: 'Blacklist Entry',
            fields: [
                { key: 'release_title', label: 'Release Title' },
                { key: 'arr_name', label: 'ARR', render: (v) => v || 'Global' },
                { key: 'reason', label: 'Reason' },
                { key: 'source', label: 'Source' },
                { key: 'blocked_at', label: 'Blocked At', render: formatDate },
                {
                    key: 'expires_at',
                    label: 'Expires',
                    render: (v) => (v ? formatDate(v) : 'Never'),
                },
                { key: 'grab_id', label: 'Grab ID' },
            ],
        },
    })
    dt.init()

    dt.elements.tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.delete-blacklist')
        if (!btn) return
        e.stopPropagation()
        const id = btn.dataset.id
        const confirmed = await confirmAction('config', 'Remove this entry from the blacklist?')
        if (confirmed) {
            await deleteBlacklistEntry(id)
            dt.fetch()
        }
    })

    window.blacklistDt = dt
}
