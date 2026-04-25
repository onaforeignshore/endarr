// ui/js/grabs.js
import {
    escapeHtml,
    formatDate,
    formatBytes,
    getFiltersFromUrl,
    updateUrlFilters,
} from './utils.js'

let currentPage = 0
let totalItems = 0
let currentFilterArr = ''
let pageSize = 50

async function loadPageSize() {
    const saved = localStorage.getItem('endarr_grabs_page_size')
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
    localStorage.setItem('endarr_grabs_page_size', size)
    currentPage = 0
    loadTorrentsPage(0)
}

async function loadGrabsPage(page = 0) {
    const key = getApiKey()
    if (!key) return
    const limit = pageSize
    const offset = page * limit
    const params = new URLSearchParams({ limit, offset })
    if (currentFilterArr) {
        params.append('arr_name', currentFilterArr)
    }
    const url = `/api/v1/grabs?${params.toString()}`
    try {
        const resp = await fetch(url, { headers: { 'X-Api-Key': key } })
        if (!resp.ok) throw new Error('Failed to fetch grabs')
        const data = await resp.json()
        totalItems = data.total
        renderGrabsTable(data.items)
        updatePagination(page)
    } catch (err) {
        console.error(err)
        const tbody = document.getElementById('grabsTableBody')
        if (tbody) tbody.innerHTML = `<tr><td colspan="8">Error: ${err.message}</td></tr>`
    }
}

function renderGrabsTable(items) {
    const tbody = document.getElementById('grabsTableBody')
    if (!tbody) return
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8">No grabs found</td></tr>'
        return
    }
    tbody.innerHTML = items
        .map((g) => {
            let statusBadge = ''
            if (g.status === 'blacklisted') {
                statusBadge =
                    '<span class="status-badge disabled" role="status" aria-label="Blacklisted">Blacklisted</span>'
            } else if (g.status === 'matched') {
                statusBadge =
                    '<span class="status-badge enabled" role="status" aria-label="Matched">Matched</span>'
            } else {
                statusBadge =
                    '<span class="status-badge active" role="status" aria-label="Pending">Pending</span>'
            }
            return `
        <tr role="row">
            <td role="cell" title="${escapeHtml(g.release_title)}">${escapeHtml(g.release_title)}</td>
            <td role="cell">${g.arr_name}</td>
            <td role="cell">${g.media_type || '—'}</td>
            <td role="cell">${g.indexer || '—'}</td>
            <td role="cell">${g.quality || '—'}</td>
            <td role="cell">${formatBytes(g.size)}</td>
            <td role="cell">${formatDate(g.grabbed_at)}</td>
            <td role="cell">${statusBadge}</td>
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

export async function initGrabsPage() {
    console.log('Initialising Grabs page')
    const filterArr = document.getElementById('filterArr')
    const refreshBtn = document.getElementById('refreshBtn')
    const prevBtn = document.getElementById('prevPage')
    const nextBtn = document.getElementById('nextPage')
    loadPageSize()
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
        savePageSize(parseInt(e.target.value, 10))
    })

    let filters = getFiltersFromUrl()
    if (!filters.arr_name) filters.arr_name = ''

    filterArr.value = filters.arr_name

    filterArr.addEventListener('change', () => {
        filters.arr_name = filterArr.value
        updateUrlFilters(filters)
        currentPage = 0
        loadGrabsPage(0)
    })

    if (refreshBtn) refreshBtn.addEventListener('click', () => loadGrabsPage(currentPage))
    if (prevBtn) prevBtn.addEventListener('click', () => loadGrabsPage(currentPage - 1))
    if (nextBtn) nextBtn.addEventListener('click', () => loadGrabsPage(currentPage + 1))

    await loadGrabsPage(0)
}
