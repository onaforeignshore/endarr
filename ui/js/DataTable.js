// ui/js/DataTable.js
import { openModal } from './modal.js'
import { getApiKey, escapeHtml, getFiltersFromUrl, updateUrlFilters } from './utils.js'

/**
 * Generic DataTable component with sorting, filtering, pagination and column toggles.
 * @class
 */
export class DataTable {
    /**
     * @param {Object} opts - Configuration options.
     * @param {string} opts.containerId - ID of the container element.
     * @param {string} opts.apiPath - API endpoint for fetching data.
     * @param {Object} [opts.defaultFilters] - Default filter values.
     * @param {Object} [opts.filterConfig] - Filter configuration (type, options).
     * @param {Object} [opts.addButton] - Add button config { text, onClick }.
     * @param {Array} opts.columns - Column definitions.
     * @param {string} opts.pageSizeKey - localStorage key for page size.
     * @param {Object} [opts.defaultSort] - Default sort { field, order }.
     * @param {boolean} [opts.urlSync] - Whether to sync filters with URL.
     * @param {Object} [opts.detailModal] - Detail modal config { title, fields }.
     * @param {string|HTMLElement} [opts.filterButton] - External filter button selector.
     * @param {string} [opts.toolbarHeader] - HTML for toolbar header (optional).
     * @param {boolean} [opts.showToolbar=true] - Show toolbar.
     * @param {boolean} [opts.showPagination=true] - Show pagination.
     * @param {boolean} [opts.showRefresh=true] - Show refresh button.
     * @param {boolean} [opts.showColumns=true] - Show column picker.
     */
    constructor(opts) {
        this.containerId = opts.containerId
        this.apiPath = opts.apiPath
        this.defaultFilters = opts.defaultFilters || {}
        this.filterConfig = opts.filterConfig || null
        this.addButton = opts.addButton || null
        this.columns = opts.columns
        this.pageSizeKey = opts.pageSizeKey
        this.defaultSort = opts.defaultSort || null
        this.urlSync = opts.urlSync || false
        this.detailModal = opts.detailModal || null
        this.filterButton = opts.filterButton || null // CSS selector or element
        this.toolbarHeader = opts.toolbarHeader || ''

        // Optional visibility flags (default true)
        this.showToolbar = opts.showToolbar !== undefined ? opts.showToolbar : true
        this.showPagination = opts.showPagination !== undefined ? opts.showPagination : true
        this.showRefresh = opts.showRefresh !== undefined ? opts.showRefresh : true
        this.showColumns = opts.showColumns !== undefined ? opts.showColumns : true

        this.state = {
            rows: [],
            totalItems: 0,
            currentPage: 0,
            pageSize: this._loadPageSize(),
            filters: { ...this.defaultFilters },
            sortField: null,
            sortOrder: null,
            loading: false,
        }

        if (this.defaultSort) {
            this.state.sortField = this.defaultSort.field
            this.state.sortOrder = this.defaultSort.order
        }

        this.elements = {}

        this._openDropdown = null
    }

    init() {
        this.state.currentPage = 0
        this.state.sortField = null
        this.state.sortOrder = null

        this._createDOM()
        if (this.urlSync) {
            const urlFilters = getFiltersFromUrl()
            if (urlFilters.pageSize) this.state.pageSize = parseInt(urlFilters.pageSize, 10)
            if (urlFilters.sort_by) this.state.sortField = urlFilters.sort_by
            if (urlFilters.sort_order) this.state.sortOrder = urlFilters.sort_order
            if (urlFilters.page) this.state.currentPage = parseInt(urlFilters.page, 10) || 0
            Object.keys(this.defaultFilters).forEach((k) => {
                if (urlFilters[k] !== undefined) this.state.filters[k] = urlFilters[k]
            })
        }
        this.state.currentPage = 0
        this.fetch()
    }

