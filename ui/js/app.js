// Clean URL and bootstrap API key
;(async function () {
    const urlParams = new URLSearchParams(window.location.search)
    const apiKeyFromUrl = urlParams.get('apikey')
    if (apiKeyFromUrl) {
        localStorage.setItem('endarr_api_key', apiKeyFromUrl)
        // Remove the apikey parameter and redirect
        urlParams.delete('apikey')
        const newSearch = urlParams.toString()
        const newUrl =
            window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash
        window.location.replace(newUrl)
        return
    }

    // No key in URL, check localStorage
    let storedKey = localStorage.getItem('endarr_api_key')
    if (storedKey) {
        return // key exists, nothing to do
    }

    // No key in localStorage, try to fetch from /api/v1/public_key
    try {
        const response = await fetch('/api/v1/public_key')
        if (response.ok) {
            const data = await response.json()
            if (data.webhook_key) {
                localStorage.setItem('endarr_api_key', data.webhook_key)
                // Reload the page to apply the key
                window.location.reload()
                return
            }
        }
        console.warn('No API key found. UI will show error.')
    } catch (err) {
        console.error('Failed to fetch public key:', err)
    }
})()

// Helper to get API key (from localStorage)
let apiKey = null
function getApiKey() {
    if (apiKey) return apiKey
    const stored = localStorage.getItem('endarr_api_key')
    if (stored) {
        apiKey = stored
        return stored
    }
    return null
}

async function loadConfig() {
    const key = getApiKey()
    if (!key) throw new Error('No API key')
    const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
    if (!resp.ok) throw new Error('Failed to load config')
    return await resp.json()
}

// ========== THEME TOGGLE ==========
function initThemeToggle() {
    const toggle = document.getElementById('themeToggle')
    if (!toggle) return

    // Apply the saved theme on load
    function applyTheme(theme) {
        document.documentElement.classList.toggle('light-theme', theme === 'light')
        toggle.classList.toggle('fa-moon', theme !== 'light')
        toggle.classList.toggle('fa-sun', theme === 'light')
    }

    const storedTheme = localStorage.getItem('endarr_theme') || 'dark'
    applyTheme(storedTheme)

    // Toggle on click – always use localStorage as the source of truth
    document.body.addEventListener('click', (e) => {
        const button = e.target.closest('#themeToggle')
        if (!button) return

        const currentTheme = localStorage.getItem('endarr_theme') || 'dark'
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('endarr_theme', newTheme)
        applyTheme(newTheme)
    })
}

// Global confirmation modal
let confirmResolve = null

function showConfirm(message) {
    const previousFocus = document.activeElement
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal')
        const msgSpan = document.getElementById('confirmModalMessage')
        const okBtn = document.getElementById('confirmModalOk')
        const cancelBtn = document.getElementById('confirmModalCancel')
        const closeBtn = document.getElementById('confirmModalClose')

        msgSpan.innerText = message
        modal.style.display = 'flex'
        modal.setAttribute('aria-hidden', 'false')

        // Temporarily disable global modal Escape
        const globalModal = document.getElementById('globalModal')
        const globalEscapeHandler = globalModal._escapeHandler
        if (globalEscapeHandler) {
            document.removeEventListener('keydown', globalEscapeHandler)
        }

        const cleanup = () => {
            // Move focus back to the element that was focused before the modal opened
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus()
            } else {
                document.body.focus()
            }
            modal.style.display = 'none'
            modal.setAttribute('aria-hidden', 'true')
            okBtn.removeEventListener('click', okHandler)
            cancelBtn.removeEventListener('click', cancelHandler)
            closeBtn.removeEventListener('click', cancelHandler)
            document.removeEventListener('keydown', escHandler)
            // Restore global modal Escape
            if (globalEscapeHandler) {
                document.addEventListener('keydown', globalEscapeHandler)
            }
        }

        const okHandler = () => {
            cleanup()
            resolve(true)
        }
        const cancelHandler = () => {
            cleanup()
            resolve(false)
        }
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                cancelHandler()
            }
        }

        okBtn.addEventListener('click', okHandler)
        cancelBtn.addEventListener('click', cancelHandler)
        closeBtn.addEventListener('click', cancelHandler)
        document.addEventListener('keydown', escHandler)
        modal.focus()
    })
}

