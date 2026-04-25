// ui/js/blacklist.js
import { escapeHtml, formatDate } from './utils.js'

let currentPage = 0
let totalItems = 0
let pageSize = 50
function loadPageSize() {
    const saved = localStorage.getItem('endarr_blacklist_page_size')
    if (saved) {
        pageSize = parseInt(saved, 10)
    } else {
        // Fallback to global default (will be set in init)
        pageSize = 50
    }
    const select = document.getElementById('pageSizeSelect')
    if (select) select.value = pageSize
}

function savePageSize(size) {
    pageSize = size
    localStorage.setItem('endarr_blacklist_page_size', size)
    currentPage = 0
    loadBlacklistPage(0)
}

async function loadBlacklistPage(page = 0) {
    const key = getApiKey()
    if (!key) return
    const limit = pageSize
    const offset = page * limit
    const url = `/api/v1/blacklist?limit=${limit}&offset=${offset}`
    try {
        const resp = await fetch(url, { headers: { 'X-Api-Key': key } })
        if (!resp.ok) throw new Error('Failed to fetch blacklist')
        const data = await resp.json()
        totalItems = data.total
        renderBlacklistTable(data.items)
        updatePagination(page)
    } catch (err) {
        console.error(err)
        const tbody = document.getElementById('blacklistTableBody')
        if (tbody) tbody.innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`
    }
}

function formatReason(reason) {
    const map = {
        slow_download: 'Slow download',
        stalled: 'Stalled',
        malicious_file: 'Malicious file',
        manual: 'Manual',
    }
    return map[reason] || reason || '—'
}

function renderBlacklistTable(items) {
    const tbody = document.getElementById('blacklistTableBody')
    if (!tbody) return
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6">No blacklisted releases</td></tr>'
        return
    }
    tbody.innerHTML = items
        .map(
            (item) => `
        <tr role="row">
            <td role="cell" title="${escapeHtml(item.release_title)}">${escapeHtml(item.release_title)}</td>
            <td role="cell">${item.arr_name || 'Global'}</td>
            <td role="cell">${formatReason(item.reason)}</td>
            <td role="cell">${formatDate(item.blocked_at)}</td>
            <td role="cell">${item.expires_at ? formatDate(item.expires_at) : 'Never'}</td>
            <td role="cell">
                <button class="action-btn delete-blacklist" data-id="${item.id}" title="Remove from blacklist" aria-label="Delete blacklist entry ${escapeHtml(item.release_title)}">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                </button>
            </td>
        </tr>
    `
        )
        .join('')

    document.querySelectorAll('.delete-blacklist').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            const id = btn.dataset.id
            const confirmed = await confirmAction('config', 'Remove this entry from the blacklist?')
            if (confirmed) {
                await deleteBlacklistEntry(id)
                loadBlacklistPage(currentPage)
            }
        })
    })
}

function updatePagination(page) {
    const prevBtn = document.getElementById('prevPageBl')
    const nextBtn = document.getElementById('nextPageBl')
    const pageInfo = document.getElementById('pageInfoBl')
    const totalPages = Math.ceil(totalItems / 50)
    pageInfo.innerText = `Page ${page + 1} of ${totalPages || 1}`
    if (prevBtn) prevBtn.disabled = page === 0
    if (nextBtn) nextBtn.disabled = page + 1 >= totalPages
    currentPage = page
}

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

// ---- Global Modal Integration ----
async function openAddBlacklistModal() {
    // Fetch ARR clients for dropdown
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
        bodyHtml: bodyHtml,
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
                        return false // prevent modal close
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
                        if (days && days > 0) {
                            expiresAt = Math.floor(Date.now() / 1000) + days * 86400
                        }
                    } else if (expirySelect.value) {
                        expiresAt = Math.floor(Date.now() / 1000) + parseInt(expirySelect.value, 10)
                    }

                    await addBlacklistEntry(
                        title,
                        arrSelect.value || null,
                        reasonSelect.value,
                        expiresAt
                    )
                    loadBlacklistPage(0)
                },
            },
        ],
        onClose: () => {},
    })

    // Attach behaviour: toggle custom expiry field
    const expirySelect = document.getElementById('modalBlacklistExpiry')
    const customGroup = document.getElementById('modalCustomExpiryGroup')
    expirySelect.addEventListener('change', () => {
        customGroup.style.display = expirySelect.value === 'custom' ? 'block' : 'none'
    })

    // Clear error on input
    const titleInput = document.getElementById('modalBlacklistTitle')
    titleInput.addEventListener('input', () => {
        document.getElementById('titleError').style.display = 'none'
    })
}

// ---- Initialisation ----
export async function initBlacklistPage() {
    console.log('Initialising Blacklist page')

    // Load page size
    const config = await loadConfig()
    const defaultPageSize = config.ui_preferences?.default_page_size || 50
    const saved = localStorage.getItem('endarr_blacklist_page_size')
    pageSize = saved ? parseInt(saved, 10) : defaultPageSize

    const addBtn = document.getElementById('addBlacklistBtn')
    const prevBtn = document.getElementById('prevPageBl')
    const nextBtn = document.getElementById('nextPageBl')
    const pageSizeSelect = document.getElementById('pageSizeSelect')

    if (addBtn) addBtn.addEventListener('click', openAddBlacklistModal)
    if (prevBtn) prevBtn.addEventListener('click', () => loadBlacklistPage(currentPage - 1))
    if (nextBtn) nextBtn.addEventListener('click', () => loadBlacklistPage(currentPage + 1))
    if (pageSizeSelect) {
        pageSizeSelect.value = pageSize
        pageSizeSelect.addEventListener('change', (e) => {
            savePageSize(parseInt(e.target.value, 10))
        })
    }

    await loadBlacklistPage(0)
}