    _createDOM() {
        const container = document.getElementById(this.containerId)
        if (!container) throw new Error(`Container #${this.containerId} not found`)

        // ── Toolbar (optional) ──
        if (this.showToolbar) {
            const toolbar = document.createElement('div')
            toolbar.className = 'datatable-toolbar'
            const showFilter = !!this.filterConfig
            const addBtnHtml = this.addButton
                ? `<button class="toolbar-btn add-btn"><i class="fas fa-plus"></i> ${escapeHtml(this.addButton.text)}</button>`
                : ''
            const filterBtnHtml = showFilter
                ? `<button class="toolbar-btn filter-btn"><i class="fas fa-filter"></i> Filter</button>`
                : ''
            const columnsBtnHtml = this.showColumns
                ? `<button class="toolbar-btn columns-btn"><i class="fas fa-table"></i> Options</button>`
                : ''

            let leftHtml = this.showRefresh
                ? `<button class="toolbar-btn refresh-btn"><i class="fas fa-arrows-rotate"></i> Refresh</button>`
                : ''
            if (this.addButton) {
                leftHtml += `<div class="toolbar-separator"></div>${addBtnHtml}`
            }

            toolbar.innerHTML =
                this.toolbarHeader +
                `
                    <div class="toolbar-left">${leftHtml}</div>
                    <div class="toolbar-right">
                        ${filterBtnHtml}
                        ${columnsBtnHtml}
                    </div>
                `
            container.appendChild(toolbar)

            this.elements.toolbar = toolbar
            this.elements.filterBtn = toolbar.querySelector('.filter-btn')
            this.elements.columnsBtn = toolbar.querySelector('.columns-btn')
            if (this.showRefresh) {
                this.elements.refreshBtn = toolbar.querySelector('.refresh-btn')
            }
        }

        // ── Table ──
        const tableScrollable = document.createElement('div')
        tableScrollable.className = 'table-scrollable'
        tableScrollable.innerHTML = `
      <table class="data-table" role="table">
        <thead></thead>
        <tbody></tbody>
      </table>
    `
        container.appendChild(tableScrollable)
        this.elements.thead = tableScrollable.querySelector('thead')
        this.elements.tbody = tableScrollable.querySelector('tbody')

        // If a custom filter button was supplied but no toolbar, wire it now
        if (!this.showToolbar && this.filterButton && this.filterConfig) {
            const btn =
                typeof this.filterButton === 'string'
                    ? document.querySelector(this.filterButton)
                    : this.filterButton
            this.elements.filterBtn = btn
        }

        // ── Pagination (optional) ──
        if (this.showPagination) {
            const pagination = document.createElement('div')
            pagination.className = 'pagination'
            pagination.innerHTML = `
          <button class="pagination-btn first-page-btn" title="First page"><i class="fas fa-backward-fast"></i></button>
          <button class="pagination-btn prev-page-btn" title="Previous page"><i class="fas fa-backward"></i></button>
          <span class="page-select-wrapper">
            <button class="pagination-page-btn page-number">1 / 1</button>
          </span>
          <button class="pagination-btn next-page-btn" title="Next page"><i class="fas fa-forward"></i></button>
          <button class="pagination-btn last-page-btn" title="Last page"><i class="fas fa-backward-fast fa-rotate-180"></i></button>
          <span class="total-records">Total records: 0</span>
        `
            container.appendChild(pagination)
            this.elements.firstBtn = pagination.querySelector('.first-page-btn')
            this.elements.prevBtn = pagination.querySelector('.prev-page-btn')
            this.elements.nextBtn = pagination.querySelector('.next-page-btn')
            this.elements.lastBtn = pagination.querySelector('.last-page-btn')
            this.elements.pageNumberBtn = pagination.querySelector('.page-number')
            this.elements.pageSelectWrapper = pagination.querySelector('.page-select-wrapper')
            this.elements.totalRecords = pagination.querySelector('.total-records')
        }

        // Init optional components (only if toolbar exists)
        if (this.showToolbar) {
            if (this.showColumns) this._initColumnPicker()
        }
        if (this.filterConfig) {
            this._initFilterDropdown()
        }

        this._bindEvents()
    }