async function confirmAction(type, message) {
    const key = getApiKey()
    if (!key) return false

    try {
        const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
        if (!resp.ok) return false
        const config = await resp.json()
        const uiPrefs = config.ui_preferences || {}

        if (type === 'data' && !uiPrefs.confirm_data_deletion) return true
        if (type === 'config' && !uiPrefs.confirm_config_modification) return true

        return await showConfirm(message)
    } catch {
        return await showConfirm(message) // fallback
    }
}

// Activity filter state
let activityFilters = {
    grab: true,
    import: true,
    deletion: true,
    upgrade: false,
    stall: false,
    blacklist: false,
    malicious: false,
}

// Load filters from localStorage
function loadActivityFilters() {
    const saved = localStorage.getItem('endarr_activity_filters')
    if (saved) {
        try {
            const parsed = JSON.parse(saved)
            activityFilters = { ...activityFilters, ...parsed }
        } catch (e) {}
    }
    // Apply to checkboxes
    for (const [key, value] of Object.entries(activityFilters)) {
        const cb = document.querySelector(`#activityFilterDropdown input[value="${key}"]`)
        if (cb) cb.checked = value
    }
}

// Save filters to localStorage
function saveActivityFilters() {
    localStorage.setItem('endarr_activity_filters', JSON.stringify(activityFilters))
    // Re-render activity with new filters
    fetchAndRenderActivity()
}

// Fetch and render activity (extracted for reusability)
async function fetchAndRenderActivity() {
    const key = getApiKey()
    if (!key) return
    const activityList = document.getElementById('recentActivityList')
    if (!activityList) return

    try {
        const resp = await fetch('/api/v1/activity?limit=50', { headers: { 'X-Api-Key': key } })
        if (resp.ok) {
            const events = await resp.json()
            // Filter based on activityFilters
            const filtered = events.filter((e) => {
                if (e.type === 'grab') return activityFilters.grab
                if (e.type === 'import') return activityFilters.import
                if (e.type === 'deletion') return activityFilters.deletion
                // Add more types when backend supports them
                return false
            })
            if (filtered.length === 0) {
                activityList.innerHTML =
                    '<div class="activity-item">No activity matching filters</div>'
            } else {
                activityList.innerHTML = filtered
                    .map((e) => {
                        const time = new Date(e.timestamp * 1000).toLocaleString()
                        let icon = ''
                        if (e.type === 'grab')
                            icon = '<i class="fas fa-hand-paper" aria-hidden="true"></i>'
                        else if (e.type === 'import')
                            icon = '<i class="fas fa-download" aria-hidden="true"></i>'
                        else icon = '<i class="fas fa-trash-alt" aria-hidden="true"></i>'
                        const desc =
                            e.type === 'deletion'
                                ? `Deleted: ${e.title} (${e.reason})`
                                : e.type === 'import'
                                  ? `Imported: ${e.title}`
                                  : `Grabbed: ${e.title}`
                        return `<div class="activity-item" role="article" aria-label="${desc}"><span>${icon} ${escapeHtml(desc)}</span><span class="activity-time">${time}</span></div>`
                    })
                    .join('')
            }
        }
    } catch (err) {
        activityList.innerHTML = '<div class="activity-item">Unable to load activity</div>'
    }
}

// Setup filter dropdown
function setupActivityFilter() {
    const btn = document.getElementById('activityFilterBtn')
    const dropdown = document.getElementById('activityFilterDropdown')
    if (!btn || !dropdown) return

    // Toggle dropdown and update ARIA attributes
    const openDropdown = () => {
        dropdown.style.display = 'block'
        btn.setAttribute('aria-expanded', 'true')
        // Focus first checkbox
        const firstCheckbox = dropdown.querySelector('input[type="checkbox"]')
        if (firstCheckbox) firstCheckbox.focus()
    }

    const closeDropdown = () => {
        dropdown.style.display = 'none'
        btn.setAttribute('aria-expanded', 'false')
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (dropdown.style.display === 'none') {
            openDropdown()
        } else {
            closeDropdown()
        }
    })

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown()
        }
    })

    // Keyboard navigation within dropdown
    dropdown.addEventListener('keydown', (e) => {
        const items = Array.from(dropdown.querySelectorAll('input[type="checkbox"]'))
        const currentIndex = items.indexOf(document.activeElement)

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            const nextIndex = (currentIndex + 1) % items.length
            items[nextIndex].focus()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const prevIndex = (currentIndex - 1 + items.length) % items.length
            items[prevIndex].focus()
        } else if (e.key === 'Escape') {
            closeDropdown()
            btn.focus()
        } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            const checkbox = document.activeElement
            if (checkbox && checkbox.type === 'checkbox') {
                checkbox.checked = !checkbox.checked
                // Trigger change event
                const event = new Event('change', { bubbles: true })
                checkbox.dispatchEvent(event)
                // Update ARIA checked state
                const label = checkbox.closest('label')
                if (label) label.setAttribute('aria-checked', checkbox.checked)
            }
        }
    })

    // Handle checkbox changes (update ARIA checked and save filters)
    dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const label = cb.closest('label')
        cb.addEventListener('change', (e) => {
            e.stopPropagation()
            activityFilters[cb.value] = cb.checked
            if (label) label.setAttribute('aria-checked', cb.checked)
            saveActivityFilters()
        })
        // Initial ARIA checked state
        if (label) label.setAttribute('aria-checked', cb.checked)
    })
}

