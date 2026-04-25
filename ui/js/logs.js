// ui/js/logs.js
import { escapeHtml, formatBytes, formatDate } from './utils.js'

export async function initLogsPage() {
    console.log('Initialising Logs page')

    const tbody = document.getElementById('logsTableBody')
    const refreshBtn = document.getElementById('refreshLogsBtn')
    const clearBtn = document.getElementById('clearLogsBtn')

    async function loadLogs() {
        const key = localStorage.getItem('endarr_api_key')
        if (!key) {
            tbody.innerHTML = '<tr><td colspan="4">No API key</td></tr>'
            return
        }

        try {
            const resp = await fetch('/api/v1/logs', { headers: { 'X-Api-Key': key } })
            if (!resp.ok) throw new Error('Failed to fetch log list')
            const data = await resp.json()

            if (!data.files || data.files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">No log files found</td></tr>'
                return
            }

            tbody.innerHTML = data.files
                .map(
                    (file) => `
                <tr role="row">
                    <td role="cell">${escapeHtml(file.name)}</td>
                    <td role="cell">${formatBytes(file.size)}</td>
                    <td role="cell">${formatDate(file.last_modified)}</td>
                    <td role="cell">
                        <a href="/api/v1/logs/download?file=${encodeURIComponent(file.name)}&apikey=${encodeURIComponent(key)}" class="action-btn" title="Download log file" download>
                            <i class="fas fa-download" aria-hidden="true"></i> Download
                        </a>
                    </td>
                </tr>
            `
                )
                .join('')
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`
        }
    }

    refreshBtn?.addEventListener('click', loadLogs)

    clearBtn?.addEventListener('click', async () => {
        const key = localStorage.getItem('endarr_api_key')
        if (!key) return
        if (!(await confirmAction('config', 'Clear all log files?'))) return
        try {
            const resp = await fetch('/api/v1/logs', {
                method: 'DELETE',
                headers: { 'X-Api-Key': key },
            })
            if (!resp.ok) throw new Error('Failed to clear logs')
            showToast('Logs cleared', 'success')
            await loadLogs()
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error')
        }
    })

    await loadLogs()
}
