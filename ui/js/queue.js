// ui/js/queue.js
import { DataTable } from './DataTable.js'
import { escapeHtml, formatDate, formatBytes, getApiKey, consoleDebug } from './utils.js'
import { showToast, confirmAction } from './ui-helpers.js'

/* global openModal, closeModal */

/**
 * Render action buttons for a torrent row.
 * @param {string} hash - Torrent hash.
 * @param {Object} row - Torrent data row.
 * @returns {string} HTML string of action buttons.
 */
function renderActions(hash, row) {
    if (!row.arr_name) return ''
    const isImported = !!row.import_completed_at
    const importBtn = isImported
        ? ''
        : `<button class="action-btn mark-imported" data-hash="${escapeHtml(hash)}" title="Mark as Imported" aria-label="Mark as Imported">
            <i class="fas fa-check-circle"></i>
           </button>`
    return `
        ${importBtn}
        <button class="action-btn delete-torrent" data-hash="${escapeHtml(hash)}" title="Delete torrent" aria-label="Delete torrent">
            <i class="fas fa-trash-alt"></i>
        </button>
        <button class="action-btn blacklist-torrent" data-hash="${escapeHtml(hash)}" title="Blacklist release" aria-label="Blacklist release">
            <i class="fas fa-ban"></i>
        </button>
    `
}

/**
 * Initialise the Queue page with a DataTable and action handlers.
 */
export function initQueuePage() {
    consoleDebug('[Queue] Initialising')

    const dt = new DataTable({
        containerId: 'queueTableContainer',
        apiPath: '/api/v1/torrents',
        defaultFilters: { status: 'active' },
        filterConfig: { type: 'category' },
        columns: [
            {
                key: 'import_completed_at',
                header: '',
                visible: true,
                required: true,
                sortable: false,
                width: '30px',
                html: true,
                render: (v) => {
                    const downloaded = !!v
                    const icon = downloaded ? 'fa-download' : 'fa-cloud-arrow-down'
                    const title = downloaded ? 'Downloaded' : 'Downloading'
                    return `<i class="fas ${icon}" title="${title}" aria-label="${title}"></i>`
                },
            },
            {
                key: 'name',
                header: 'Name',
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
                chipClass: (v) => (v ? 'chip-' + v : 'neutral'),
            },
            {
                key: 'category',
                header: 'Category',
                chip: true,
                chipClass: 'neutral',
                visible: true,
                sortable: true,
            },
            {
                key: 'total_size',
                header: 'Size',
                visible: true,
                sortable: true,
                render: formatBytes,
            },
            {
                key: 'state',
                header: 'State',
                visible: true,
                chip: true,
                sortable: false,
                render: (v) => v || 'Active',
            },
            {
                key: 'added_to_client_at',
                header: 'Added',
                visible: true,
                sortable: true,
                render: formatDate,
            },
            {
                key: 'hash',
                header: 'Actions',
                visible: true,
                required: true,
                sortable: false,
                width: '100px',
                className: 'actions-column',
                html: true,
                render: renderActions,
            },
        ],
        pageSizeKey: 'endarr_queue_pageSize',
        urlSync: true,
        detailModal: {
            title: 'Torrent Details',
            fields: [
                { key: 'name', label: 'Name' },
                { key: 'hash', label: 'Hash' },
                { key: 'category', label: 'Category' },
                { key: 'save_path', label: 'Save Path' },
                { key: 'total_size', label: 'Total Size', render: formatBytes },
                { key: 'added_to_client_at', label: 'Added', render: formatDate },
                { key: 'import_completed_at', label: 'Imported', render: formatDate },
                { key: 'stall_strikes', label: 'Stall Strikes' },
                { key: 'state', label: 'State' },
            ],
        },
    })

    dt.init()

    // Delegated action handlers
    dt.elements.tbody.addEventListener('click', async (e) => {
        const key = getApiKey()
        if (!key) return

        const importBtn = e.target.closest('.mark-imported')
        if (importBtn) {
            e.stopPropagation()
            const hash = importBtn.dataset.hash
            const confirmed = await confirmAction('config', 'Mark this torrent as imported?')
            if (!confirmed) return
            try {
                const resp = await fetch(`/api/v1/torrents/${hash}/import`, {
                    method: 'POST',
                    headers: { 'X-Api-Key': key },
                })
                if (!resp.ok) throw new Error('Failed')
                showToast('Torrent marked as imported', 'success')
                dt.fetch()
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error')
            }
            return
        }

        const delBtn = e.target.closest('.delete-torrent')
        if (delBtn) {
            e.stopPropagation()
            const hash = delBtn.dataset.hash
            const confirmed = await confirmAction('data', 'Delete this torrent?')
            if (!confirmed) return
            try {
                const resp = await fetch(`/api/v1/torrents/${hash}`, {
                    method: 'DELETE',
                    headers: { 'X-Api-Key': key },
                })
                if (!resp.ok) throw new Error('Failed')
                showToast('Torrent deleted', 'success')
                dt.fetch()
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error')
            }
            return
        }

        const blBtn = e.target.closest('.blacklist-torrent')
        if (blBtn) {
            e.stopPropagation()
            const hash = blBtn.dataset.hash
            const row = dt.state.rows.find((r) => r.hash === hash)
            if (!row) return
            const title = row.name || hash
            const confirmed = await confirmAction('config', `Blacklist "${title}"?`)
            if (!confirmed) return
            try {
                const resp = await fetch('/api/v1/blacklist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
                    body: JSON.stringify({ release_title: title, reason: 'manual' }),
                })
                if (!resp.ok) throw new Error('Failed')
                showToast('Release blacklisted', 'success')
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error')
            }
            return
        }
    })
}