// Dashboard initialisation
async function initDashboard() {
    console.log('Initialising Dashboard')

    const healthSpan = document.getElementById('healthStatus')
    const sysList = document.getElementById('systemStatusList')
    const activeSpan = document.getElementById('activeTorrents')
    const grabsSpan = document.getElementById('grabs24h')
    const deletionsSpan = document.getElementById('deletions24h')
    const activityList = document.getElementById('recentActivityList')

    if (!healthSpan || !sysList || !activeSpan || !grabsSpan || !deletionsSpan || !activityList) {
        console.error('Dashboard elements missing')
        return
    }

    const key = getApiKey()

    // Show onboarding banner if no API key
    const banner = document.getElementById('onboardingBanner')
    if (!key) {
        // Show banner
        if (banner) {
            banner.style.display = 'flex'
            document.getElementById('setupApiKeyBtn').addEventListener('click', showOnboardingModal)
            document.getElementById('dismissBannerBtn').addEventListener('click', () => {
                banner.style.display = 'none'
            })
        }
        // Display friendly message in stats
        healthSpan.innerText = 'No API Key'
        sysList.innerHTML = '<div class="status-item">API key required for webhooks</div>'
        activeSpan.innerText = '—'
        grabsSpan.innerText = '—'
        deletionsSpan.innerText = '—'
        activityList.innerHTML = '<div class="activity-item">Set up API key to view activity</div>'
        if (dbInfoCard) dbInfoCard.innerHTML = '<div class="status-item">API key required</div>'
        return // Stop further API calls
    }

    try {
        const statusRes = await fetch('/api/v1/status', { headers: { 'X-Api-Key': key } })
        if (!statusRes.ok) throw new Error('Failed to fetch status')
        const status = await statusRes.json()

        // Health stat card
        const allClientsConnected =
            (status.download_clients || []).every((c) => c.connected) &&
            (status.arr_clients || []).every((c) => c.connected)
        healthSpan.innerText = allClientsConnected ? 'All OK' : 'Issues'

        // Build System Status HTML with three‑column chip layout
        let sysHtml = '<div class="system-status-columns">'

        // Column 1: Download Clients
        sysHtml += '<div class="status-column">'
        sysHtml += '<div class="column-heading">Download Clients</div>'
        const dlClients = status.download_clients || []
        if (dlClients.length > 0) {
            sysHtml += '<div class="chip-container">'
            dlClients.forEach((client) => {
                const chipClass = client.connected ? 'status-chip' : 'status-chip disconnected'
                const tooltip = client.connected ? 'Connected' : 'Disconnected'
                sysHtml += `<span class="${chipClass}" title="${tooltip}">${escapeHtml(client.name)}</span>`
            })
            sysHtml += '</div>'
        } else {
            sysHtml += '<div class="status-text">None</div>'
        }
        sysHtml += '</div>'

        // Column 2: ARR Clients
        sysHtml += '<div class="status-column">'
        sysHtml += '<div class="column-heading">ARR Clients</div>'
        const arrClients = status.arr_clients || []
        if (arrClients.length > 0) {
            sysHtml += '<div class="chip-container">'
            arrClients.forEach((client) => {
                const chipClass = client.connected ? 'status-chip' : 'status-chip disconnected'
                const tooltip = client.connected ? 'Connected' : 'Disconnected'
                sysHtml += `<span class="${chipClass}" title="${tooltip}">${escapeHtml(client.name)}</span>`
            })
            sysHtml += '</div>'
        } else {
            sysHtml += '<div class="status-text">None</div>'
        }
        sysHtml += '</div>'

        // Column 3: Watchdog (aggregate status)
        sysHtml += '<div class="status-column">'
        sysHtml += '<div class="column-heading">Watchdog</div>'
        sysHtml += '<div class="chip-container">'
        const anyWatchdogRunning = dlClients.some((c) => c.watchdog_running)
        const watchdogChipClass = anyWatchdogRunning ? 'status-chip' : 'status-chip disconnected'
        const watchdogTooltip = anyWatchdogRunning
            ? 'At least one watchdog running'
            : 'All watchdogs stopped'
        sysHtml += `<span class="${watchdogChipClass}" title="${watchdogTooltip}">${anyWatchdogRunning ? 'Running' : 'Stopped'}</span>`
        sysHtml += '</div>'
        sysHtml += '</div>'

        sysHtml += '</div>' // close system-status-columns
        sysList.innerHTML = sysHtml

        // Fetch stats
        const statsRes = await fetch('/api/v1/stats', { headers: { 'X-Api-Key': key } })
        if (statsRes.ok) {
            const stats = await statsRes.json()
            activeSpan.innerText = stats.active_torrents
            grabsSpan.innerText = stats.grabs_24h
            deletionsSpan.innerText = stats.deletions_24h
        } else {
            activeSpan.innerText = '?'
            grabsSpan.innerText = '?'
            deletionsSpan.innerText = '?'
        }

        // Check for config issues and show banner if any
        const issuesResp = await fetch('/api/v1/config/issues', { headers: { 'X-Api-Key': key } })
        if (issuesResp.ok) {
            const issuesData = await issuesResp.json()
            if (issuesData.issues.length > 0) {
                showConfigIssuesBanner(issuesData.issues.length)
            }
        }

        // Helper function (add to app.js)
        function showConfigIssuesBanner(count) {
            // Create or show a banner that links to Settings > General
            const banner = document.createElement('div')
            banner.className = 'onboarding-banner'
            banner.style.background = 'var(--warning-color)'
            banner.innerHTML = `
                <div class="banner-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${count} configuration issue${count > 1 ? 's' : ''} detected. Invalid values have been replaced with defaults.</span>
                </div>
                <div class="banner-actions">
                    <button class="primary-btn" id="viewConfigIssuesBtn">View Issues</button>
                </div>
            `
            // Insert after top-bar or before stats grid
            const content = document.getElementById('pageContent')
            content.insertBefore(banner, content.firstChild)

            document.getElementById('viewConfigIssuesBtn').addEventListener('click', () => {
                // Navigate to Settings > General using the new sub‑navigation
                const settingsNavItem = document.querySelector('.nav-item[data-page="settings"]')
                if (settingsNavItem) settingsNavItem.click()
                setTimeout(() => {
                    const generalSubItem = document.querySelector(
                        '#settingsSubNav .sub-item[data-settings-page="general"]'
                    )
                    if (generalSubItem) generalSubItem.click()
                }, 100)
            })
        }

        // Fetch database info
        const dbRes = await fetch('/api/v1/db_info', { headers: { 'X-Api-Key': key } })
        const dbInfoCard = document.getElementById('dbInfoCard')
        if (dbRes.ok) {
            const dbInfo = await dbRes.json()
            dbInfoCard.innerHTML = `
                <div class="status-item" role="listitem"><span>Database Size</span><span class="status-value">${dbInfo.size_mb} MB</span></div>
                <div class="status-item" role="listitem"><span>Grabs</span><span class="status-value">${dbInfo.grabs_count}</span></div>
                <div class="status-item" role="listitem"><span>Downloads</span><span class="status-value">${dbInfo.downloads_count}</span></div>
                <div class="status-item" role="listitem"><span>Blacklist</span><span class="status-value">${dbInfo.blacklist_count}</span></div>
            `
        } else {
            dbInfoCard.innerHTML = '<div class="status-item">Unable to load database info</div>'
        }

        // Activity feed
        loadActivityFilters()
        setupActivityFilter()
        await fetchAndRenderActivity()
    } catch (err) {
        console.error('Dashboard error:', err)
        healthSpan.innerText = 'Error'
        sysList.innerHTML = `<div class="status-item">Error: ${err.message}</div>`
        activeSpan.innerText = '?'
        grabsSpan.innerText = '?'
        deletionsSpan.innerText = '?'
        if (activityList)
            activityList.innerHTML = '<div class="activity-item">Unable to load activity</div>'
    }
}