    _bindEvents() {
        // Refresh
        this.elements.refreshBtn?.addEventListener('click', () => this.fetch())

        // Pagination
        this.elements.firstBtn?.addEventListener('click', () => this.goToPage(0))
        this.elements.prevBtn?.addEventListener('click', () =>
            this.goToPage(this.state.currentPage - 1)
        )
        this.elements.nextBtn?.addEventListener('click', () =>
            this.goToPage(this.state.currentPage + 1)
        )
        this.elements.lastBtn?.addEventListener('click', () =>
            this.goToPage(Math.ceil(this.state.totalItems / this.state.pageSize) - 1)
        )
        this.elements.pageNumberBtn?.addEventListener('click', () => this._showPageSelect())

        // Sort delegation
        this.elements.thead.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable')
            if (th) {
                const field = th.dataset.key
                this._onSortClick(field)
            }
        })

        // Detail modal
        if (this.detailModal) {
            this.elements.tbody.addEventListener('click', (e) => {
                const row = e.target.closest('tr[data-index]')
                if (!row) return
                if (e.target.closest('button, a')) return
                const index = parseInt(row.dataset.index, 10)
                if (!isNaN(index) && this.state.rows[index]) {
                    this._openDetailModal(this.state.rows[index])
                }
            })
        }

        // Add‑button callback
        if (this.addButton && this.addButton.onClick) {
            const btn = this.elements.container?.querySelector('.add-btn')
            if (btn) {
                btn.addEventListener('click', () => this.addButton.onClick())
            }
        }
    }

    _showPageSelect() {
        const totalPages = Math.ceil(this.state.totalItems / this.state.pageSize) || 1
        const current = this.state.currentPage + 1

        this.elements.pageNumberBtn.style.display = 'none'

        const select = document.createElement('select')
        for (let i = 1; i <= totalPages; i++) {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = i
            if (i === current) opt.selected = true
            select.appendChild(opt)
        }

        select.addEventListener('change', () => {
            this.goToPage(parseInt(select.value, 10) - 1)
            this._hidePageSelect(select)
        })

        select.addEventListener('blur', () => {
            this._hidePageSelect(select)
        })

        this.elements.pageSelectWrapper.appendChild(select)
        select.focus()
    }

    _hidePageSelect(select) {
        if (select && select.parentNode) {
            select.parentNode.removeChild(select)
        }
        this.elements.pageNumberBtn.style.display = ''
    }

    _toggleDropdown(dropdown, btn) {
        if (this._openDropdown && this._openDropdown !== dropdown) {
            this._openDropdown.style.display = 'none'
            const prevBtn = this._openDropdown._btn
            if (prevBtn) prevBtn.setAttribute('aria-expanded', 'false')
        }
        const isVisible = dropdown.style.display === 'block'
        dropdown.style.display = isVisible ? 'none' : 'block'
        btn.setAttribute('aria-expanded', !isVisible)
        this._openDropdown = isVisible ? null : dropdown
        dropdown._btn = btn
    }

    _closeDropdown(dropdown, btn) {
        dropdown.style.display = 'none'
        btn.setAttribute('aria-expanded', 'false')
        if (this._openDropdown === dropdown) {
            this._openDropdown = null
        }
    }

    _initColumnPicker() {
        const btn = this.elements.columnsBtn
        if (!btn) return

        this._loadColumnVisibility()

        const dropdown = document.createElement('div')
        dropdown.className = 'filter-dropdown'
        dropdown.style.display = 'none'
        dropdown.setAttribute('role', 'menu')
        dropdown.innerHTML = `
            <div class="filter-dropdown-header">Columns</div>
            ${this.columns
                .filter((col) => !col.required)
                .map(
                    (col) => `
                <label class="filter-checkbox" role="menuitemcheckbox">
                    <input type="checkbox" value="${col.key}" ${col.visible !== false ? 'checked' : ''}>
                    <i class="fas fa-check"></i>
                    <span>${escapeHtml(col.header || col.key)}</span>
                </label>
            `
                )
                .join('')}
            <div style="padding: 8px 12px; border-top: 1px solid var(--border-color);">
                <label class="filter-checkbox" style="justify-content: space-between;">
                    <span>Page size</span>
                    <input type="number" class="page-size-input" min="5" max="250" step="1" value="${this.state.pageSize}" style="width: 70px;">
                </label>
            </div>
            <div style="padding: 8px 12px; border-top: 1px solid var(--border-color);">
                <button class="secondary-btn" style="width:100%;" id="${this.containerId}-restore-columns">Restore Defaults</button>
            </div>
        `
        btn.parentNode.appendChild(dropdown)
        this.elements._columnDropdown = dropdown

        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this._toggleDropdown(dropdown, btn)
        })

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                this._closeDropdown(dropdown, btn)
            }
        })

        dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const col = this.columns.find((c) => c.key === cb.value)
                if (col && !col.required) {
                    col.visible = cb.checked
                }
                this._saveColumnVisibility()
                this._render()
            })
        })

        dropdown
            .querySelector(`#${this.containerId}-restore-columns`)
            .addEventListener('click', () => {
                this.columns.forEach((col) => {
                    if (!col.required)
                        col.visible = col.defaultVisible !== undefined ? col.defaultVisible : true
                })
                this._saveColumnVisibility()
                this._render()
                dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    const col = this.columns.find((c) => c.key === cb.value)
                    cb.checked = col ? col.visible !== false : true
                })
                dropdown.style.display = 'none'
                btn.setAttribute('aria-expanded', 'false')
            })

        const pageSizeInput = dropdown.querySelector('.page-size-input')
        if (pageSizeInput) {
            pageSizeInput.addEventListener('change', () => {
                let val = parseInt(pageSizeInput.value, 10)
                if (isNaN(val) || val < 5) val = 5
                if (val > 250) val = 250
                pageSizeInput.value = val
                this.state.pageSize = val
                this.state.currentPage = 0
                this._savePageSize()
                this.fetch()
                dropdown.style.display = 'none'
                btn.setAttribute('aria-expanded', 'false')
            })
        }
    }

    _saveColumnVisibility() {
        const state = this.columns.map((c) => ({ key: c.key, visible: c.visible !== false }))
        localStorage.setItem(`${this.pageSizeKey}_cols`, JSON.stringify(state))
    }

    _loadColumnVisibility() {
        const saved = localStorage.getItem(`${this.pageSizeKey}_cols`)
        if (saved) {
            try {
                const state = JSON.parse(saved)
                state.forEach((s) => {
                    const col = this.columns.find((c) => c.key === s.key)
                    if (col && !col.required) col.visible = s.visible
                })
            } catch (e) {}
        }
    }

    async _initFilterDropdown() {
        const btn = this.elements.filterBtn
        if (!btn || !this.filterConfig) return

        const config = this.filterConfig
        const dropdown = document.createElement('div')
        dropdown.className = 'filter-dropdown'
        dropdown.style.display = 'none'
        dropdown.setAttribute('role', 'menu')
        dropdown.innerHTML = `
            <div class="filter-dropdown-header">${config.label || 'Filter'}</div>
            <div id="${this.containerId}-filter-list"></div>
        `
        btn.parentNode.appendChild(dropdown)
        this.elements._filterDropdown = dropdown

        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this._toggleDropdown(dropdown, btn)
        })

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                this._closeDropdown(dropdown, btn)
            }
        })

        const list = document.getElementById(`${this.containerId}-filter-list`)
        const paramName =
            config.paramName || (config.type === 'eventType' ? 'eventType' : 'category')

        let options = []
        if (config.type === 'category') {
            try {
                const key = getApiKey()
                const resp = await fetch(`${this.apiPath}?limit=500&status=active`, {
                    headers: { 'X-Api-Key': key },
                })
                if (resp.ok) {
                    const data = await resp.json()
                    const items = data.items || data
                    options = [...new Set(items.map((i) => i.category).filter(Boolean))].sort()
                }
            } catch (e) {}
        } else {
            options = config.options || []
        }

        const hasActive = this.state.filters[paramName] !== undefined
        // "All" radio – selected when no filter is active
        let allChecked = !hasActive ? 'checked' : ''

        list.innerHTML = `
            <label class="filter-checkbox" role="menuitemradio">
                <input type="radio" name="${paramName}-filter" value="__all__" ${allChecked}>
                <i class="fas fa-check"></i>
                <span>All</span>
            </label>
            ${options
                .map((opt) => {
                    const value = typeof opt === 'string' ? opt : opt.value
                    const label = typeof opt === 'string' ? opt : opt.label
                    const checked = this.state.filters[paramName] === value ? 'checked' : ''
                    return `
                    <label class="filter-checkbox" role="menuitemradio">
                        <input type="radio" name="${paramName}-filter" value="${value}" ${checked}>
                        <i class="fas fa-check"></i>
                        <span>${escapeHtml(label)}</span>
                    </label>
                `
                })
                .join('')}
        `

        // Update filter button active state
        const updateButtonState = () => {
            if (this.state.filters[paramName]) {
                btn.classList.add('filter-active')
            } else {
                btn.classList.remove('filter-active')
            }
        }
        updateButtonState()

        list.querySelectorAll('input[type="radio"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                if (radio.value === '__all__') {
                    delete this.state.filters[paramName]
                } else {
                    this.state.filters[paramName] = radio.value
                }
                this.state.currentPage = 0
                this.fetch()
                dropdown.style.display = 'none'
                btn.setAttribute('aria-expanded', 'false')
                updateButtonState()
            })
        })
    }

    async fetch() {
        const key = getApiKey()
        if (!key) {
            this._renderEmpty('No API key')
            return
        }

        this.state.loading = true
        this._setLoading(true)

        const params = new URLSearchParams({
            limit: this.state.pageSize,
            offset: this.state.currentPage * this.state.pageSize,
        })

        Object.entries(this.state.filters).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') params.append(k, v)
        })

        if (this.state.sortField) {
            params.append('sort_by', this.state.sortField)
            params.append('sort_order', this.state.sortOrder || 'asc')
        }

        try {
            const resp = await fetch(`${this.apiPath}?${params.toString()}`, {
                headers: { 'X-Api-Key': key },
            })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const data = await resp.json()
            this.state.rows = data.items || data
            this.state.totalItems = data.total !== undefined ? data.total : this.state.rows.length
            this._render()
            this._updatePagination()
            if (this.urlSync) this._syncURL()
        } catch (err) {
            this._renderEmpty(`Error: ${err.message}`)
        } finally {
            this.state.loading = false
            this._setLoading(false)
        }
    }

    _render() {
        const { thead, tbody } = this.elements
        const visibleCols = this.columns.filter((col) => col.visible !== false)

        thead.innerHTML = visibleCols
            .map((col) => {
                const sortClass =
                    (col.sortable ? 'sortable' : '') +
                    (this.state.sortField === col.key
                        ? this.state.sortOrder === 'asc'
                            ? ' sorted-asc'
                            : ' sorted-desc'
                        : '')
                return `<th scope="col" data-key="${col.key}" class="${sortClass} ${col.className || ''}" style="${col.width ? `width:${col.width}` : ''}">${escapeHtml(col.header)}</th>`
            })
            .join('')

        tbody.innerHTML =
            this.state.rows.length === 0
                ? '<tr><td colspan="100%">No data</td></tr>'
                : this.state.rows
                      .map((row, idx) => {
                          const cells = visibleCols
                              .map((col) => {
                                  let value = row[col.key]
                                  if (col.render) value = col.render(value, row)
                                  else if (value === undefined || value === null) value = '—'

                                  // Chip support
                                  if (col.chip && value !== '—') {
                                      let extraClass = ''
                                      if (typeof col.chipClass === 'function') {
                                          extraClass = col.chipClass(value, row) || ''
                                      } else if (col.chipClass) {
                                          extraClass = col.chipClass
                                      }
                                      return `<td class="${col.className || ''}"><span class="chip-status ${escapeHtml(extraClass)}">${escapeHtml(String(value))}</span></td>`
                                  }

                                  if (col.html) {
                                      return `<td class="${col.className || ''}">${value}</td>`
                                  }
                                  return `<td class="${col.className || ''}">${escapeHtml(String(value))}</td>`
                              })
                              .join('')
                          return `<tr data-index="${idx}">${cells}</tr>`
                      })
                      .join('')
    }

    _renderEmpty(message) {
        this.elements.tbody.innerHTML = `<tr><td colspan="100%">${escapeHtml(message)}</td></tr>`
        if (this.elements.firstBtn) this.elements.firstBtn.disabled = true
        if (this.elements.prevBtn) this.elements.prevBtn.disabled = true
        if (this.elements.nextBtn) this.elements.nextBtn.disabled = true
        if (this.elements.lastBtn) this.elements.lastBtn.disabled = true
        if (this.elements.pageNumberBtn) this.elements.pageNumberBtn.textContent = '1 / 1'
        if (this.elements.totalRecords) this.elements.totalRecords.textContent = 'Total records: 0'
    }

    _setLoading(loading) {
        if (loading) this.elements.tbody.innerHTML = '<tr><td colspan="100%">Loading...</td></tr>'
    }

    _updatePagination() {
        if (!this.elements.pageNumberBtn) return
        const totalPages = Math.ceil(this.state.totalItems / this.state.pageSize) || 1
        const current = this.state.currentPage + 1

        this.elements.pageNumberBtn.textContent = `${current} / ${totalPages}`
        if (this.elements.firstBtn) this.elements.firstBtn.disabled = this.state.currentPage === 0
        if (this.elements.prevBtn) this.elements.prevBtn.disabled = this.state.currentPage === 0
        if (this.elements.nextBtn)
            this.elements.nextBtn.disabled = this.state.currentPage >= totalPages - 1
        if (this.elements.lastBtn)
            this.elements.lastBtn.disabled = this.state.currentPage >= totalPages - 1
        if (this.elements.totalRecords)
            this.elements.totalRecords.textContent = `Total records: ${this.state.totalItems}`
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.state.totalItems / this.state.pageSize) || 1
        if (page < 0 || page >= totalPages) return
        this.state.currentPage = page
        this.fetch()
    }

    _loadPageSize() {
        const saved = localStorage.getItem(this.pageSizeKey)
        return saved ? parseInt(saved, 10) : 50
    }

    _savePageSize() {
        localStorage.setItem(this.pageSizeKey, this.state.pageSize)
    }

    _onSortClick(field) {
        const col = this.columns.find((c) => c.key === field)
        if (!col || !col.sortable) return
        if (this.state.sortField === field) {
            if (this.state.sortOrder === 'asc') this.state.sortOrder = 'desc'
            else if (this.state.sortOrder === 'desc') {
                this.state.sortField = null
                this.state.sortOrder = null
            }
        } else {
            this.state.sortField = field
            this.state.sortOrder = 'asc'
        }
        this.state.currentPage = 0
        this.fetch()
    }

    _syncURL() {
        const params = {}
        if (this.state.currentPage > 0) params.page = this.state.currentPage
        if (this.state.pageSize !== this._loadPageSize()) params.pageSize = this.state.pageSize
        if (this.state.sortField) {
            params.sort_by = this.state.sortField
            params.sort_order = this.state.sortOrder
        }
        Object.entries(this.state.filters).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') params[k] = v
        })
        updateUrlFilters(params)
    }

    _openDetailModal(row) {
        if (!this.detailModal) return
        const { title, fields } = this.detailModal
        let bodyHtml = '<dl>'
        fields.forEach((f) => {
            let value = row[f.key]
            if (f.render) value = f.render(value, row)
            if (value === undefined || value === null || value === '') return
            bodyHtml += `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(String(value))}</dd>`
        })
        bodyHtml += '</dl>'
        openModal({
            title,
            bodyHtml,
            rightButtons: [{ text: 'Close', class: 'secondary-btn' }],
        })
    }
}
