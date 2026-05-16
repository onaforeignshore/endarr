// ui/js/history.js
import { getStatusChip, getArrChipClass } from './chipStyles.js'
import { DataTable } from './DataTable.js'
import { escapeHtml, formatDate, formatBytes, consoleDebug } from './utils.js'

/**
 * Initialise the History page with a DataTable.
 */
export function initHistoryPage() {
    consoleDebug('[History] Initialising')

    new DataTable({
        containerId: 'historyTableContainer',
        apiPath: '/api/v1/history',
        defaultSort: { field: 'timestamp', order: 'desc' },
        defaultFilters: {},
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
                    return `<i class="fas ${icons[v] || 'fa-question'}" title="${v}" aria-label="${v}"></i>`
                },
            },
            {
                key: 'title',
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
                chip: true,
                chipClass: (v) => getArrChipClass(v),
                sortable: true,
            },
            {
                key: 'size',
                header: 'Size',
                visible: true,
                sortable: true,
                render: formatBytes,
            },
            {
                key: 'status',
                header: 'Status',
                visible: true,
                sortable: false,
                chip: true,
                chipClass: (_, row) => getStatusChip(row.type, row.reason).chipClass,
                render: (_, row) => getStatusChip(row.type, row.reason).label,
            },
            {
                key: 'timestamp',
                header: 'Date',
                visible: true,
                sortable: true,
                render: formatDate,
            },
        ],
        pageSizeKey: 'endarr_history_pageSize',
        urlSync: true,
        detailModal: {
            title: 'Event Details',
            fields: [
                { key: 'title', label: 'Release Title' },
                { key: 'type', label: 'Event Type' },
                { key: 'arr_name', label: 'ARR' },
                { key: 'size', label: 'Size', render: formatBytes },
                { key: 'media_type', label: 'Media Type' },
                { key: 'media_id', label: 'Media ID' },
                { key: 'hash', label: 'Hash' },
                { key: 'reason', label: 'Delete Reason' },
                { key: 'timestamp', label: 'Date', render: formatDate },
            ],
        },
    }).init()
}