async function initTorrentsPage() {
    // Dynamically import torrents.js module
    const module = await import('./torrents.js')
    await module.initTorrentsPage()
}

async function initGrabsPage() {
    const module = await import('./grabs.js')
    await module.initGrabsPage()
}

async function initDownloadsPage() {
    const module = await import('./downloads.js')
    await module.initDownloadsPage()
}

async function initBlacklistPage() {
    const module = await import('./blacklist.js')
    await module.initBlacklistPage()
}

// Helper: format timestamp
function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleString()
}

// Helper: escape HTML
function escapeHtml(str) {
    if (!str) return ''
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;'
        if (m === '<') return '&lt;'
        if (m === '>') return '&gt;'
        return m
    })
}

async function initSettingsPage() {
    console.log('Initialising Settings page')
    try {
        const module = await import('./settings.js')
        console.log('Module imported, calling initSettingsSubpage')
        if (module.initSettingsSubpage) {
            module.initSettingsSubpage()
            console.log('initSettingsSubpage called')
        } else {
            console.error('settings.js does not export initSettingsSubpage')
        }
    } catch (err) {
        console.error('Failed to load settings.js:', err)
    }
}

async function initSystemPage() {
    console.log('Initialising System page')
    try {
        const module = await import('./system.js')
        console.log('Module imported, calling initSystemSubpage')
        if (module.initSystemSubpage) {
            module.initSystemSubpage()
            console.log('initSystemSubpage called')
        } else {
            console.error('system.js does not export initSystemSubpage')
        }
    } catch (err) {
        console.error('Failed to load system.js:', err)
    }
}

