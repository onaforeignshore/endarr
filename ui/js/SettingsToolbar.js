// ui/js/SettingsToolbar.js
import { showToast } from './ui-helpers.js'

/**
 * Settings toolbar manager.
 * Provides a save button with dirty state detection, optional advanced toggle,
 * and extra buttons. Automatically tracks changes to elements with `data-field`.
 * @class
 */
export class SettingsToolbar {
    /**
     * Create a new toolbar.
     * @param {object} opts - Configuration options.
     * @param {string} opts.container - CSS selector for the page root element.
     * @param {Function} opts.save - Async function called when Save is clicked.
     * @param {boolean} [opts.showAdvanced=false] - Whether to show the advanced toggle button.
     * @param {Array<{text: string, icon: string, onClick: Function}>} [opts.extraButtons] - Extra buttons to add.
     */
    constructor(opts) {
        this.container = document.querySelector(opts.container)
        this.saveFn = opts.save
        this.showAdvanced = opts.showAdvanced || false
        this.extraButtons = opts.extraButtons || []
        this._snapshot = {}
        this._dirty = false
        this._advancedVisible = false
    }

    /**
     * Initialise the toolbar: build DOM, start watching fields.
     * @public
     */
    init() {
        this._buildDOM()
        this._watchFields()
    }

    /**
     * Capture a snapshot of current field values for dirty detection.
     * Must be called after the page has loaded all initial data.
     * @public
     */
    captureSnapshot() {
        this._captureSnapshot()
        this._checkDirty()
    }

    /**
     * Set the visibility of the advanced section and update the button text.
     * @param {boolean} visible - True to show advanced fields, false to hide.
     * @public
     */
    setAdvancedVisible(visible) {
        this._advancedVisible = visible
        if (this._advancedBtn) {
            this._advancedBtn.innerHTML = visible
                ? '<i class="fas fa-cog"></i> Hide Advanced'
                : '<i class="fas fa-cog"></i> Show Advanced'
        }
        this._setAdvancedFieldsVisible(visible)
    }

    // ── Private methods ────────────────────────────────────

    /**
     * Show or hide all elements with class `.advanced-field`.
     * @param {boolean} visible
     * @private
     */
    _setAdvancedFieldsVisible(visible) {
        document.querySelectorAll('.advanced-field').forEach(el => {
            el.style.display = visible ? 'block' : 'none'
        })
    }

    /**
     * Build the toolbar DOM and attach event listeners.
     * @private
     */
    _buildDOM() {
        const bar = document.createElement('div')
        bar.className = 'datatable-toolbar'

        let leftHtml = `<div class="toolbar-left">`

        if (this.showAdvanced) {
            leftHtml += `
                <button class="toolbar-btn advanced-btn">
                    <i class="fas fa-cog"></i> Show Advanced
                </button>
            `
        }

        leftHtml += `
                <button class="toolbar-btn save-btn" disabled>
                    <i class="fas fa-save"></i> No Changes
                </button>
        `

        if (this.extraButtons.length) {
            leftHtml += `<div class="toolbar-separator"></div>`
            this.extraButtons.forEach((btn) => {
                leftHtml += `
                    <button class="toolbar-btn extra-btn" data-action="${btn.text}">
                        <i class="fas ${btn.icon}"></i> ${btn.text}
                    </button>
                `
            })
        }

        leftHtml += `</div>`
        bar.innerHTML = leftHtml
        this.container.prepend(bar)

        this._saveBtn = bar.querySelector('.save-btn')
        this._saveBtn.addEventListener('click', () => this._onSave())

        if (this.showAdvanced) {
            this._advancedBtn = bar.querySelector('.advanced-btn')
            this._advancedBtn.addEventListener('click', () => this._toggleAdvanced())
        }

        bar.querySelectorAll('.extra-btn').forEach((btn) => {
            const action = btn.dataset.action
            const cfg = this.extraButtons.find((b) => b.text === action)
            if (cfg) btn.addEventListener('click', cfg.onClick)
        })
    }

    /**
     * Toggle advanced section visibility.
     * @private
     */
    _toggleAdvanced() {
        this._advancedVisible = !this._advancedVisible
        if (this._advancedVisible) {
            this._advancedBtn.innerHTML = '<i class="fas fa-cog"></i> Hide Advanced'
        } else {
            this._advancedBtn.innerHTML = '<i class="fas fa-cog"></i> Show Advanced'
        }
        this._setAdvancedFieldsVisible(this._advancedVisible)
    }

    /**
     * Capture current values of all `[data-field]` elements.
     * @private
     */
    _captureSnapshot() {
        this._snapshot = {}
        this.container.querySelectorAll('[data-field]').forEach((el) => {
            const name = el.dataset.field
            this._snapshot[name] = el.type === 'checkbox' ? el.checked : el.value
        })
    }

    /**
     * Attach event listeners to detect changes in `[data-field]` elements.
     * @private
     */
    _watchFields() {
        const markDirty = () => this._checkDirty()
        this.container.addEventListener('input', markDirty)
        this.container.addEventListener('change', markDirty)
    }

    /**
     * Check if any field has changed since last snapshot and update save button state.
     * @private
     */
    _checkDirty() {
        let dirty = false
        this.container.querySelectorAll('[data-field]').forEach((el) => {
            const name = el.dataset.field
            const currentVal = el.type === 'checkbox' ? el.checked : el.value
            if (currentVal !== this._snapshot[name]) {
                dirty = true
            }
        })
        this._dirty = dirty
        if (dirty) {
            this._saveBtn.disabled = false
            this._saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'
        } else {
            this._saveBtn.disabled = true
            this._saveBtn.innerHTML = '<i class="fas fa-save"></i> No Changes'
        }
        window.isSettingsDirty = dirty
    }

    /**
     * Handle save button click: call save function, show feedback, update snapshot.
     * @private
     */
    async _onSave() {
        this._saveBtn.disabled = true
        this._saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving…'
        try {
            await this.saveFn()
            this._captureSnapshot()
            this._dirty = false
            this._showSuccess()
        } catch (err) {
            this._saveBtn.disabled = false
            this._saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'
            showToast(err.message || 'Save failed', 'error')
        }
    }

    /**
     * Show success feedback on save button.
     * @param {number} [duration=2000] - How long to show success state (ms).
     * @private
     */
    _showSuccess(duration = 2000) {
        this._saveBtn.disabled = true
        this._saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved'
        setTimeout(() => {
            this._saveBtn.innerHTML = '<i class="fas fa-save"></i> No Changes'
            this._saveBtn.disabled = true
        }, duration)
    }
}