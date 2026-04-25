// ui/js/torrents.js
import { escapeHtml, formatDate, getFiltersFromUrl, updateUrlFilters } from './utils.js'

let currentPage = 0
let totalItems = 0
let filters = { status: '', category: '__all__' }
let pageSize = 50
let hideUncategorizedDefault = true

async function loadPageSize() {
    const saved = localStorage.getItem('endarr_torrents_page_size')
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
    localStorage.setItem('endarr_torrents_page_size', size)
    currentPage = 0
    loadTorrentsPage(0)
}

async function loadTorrentsPage(page = 0) {
    const key = getApiKey()
    if (!key) return
    const limit = pageSize
    const offset = page * limit
    const params = new URLSearchParams({
        limit,
        offset,
        status: filters.status,
    })

    // Apply category filter
    if (filters.category && filters.category !== '__all__') {
        params.append('category', filters.category)
    } else if (filters.category === '__all__' && hideUncategorizedDefault) {
        params.append('exclude_empty', 'true')
    }

    const url = `/api/v1/torrents?${params.toString()}`
    try {
        const resp = await fetch(url, { headers: { 'X-Api-Key': key } })
        if (!resp.ok) throw new Error('Failed to fetch torrents')
        const data = await resp.json()
        totalItems = data.total
        renderTorrentsTable(data.items)
        updatePagination(page)
    } catch (err) {
        console.error(err)
        const tbody = document.getElementById('torrentsTableBody')
        if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`
    }
}

function renderTorrentsTable(items) {
    const tbody = document.getElementById('torrentsTableBody')
    if (!tbody) return
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7">No torrents found</td></tr>'
        return
    }
    tbody.innerHTML = items
        .map((t) => {
            const isDeleted = !!t.deleted_at
            const statusBadge = isDeleted
                ? '<span class="status-badge disabled" role="status">Deleted</span>'
                : '<span class="status-badge enabled" role="status">Active</span>'
            const torrentName = t.name || t.hash.substring(0, 16)
            return `
        <tr role="row">
            <td role="cell" title="${escapeHtml(t.name || t.hash)}">${escapeHtml(torrentName)}</td>
            <td role="cell">${t.category || '—'}</td>
            <td role="cell">${formatDate(t.added_to_client_at)}</td>
            <td role="cell">${formatDate(t.import_completed_at)}</td>
            <td role="cell">${statusBadge}</td>
            <td role="cell">
                <button class="action-btn delete-torrent" data-hash="${t.hash}" ${isDeleted ? 'disabled' : ''} aria-label="Delete torrent ${escapeHtml(torrentName)}" title="Delete torrent from download client"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
                <button class="action-btn blacklist-torrent" data-hash="${t.hash}" ${isDeleted ? 'disabled' : ''} aria-label="Blacklist release ${escapeHtml(torrentName)}" title="Add release to blacklist"><i class="fas fa-ban" aria-hidden="true"></i></button>
            </td>
        </tr>
        `
        })
        .join('')

    // Attach action listeners (unchanged)
    document.querySelectorAll('.delete-torrent:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            const hash = btn.dataset.hash
            const row = btn.closest('tr')
            const nameCell = row.cells[0]
            const torrentName = nameCell.innerText
            if (await confirmAction('data', `Delete torrent "${torrentName}"?`)) {
                await deleteTorrent(hash)
                loadTorrentsPage(currentPage)
            }
        })
    })

    document.querySelectorAll('.blacklist-torrent:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            const row = btn.closest('tr')
            const nameCell = row.cells[0]
            const releaseTitle = nameCell.innerText
            if (await confirmAction('config', `Blacklist release "${releaseTitle}"?`)) {
                await addToBlacklist(releaseTitle)
                loadTorrentsPage(currentPage)
            }
        })
    })
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

async function deleteTorrent(hash) {
    const key = getApiKey()
    console.log('Deleting torrent:', hash, 'API key exists:', !!key)
    try {
        const resp = await fetch(`/api/v1/torrents/${hash}`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': key },
        })
        console.log('Response status:', resp.status, 'ok:', resp.ok)
        const text = await resp.text()
        console.log('Response body:', text)
        if (!resp.ok) {
            throw new Error(`Delete failed (${resp.status}): ${text}`)
        }
    } catch (err) {
        console.error(err)
        alert(`Error: ${err.message}`)
    }
}

async function addToBlacklist(releaseTitle) {
    const key = getApiKey()
    try {
        const resp = await fetch('/api/v1/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
            body: JSON.stringify({ release_title: releaseTitle, reason: 'manual' }),
        })
        if (!resp.ok) throw new Error('Blacklist failed')
        alert('Release blacklisted')
    } catch (err) {
        alert(`Error: ${err.message}`)
    }
}

export async function initTorrentsPage() {
    console.log('Initialising Torrents page')
    const statusSelect = document.getElementById('filterStatus')
    const categorySelect = document.getElementById('filterCategory')
    const refreshBtn = document.getElementById('refreshBtn')
    const prevBtn = document.getElementById('prevPage')
    const nextBtn = document.getElementById('nextPage')

    loadPageSize()
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
        savePageSize(parseInt(e.target.value, 10))
    })

    // Load UI preference for hiding uncategorized torrents
    const config = await loadConfig()
    hideUncategorizedDefault = config.ui_preferences?.hide_uncategorized_by_default !== false

    let filters = getFiltersFromUrl()
    // Set defaults if missing
    if (!filters.status) filters.status = ''
    if (!filters.category) filters.category = '__all__'

    // Set dropdown values
    statusSelect.value = filters.status
    categorySelect.value = filters.category

    // When filters change:
    statusSelect.addEventListener('change', () => {
        filters.status = statusSelect.value
        updateUrlFilters(filters)
        currentPage = 0
        loadTorrentsPage(0)
    })

    categorySelect.addEventListener('change', () => {
        filters.category = categorySelect.value
        updateUrlFilters(filters)
        currentPage = 0
        loadTorrentsPage(0)
    })

    if (refreshBtn) refreshBtn.addEventListener('click', () => loadTorrentsPage(currentPage))
    if (prevBtn) prevBtn.addEventListener('click', () => loadTorrentsPage(currentPage - 1))
    if (nextBtn) nextBtn.addEventListener('click', () => loadTorrentsPage(currentPage + 1))

    await loadTorrentsPage(0)
}