// Pages definition
const pages = {
    dashboard: { title: 'Dashboard', file: 'dashboard.html', init: initDashboard },
    torrents: { title: 'Torrents', file: 'torrents.html', init: initTorrentsPage },
    grabs: { title: 'Grabs', file: 'grabs.html', init: initGrabsPage },
    downloads: { title: 'Downloads', file: 'downloads.html', init: initDownloadsPage },
    blacklist: { title: 'Blacklist', file: 'blacklist.html', init: initBlacklistPage },
    settings: { title: 'Settings', file: 'settings.html', init: initSettingsPage },
    system: { title: 'System', file: 'logs.html', init: initSystemPage },
}

let currentPage = 'dashboard'

async function loadPage(pageId) {
    const page = pages[pageId]
    if (!page) return

    // Update active nav (main items only)
    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
        item.classList.remove('active')
        item.removeAttribute('aria-current')
        if (item.getAttribute('data-page') === pageId) {
            item.classList.add('active')
            item.setAttribute('aria-current', 'page')
        }
    })

    const contentDiv = document.getElementById('pageContent')
    contentDiv.innerHTML = '<div class="loading">Loading...</div>'
    try {
        const response = await fetch(`/ui/pages/${page.file}`)
        if (!response.ok) throw new Error('Page not found')
        const html = await response.text()
        contentDiv.innerHTML = html
        currentPage = pageId
        if (page.init && typeof page.init === 'function') {
            await page.init()
        }
    } catch (err) {
        contentDiv.innerHTML = `<div class="placeholder-text">Error loading page: ${err.message}</div>`
    }
}

function toggleSettingsSubNav() {
    const subNav = document.getElementById('settingsSubNav')
    const settingsItem = document.querySelector('.nav-item[data-page="settings"]')
    if (!subNav || !settingsItem) return

    if (subNav.style.display === 'block') {
        subNav.style.display = 'none'
        settingsItem.setAttribute('aria-expanded', 'false')
    } else {
        // Close system sub‑nav if open
        const systemSub = document.getElementById('systemSubNav')
        const systemItem = document.querySelector('.nav-item[data-page="system"]')
        if (systemSub && systemSub.style.display === 'block') {
            systemSub.style.display = 'none'
            if (systemItem) systemItem.setAttribute('aria-expanded', 'false')
        }
        subNav.style.display = 'block'
        settingsItem.setAttribute('aria-expanded', 'true')
    }
}

