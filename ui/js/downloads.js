// ui/js/downloads.js
import { escapeHtml, formatDate } from './utils.js'

let currentPage = 0
let totalItems = 0
let pageSize = 50

async function loadPageSize() {
    const saved = localStorage.getItem('endarr_downloads_page_size')
    if (saved) {
        pageSize = parseInt(saved, 10)
    } else {
        const config = await loadConfig()
        pageSize = config.ui_preferences?.default_page_size || 50
    }
    const select = document.getElementById('pageSizeSelect')
    if (select) select.value = pageSize
}

function savePageSize(size) {
    pageSize = size
    localStorage.setItem('endarr_downloads_page_size', size)
    currentPage = 0
    loadTorrentsPage(0)
}

async function loadDownloadsPage(page = 0) {
    const key = getApiKey()
    if (!key) return
    const limit = pageSize
    const offset = page * limit
    const params = new URLSearchParams({ limit, offset })
    const url = `/api/v1/downloads?${params.toString()}`
    try {
        const resp = await fetch(url, { headers: { 'X-Api-Key': key } })
        if (!resp.ok) throw new Error('Failed to fetch downloads')
        const data = await resp.json()
        totalItems = data.total
        renderDownloadsTable(data.items)
        updatePagination(page)
    } catch (err) {
        console.error(err)
        const tbody = document.getElementById('downloadsTableBody')
        if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`
    }
}

function formatDeleteReason(reason) {
    const map = {
        policy_met: 'Policy met',
        manual: 'Manual',
        upgraded: 'Upgraded',
        stalled_strikes: 'Stalled strikes',
        slow_download_speed: 'Slow download speed',
        malicious: 'Malicious file',
    }
    return map[reason] || reason || '—'
}

// Remove currentFilterUnpack variable entirely

function renderDownloadsTable(items) {
    const tbody = document.getElementById('downloadsTableBody')
    if (!tbody) return
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6">No downloads found</td></tr>'
        return
    }
    tbody.innerHTML = items
        .map((d) => {
            const displayTitle = d.release_title || (d.hash ? d.hash.substring(0, 16) : 'Unknown')
            let currentState = 'Imported'
            let badgeClass = 'enabled'
            if (d.deleted_at) {
                currentState = 'Deleted'
                badgeClass = 'disabled'
            }
            const stateBadge = `<span class="status-badge ${badgeClass}" role="status">${currentState}</span>`
            return `
        <tr role="row">
            <td role="cell" title="${escapeHtml(d.release_title || d.hash)}">${escapeHtml(displayTitle)}</td>
            <td role="cell">${d.category || '—'}</td>
            <td role="cell">${formatDate(d.import_completed_at)}</td>
            <td role="cell">${formatDate(d.deleted_at)}</td>
            <td role="cell">${formatDeleteReason(d.delete_reason)}</td>
            <td role="cell">${stateBadge}</td>
        </tr>
        `
        })
        .join('')
}

function updatePagination(page) {
    const prevBtn = document.getElementById('prevPage')
    const nextBtn = document.getElementById('nextPage')
    const pageInfo = document.getElementById('pageInfo')
    const totalPages = Math.ceil(totalItems / 50)
    pageInfo.innerText = `Page ${page + 1} of ${totalPages || 1}`
    if (prevBtn) prevBtn.disabled = page === 0
    if (nextBtn) nextBtn.disabled = page + 1 >= totalPages
    currentPage = page
}

export async function initDownloadsPage() {
    console.log('Initialising Downloads page')
    const refreshBtn = document.getElementById('refreshBtn')
    const prevBtn = document.getElementById('prevPage')
    const nextBtn = document.getElementById('nextPage')
    loadPageSize()
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
        savePageSize(parseInt(e.target.value, 10))
    })

    if (refreshBtn) refreshBtn.addEventListener('click', () => loadDownloadsPage(currentPage))
    if (prevBtn) prevBtn.addEventListener('click', () => loadDownloadsPage(currentPage - 1))
    if (nextBtn) nextBtn.addEventListener('click', () => loadDownloadsPage(currentPage + 1))

    await loadDownloadsPage(0)
}
