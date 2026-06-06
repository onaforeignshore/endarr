// ui/js/dashboard.js
import { getStatusChip } from './chipStyles.js'
import { DataTable } from './DataTable.js'
import { escapeHtml, formatDate, getApiKey, consoleDebug } from './utils.js'

/**
 * Initialise the Dashboard page: load stats, system status, and activity feed.
 * @returns {Promise<void>}
 */
export async function initDashboard() {
    consoleDebug('[Dashboard] Initialising')

    const healthSpan = document.getElementById('healthStatus')
    const sysList = document.getElementById('systemStatusList')
    const activeSpan = document.getElementById('activeTorrents')
    const grabsSpan = document.getElementById('grabs24h')
    const deletionsSpan = document.getElementById('deletions24h')

    if (!healthSpan || !sysList || !activeSpan || !grabsSpan || !deletionsSpan) {
        console.error('Dashboard elements missing')
        return
    }

    const key = getApiKey()
    const banner = document.getElementById('onboardingBanner')

    if (!key) {
        if (banner) {
            banner.style.display = 'flex'
            document.getElementById('setupApiKeyBtn')?.addEventListener('click', () => {
                import('./app.js').then((m) => m.showOnboardingModal?.())
            })
            document.getElementById('dismissBannerBtn')?.addEventListener('click', () => {
                banner.style.display = 'none'
            })
        }
        healthSpan.innerText = 'No API Key'
        sysList.innerHTML = '<div class="status-item">API key required for webhooks</div>'
        activeSpan.innerText = '—'
        grabsSpan.innerText = '—'
        deletionsSpan.innerText = '—'
        const dbInfoCard = document.getElementById('dbInfoCard')
        if (dbInfoCard) dbInfoCard.innerHTML = '<div class="status-item">API key required</div>'
        return
    }

    try {
        const statusRes = await fetch('/api/v1/status', { headers: { 'X-Api-Key': key } })
        if (!statusRes.ok) throw new Error('Failed to fetch status')
        const status = await statusRes.json()

        const allConnected =
            (status.download_clients || []).every((c) => c.connected) &&
            (status.arr_clients || []).every((c) => c.connected)
        healthSpan.innerText = allConnected ? 'All OK' : 'Issues'

        let sysHtml = '<div class="system-status-columns">'

        sysHtml += '<div class="status-column"><div class="column-heading">Download Clients</div>'
        const dlClients = status.download_clients || []
        if (dlClients.length) {
            sysHtml +=
                '<div class="status-column"><div class="column-heading">Watchdog</div><div class="chip-container">'
            dlClients.forEach((c) => {
                const cls = c.watchdog_running ? 'status-chip' : 'status-chip disconnected'
                sysHtml += `<span class="${cls}" title="${c.watchdog_running ? 'Running' : 'Stopped'}">${escapeHtml(c.name)}</span>`
            })
            sysHtml += '</div></div></div>'
        } else {
            sysHtml += '<div class="status-text">None</div>'
        }
        sysHtml += '</div>'

        sysHtml += '<div class="status-column"><div class="column-heading">ARR Clients</div>'
        const arrClients = status.arr_clients || []
        if (arrClients.length) {
            sysHtml += '<div class="chip-container">'
            arrClients.forEach((c) => {
                const cls = c.connected ? 'status-chip' : 'status-chip disconnected'
                sysHtml += `<span class="${cls}" title="${c.connected ? 'Connected' : 'Disconnected'}">${escapeHtml(c.name)}</span>`
            })
            sysHtml += '</div>'
        } else {
            sysHtml += '<div class="status-text">None</div>'
        }
        sysHtml += '</div>'

        sysHtml +=
            '<div class="status-column"><div class="column-heading">Watchdog</div><div class="chip-container">'
        const anyRunning = dlClients.some((c) => c.watchdog_running)
        sysHtml += `<span class="status-chip${anyRunning ? '' : ' disconnected'}" title="${anyRunning ? 'Running' : 'Stopped'}">${anyRunning ? 'Running' : 'Stopped'}</span>`
        sysHtml += '</div></div></div>'
        sysList.innerHTML = sysHtml

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

        // Configuration issues banner
        const issuesResp = await fetch('/api/v1/config/issues', { headers: { 'X-Api-Key': key } })
        if (issuesResp.ok) {
            const issuesData = await issuesResp.json()
            if (issuesData.issues.length > 0) {
                const banner = document.createElement('div')
                banner.className = 'onboarding-banner'
                banner.style.background = 'var(--warning-color)'
                banner.innerHTML = `
                    <div class="banner-content">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${issuesData.issues.length} configuration issue${issuesData.issues.length > 1 ? 's' : ''} detected. Invalid values have been replaced with defaults.</span>
                    </div>
                    <div class="banner-actions">
                        <button class="primary-btn" id="viewConfigIssuesBtn">View Issues</button>
                    </div>`
                const content = document.getElementById('pageContent')
                content.insertBefore(banner, content.firstChild)
                document.getElementById('viewConfigIssuesBtn').addEventListener('click', () => {
                    window.toggleSubNav?.('settings')
                    window.loadSubpage?.('settings', 'general')
                })
            }
        }

        // Database info
        const dbRes = await fetch('/api/v1/db_info', { headers: { 'X-Api-Key': key } })
        const dbInfoCard = document.getElementById('dbInfoCard')
        if (dbRes.ok) {
            const dbInfo = await dbRes.json()
            dbInfoCard.innerHTML = `
                <div class="status-item"><span>Database Size</span><span class="status-value">${dbInfo.size_mb} MB</span></div>
                <div class="status-item"><span>Grabs</span><span class="status-value">${dbInfo.grabs_count}</span></div>
                <div class="status-item"><span>Downloads</span><span class="status-value">${dbInfo.downloads_count}</span></div>
                <div class="status-item"><span>Blacklist</span><span class="status-value">${dbInfo.blacklist_count}</span></div>`
        } else {
            dbInfoCard.innerHTML = '<div class="status-item">Unable to load database info</div>'
        }

        // Activity feed as DataTable
        const dt = new DataTable({
            containerId: 'dashboardActivityTable',
            apiPath: '/api/v1/activity',
            defaultFilters: {},
            filterButton: '#activityFilterBtn',
            filterConfig: {
                type: 'eventType',
                paramName: 'eventType',
                label: 'Event Type',
                options: [
                    { value: 'grab', label: 'Grabs' },
                    { value: 'import', label: 'Imports' },
                    { value: 'deletion', label: 'Deletions' },
                    { value: 'upgrade', label: 'Upgrades' },
                    { value: 'stall', label: 'Stall Strikes' },
                    { value: 'blacklist', label: 'Blacklist Additions' },
                    { value: 'malicious', label: 'Malicious File Detections' },
                ],
            },
            urlSync: false,
            showColumns: false,
            showPagination: false,
            showRefresh: false,
            showToolbar: true,
            toolbarClass: 'dashboard-toolbar',
            toolbarHeader: '<h3>Recent Activity</h3>',
            columns: [
                {
                    key: 'type',
                    header: '',
                    visible: true,
                    required: true,
                    sortable: false,
                    width: '30px',
                    html: true,
                    render: (v) => {
                        const icons = {
                            grab: 'fa-hand-paper',
                            import: 'fa-download',
                            deletion: 'fa-trash-alt',
                            upgrade: 'fa-arrow-up',
                            stall: 'fa-exclamation-triangle',
                            blacklist: 'fa-ban',
                            malicious: 'fa-skull',
                        }
                        const titles = {
                            grab: 'Grabbed',
                            import: 'Imported',
                            deletion: 'Deleted',
                            upgrade: 'Upgraded',
                            stall: 'Stall Strike',
                            blacklist: 'Blacklisted',
                            malicious: 'Malicious File',
                        }
                        const icon = icons[v] || 'fa-question'
                        const title = titles[v] || v
                        return `<i class="fas ${icon}" title="${title}" aria-label="${title}"></i>`
                    },
                },
                {
                    key: 'title',
                    header: 'Release Title',
                    visible: true,
                    required: true,
                    sortable: false,
                    render: escapeHtml,
                },
                {
                    key: 'status',
                    header: '',
                    visible: true,
                    required: true,
                    sortable: false,
                    html: true,
                    chip: true,
                    chipClass: (_, row) => getStatusChip(row.type, row.reason).chipClass,
                    render: (_, row) => getStatusChip(row.type, row.reason).label,
                },
                {
                    key: 'timestamp',
                    header: 'Date',
                    visible: true,
                    sortable: false,
                    render: formatDate,
                },
            ],
            pageSizeKey: 'endarr_dashboard_pageSize',
        })
        dt.init()
    } catch (err) {
        console.error('Dashboard error:', err)
        healthSpan.innerText = 'Error'
        sysList.innerHTML = `<div class="status-item">Error: ${err.message}</div>`
        activeSpan.innerText = '?'
        grabsSpan.innerText = '?'
        deletionsSpan.innerText = '?'
    }
}