function toggleSystemSubNav() {
    const subNav = document.getElementById('systemSubNav')
    const systemItem = document.querySelector('.nav-item[data-page="system"]')
    if (!subNav || !systemItem) return

    if (subNav.style.display === 'block') {
        subNav.style.display = 'none'
        systemItem.setAttribute('aria-expanded', 'false')
    } else {
        // Close settings sub‑nav if open
        const settingsSub = document.getElementById('settingsSubNav')
        const settingsItem = document.querySelector('.nav-item[data-page="settings"]')
        if (settingsSub && settingsSub.style.display === 'block') {
            settingsSub.style.display = 'none'
            if (settingsItem) settingsItem.setAttribute('aria-expanded', 'false')
        }
        subNav.style.display = 'block'
        systemItem.setAttribute('aria-expanded', 'true')
    }
}

document.querySelectorAll('.nav-item:not(.sub-item)').forEach((item) => {
    item.addEventListener('click', () => {
        const pageId = item.getAttribute('data-page')
        if (pageId === 'settings') {
            toggleSettingsSubNav()
            if (currentPage !== 'settings') loadPage('settings')
        } else if (pageId === 'system') {
            toggleSystemSubNav()
            if (currentPage !== 'system') loadPage('system')
        } else {
            // Hide settings sub‑nav when navigating away
            const settingsSub = document.getElementById('settingsSubNav')
            const systemSub = document.getElementById('systemSubNav')
            if (settingsSub) {
                settingsSub.style.display = 'none'
                document
                    .querySelector('.nav-item[data-page="settings"]')
                    ?.setAttribute('aria-expanded', 'false')
            }
            if (systemSub) {
                systemSub.style.display = 'none'
                document
                    .querySelector('.nav-item[data-page="system"]')
                    ?.setAttribute('aria-expanded', 'false')
            }
            loadPage(pageId)
        }
    })

    item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            item.click()
        }
    })
})

async function showOnboardingModal() {
    const bodyHtml = `
        <p>An API key is required to authenticate webhooks from Sonarr, Radarr, and Lidarr.</p>
        <p>Click below to generate a secure random key.</p>
        <p class="input-note">You can generate a new key at any time from Settings → General.</p>
    `

    openModal({
        title: 'Set Up API Key',
        bodyHtml,
        rightButtons: [
            { text: 'Cancel', class: 'secondary-btn' },
            {
                text: 'Generate API Key',
                class: 'primary-btn',
                onClick: async () => {
                    try {
                        const resp = await fetch('/api/v1/webhook_key/generate', {
                            method: 'POST',
                        })
                        if (!resp.ok) throw new Error('Failed to generate key')
                        const data = await resp.json()

                        // Store the key
                        localStorage.setItem('endarr_api_key', data.webhook_key)
                        apiKey = data.webhook_key

                        // Show success modal with key and copy button
                        const successHtml = `
                            <p>Your new API key:</p>
                            <div style="display: flex; gap: 8px; margin: 16px 0;">
                                <input type="text" id="newApiKeyDisplay" value="${data.webhook_key}" readonly style="flex:1; font-family:monospace;">
                                <button class="icon-btn-feedback" id="copyNewApiKeyBtn" title="Copy to clipboard">
                                    <span class="btn-icon-wrapper">
                                        <i class="far fa-copy"></i>
                                        <i class="fas fa-check"></i>
                                    </span>
                                </button>
                            </div>
                            <p>Use this key in your *Arr webhook URL:<br>
                            <code>http://endarr:7070/arr?apikey=${data.webhook_key}</code></p>
                        `

                        openModal({
                            title: 'API Key Generated',
                            bodyHtml: successHtml,
                            rightButtons: [{ text: 'Done', class: 'primary-btn' }],
                            onClose: () => {
                                // Reload the page to refresh the dashboard with the new key
                                window.location.reload()
                            },
                        })

                        // Attach copy functionality
                        setTimeout(() => {
                            const copyBtn = document.getElementById('copyNewApiKeyBtn')
                            const displayInput = document.getElementById('newApiKeyDisplay')
                            if (copyBtn) {
                                copyBtn.addEventListener('click', () => {
                                    navigator.clipboard.writeText(displayInput.value)
                                    showIconFeedback(copyBtn, 'success')
                                })
                            }
                        }, 50)
                    } catch (err) {
                        openModal({
                            title: 'Error',
                            bodyHtml: `<p style="color:var(--danger-color);">${err.message}</p>`,
                            rightButtons: [{ text: 'OK', class: 'primary-btn' }],
                        })
                    }
                },
            },
        ],
    })
}

const MAX_TOASTS = 3
const toastContainer = document.createElement('div')
toastContainer.className = 'toast-container'
document.body.appendChild(toastContainer)

function showToast(message, type = 'success', duration = null) {
    // Get configured duration
    const configDuration = window.uiPreferences?.toast_duration_seconds || 5
    const finalDuration = duration !== null ? duration : configDuration * 1000

    // Remove duplicate messages that are already visible (simple consolidation)
    const existingToasts = toastContainer.querySelectorAll('.toast')
    for (const toast of existingToasts) {
        if (toast.dataset.message === message && toast.dataset.type === type) {
            return // suppress duplicate
        }
    }

    // Create new toast
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.dataset.message = message
    toast.dataset.type = type
    const icon =
        type === 'success'
            ? 'fa-check-circle'
            : type === 'error'
              ? 'fa-exclamation-circle'
              : 'fa-info-circle'
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span><button class="toast-close" aria-label="Dismiss">&times;</button>`

    // Add to container
    toastContainer.appendChild(toast)

    // Enforce max toasts
    while (toastContainer.children.length > MAX_TOASTS) {
        toastContainer.removeChild(toastContainer.firstChild)
    }

    // Dismiss on close button click
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove()
    })

    // Auto-dismiss
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove()
        }
    }, finalDuration)
}

// Button feedback utilities
function showButtonFeedback(button, state, options = {}) {
    const { duration = 2000, successText = null, errorText = null, originalText = null } = options

    button.classList.remove('success', 'error')
    button.classList.add(state)

    // Handle text change for slide buttons
    const textSpan = button.querySelector('.btn-text')
    if (textSpan) {
        if (state === 'success' && successText) {
            textSpan.textContent = successText
        } else if (state === 'error' && errorText) {
            textSpan.textContent = errorText
        }
    }

    setTimeout(() => {
        button.classList.remove('success', 'error')
        if (textSpan && originalText) {
            textSpan.textContent = originalText
        }
    }, duration)
}

function showIconFeedback(button, state, duration = 2000) {
    button.classList.remove('success', 'error')
    button.classList.add(state)
    setTimeout(() => {
        button.classList.remove('success', 'error')
    }, duration)
}

// ========== Connection Monitoring (Client Disconnect Toasts) ==========
const CONNECTION_CHECK_INTERVAL = 30000 // 30 seconds
let lastConnectionStates = {
    downloadClients: {},
    arrClients: {},
}
let connectionCheckIntervalId = null
let hasShownFetchError = false

async function checkConnectionStatus() {
    const key = getApiKey()
    if (!key) return // No key, skip monitoring

    try {
        const resp = await fetch('/api/v1/status', { headers: { 'X-Api-Key': key } })
        if (!resp.ok) {
            // Treat non-2xx as fetch error (e.g., 401 if key invalid)
            throw new Error(`HTTP ${resp.status}`)
        }
        const status = await resp.json()
        hasShownFetchError = false // Reset error flag on success

        const downloadClients = status.download_clients || []
        const arrClients = status.arr_clients || []

        // Process download clients
        for (const client of downloadClients) {
            const name = client.name
            const connected = client.connected
            const previous = lastConnectionStates.downloadClients[name]

            if (previous !== undefined && previous !== connected) {
                const message = connected
                    ? `Download client "${name}" reconnected`
                    : `Download client "${name}" disconnected`
                const type = connected ? 'success' : 'error'
                showToast(message, type)
            }
            lastConnectionStates.downloadClients[name] = connected
        }

        // Process ARR clients
        for (const client of arrClients) {
            const name = client.name
            const connected = client.connected
            const previous = lastConnectionStates.arrClients[name]

            if (previous !== undefined && previous !== connected) {
                const message = connected
                    ? `ARR client "${name}" reconnected`
                    : `ARR client "${name}" disconnected`
                const type = connected ? 'success' : 'error'
                showToast(message, type)
            }
            lastConnectionStates.arrClients[name] = connected
        }

        // Optionally prune removed clients from stored states (not strictly necessary)
    } catch (err) {
        console.error('Connection status check failed:', err)
        if (!hasShownFetchError) {
            showToast('Unable to fetch connection status', 'error')
            hasShownFetchError = true
        }
    }
}

function startConnectionMonitoring() {
    // Stop any existing interval
    if (connectionCheckIntervalId) {
        clearInterval(connectionCheckIntervalId)
    }
    // Initial fetch to populate states without showing toasts
    checkConnectionStatus().then(() => {
        // Start periodic checks
        connectionCheckIntervalId = setInterval(checkConnectionStatus, CONNECTION_CHECK_INTERVAL)
    })
}

function stopConnectionMonitoring() {
    if (connectionCheckIntervalId) {
        clearInterval(connectionCheckIntervalId)
        connectionCheckIntervalId = null
    }
}

// ============================================================
// Global initialization after DOM is ready
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme toggle
    initThemeToggle()

    // 2. Connection monitoring (start after a short delay to allow API key retrieval)
    setTimeout(() => {
        if (getApiKey()) {
            startConnectionMonitoring()
        }
    }, 500)

    // 3. Settings sub‑navigation delegation
    const settingsSubNav = document.getElementById('settingsSubNav')
    if (settingsSubNav) {
        settingsSubNav.addEventListener('click', (e) => {
            const subItem = e.target.closest('.sub-item')
            if (!subItem) return
            const page = subItem.getAttribute('data-settings-page')
            if (page && typeof window.loadSettingsSubpage === 'function') {
                window.loadSettingsSubpage(page)
            }
        })

        settingsSubNav.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const subItem = e.target.closest('.sub-item')
                if (subItem) {
                    e.preventDefault()
                    subItem.click()
                }
            }
        })
    }

    // 4. System sub‑navigation delegation
    const systemSubNav = document.getElementById('systemSubNav')
    if (systemSubNav) {
        systemSubNav.addEventListener('click', (e) => {
            const subItem = e.target.closest('.sub-item')
            if (!subItem) return
            const page = subItem.getAttribute('data-system-page')
            if (page && typeof window.loadSystemSubpage === 'function') {
                window.loadSystemSubpage(page)
            }
        })

        systemSubNav.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const subItem = e.target.closest('.sub-item')
                if (subItem) {
                    e.preventDefault()
                    subItem.click()
                }
            }
        })
    }

    // 5. Top‑bar system menu
    const menuBtn = document.getElementById('menuBtn')
    const menuDropdown = document.getElementById('menuDropdown')
    const restartBtn = document.getElementById('restartBtn')
    const shutdownBtn = document.getElementById('shutdownBtn')

    // Fetch Docker status and show/hide shutdown
    ;(async () => {
        try {
            const key = getApiKey()
            if (!key) return
            const resp = await fetch('/api/v1/system/environment', {
                headers: { 'X-Api-Key': key },
            })
            if (resp.ok) {
                const data = await resp.json()
                if (!data.is_docker && shutdownBtn) {
                    shutdownBtn.style.display = 'block'
                }
            }
        } catch (e) {
            /* ignore */
        }
    })()

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            const expanded = menuBtn.getAttribute('aria-expanded') === 'true'
            menuDropdown.style.display = expanded ? 'none' : 'block'
            menuBtn.setAttribute('aria-expanded', !expanded)
        })

        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.style.display = 'none'
                menuBtn.setAttribute('aria-expanded', 'false')
            }
        })

        // Keyboard support
        menuDropdown.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                menuDropdown.style.display = 'none'
                menuBtn.setAttribute('aria-expanded', 'false')
                menuBtn.focus()
            }
        })

        // Restart
        restartBtn?.addEventListener('click', async () => {
            if (await confirmAction('config', 'Restart Endarr?')) {
                try {
                    await fetch('/api/v1/system/restart', {
                        method: 'POST',
                        headers: { 'X-Api-Key': getApiKey() },
                    })
                    showToast('Restarting…', 'success')
                } catch (err) {
                    showToast('Failed to restart', 'error')
                }
            }
            menuDropdown.style.display = 'none'
            menuBtn.setAttribute('aria-expanded', 'false')
        })

        // Shutdown
        shutdownBtn?.addEventListener('click', async () => {
            if (await confirmAction('config', 'Shutdown Endarr?')) {
                try {
                    const resp = await fetch('/api/v1/system/shutdown', {
                        method: 'POST',
                        headers: { 'X-Api-Key': getApiKey() },
                    })
                    if (resp.ok) {
                        showToast('Shutting down…', 'success')
                    } else {
                        const err = await resp.json()
                        showToast(err.error || 'Shutdown failed', 'error')
                    }
                } catch (err) {
                    showToast('Failed to shutdown', 'error')
                }
            }
            menuDropdown.style.display = 'none'
            menuBtn.setAttribute('aria-expanded', 'false')
        })
    }
})

// Optionally clean up on page unload (not strictly required)
window.addEventListener('beforeunload', stopConnectionMonitoring)

// Load initial page
loadPage('dashboard')
