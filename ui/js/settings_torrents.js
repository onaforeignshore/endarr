// ui/js/settings_torrents.js
import { conditionTypes, renderConditionList, addCondition } from './conditionUtils.js'
import {
    validateDefaultsSection,
    validateProblematicSection,
    validateGeneralCleanupSection,
    displayFormErrors,
    initDurationInputs,
    initByteInputs,
} from './configValidator.js'
import { openModal } from './modal.js'
import { SettingsToolbar } from './SettingsToolbar.js'
import { showToast, confirmAction, setupFieldErrorClearing } from './ui-helpers.js'
import { escapeHtml, formatDuration, consoleDebug } from './utils.js'

/**
 * Initialise the Torrent Handling settings page.
 * @param {Function} loadConfig - Async function to load configuration.
 * @param {Function} saveConfig - Async function to save configuration.
 */
export function initTorrentsForm(loadConfig, saveConfig) {
    consoleDebug('[Torrents] Form initialised')

    // DOM elements
    const policyModeSelect = document.getElementById('globalDeletePolicyMode')
    const rulesContainer = document.getElementById('deletionRulesContainer')
    const conditionsList = document.getElementById('conditionsList')
    const addConditionBtn = document.getElementById('addConditionBtn')
    const operatorSelect = document.getElementById('operatorSelect')
    const operatorContainer = document.getElementById('operatorDropdownContainer')
    const emptyPlaceholder = document.getElementById('emptyConditionsPlaceholder')
    const successIdleSeconds = document.getElementById('successIdleSeconds')
    const successAvailabilitySeconds = document.getElementById('successAvailabilitySeconds')
    const uploadAmountInput = document.getElementById('uploadAmount')
    const minSeedersInput = document.getElementById('minSeeders')
    const enableIdle = document.getElementById('enableIdle')
    const idleSettings = document.getElementById('idleSettings')
    const problemIdleSeconds = document.getElementById('problemIdleSeconds')
    const enableAvailability = document.getElementById('enableAvailability')
    const availabilitySettings = document.getElementById('availabilitySettings')
    const problemAvailabilitySeconds = document.getElementById('problemAvailabilitySeconds')
    const enableStalled = document.getElementById('enableStalled')
    const stalledSettings = document.getElementById('stalledSettings')
    const stalledMinAge = document.getElementById('stalledMinAge')
    const stalledMinProgress = document.getElementById('stalledMinProgress')
    const stalledStrikeThreshold = document.getElementById('stalledStrikeThreshold')
    const enableSlowSpeed = document.getElementById('enableSlowSpeed')
    const slowSpeedSettings = document.getElementById('slowSpeedSettings')
    const slowSpeedKb = document.getElementById('slowSpeedKb')
    const slowSpeedDuration = document.getElementById('slowSpeedDuration')
    const enableErrorState = document.getElementById('enableErrorState')
    const maxDownloadTime = document.getElementById('maxDownloadTime')
    const torrentAgeDays = document.getElementById('torrentAgeDays')
    const problemSearchOnDelete = document.getElementById('problemSearchOnDelete')
    const problemPolicyBlacklist = document.getElementById('problemPolicyBlacklist')
    const overridesList = document.getElementById('arrOverridesList')

    let arrOverrides = []
    let arrClients = []
    let conditions = []

    // Hidden state for conditions (dirty tracking)
    let conditionsStateInput = document.getElementById('conditionsState')
    if (!conditionsStateInput) {
        conditionsStateInput = document.createElement('input')
        conditionsStateInput.type = 'hidden'
        conditionsStateInput.id = 'conditionsState'
        conditionsStateInput.setAttribute('data-field', 'conditions_state')
        const container = document.querySelector('#pageContent')
        if (container) container.prepend(conditionsStateInput)
    }

    /**
     * Update hidden state JSON and notify toolbar of dirty changes.
     */
    function updateConditionsState() {
        conditionsStateInput.value = JSON.stringify(conditions)
        if (toolbar) toolbar._checkDirty()
    }

    /**
     * Render the list of conditions as a two‑column grid.
     */
    function renderConditions() {
        const container = conditionsList
        container.innerHTML = ''
        if (conditions.length === 0) {
            emptyPlaceholder.style.display = 'block'
            operatorContainer.style.display = 'none'
            container.style.display = 'none'
            return
        }
        emptyPlaceholder.style.display = 'none'
        container.style.display = 'grid'
        operatorContainer.style.display = conditions.length >= 2 ? 'flex' : 'none'

        renderConditionList(
            container,
            conditions,
            (newConditions) => {
                conditions = newConditions
                renderConditions()
                updateConditionsState()
            },
            'condition-card'
        )
    }

    /**
     * Add a new condition row (adds the first available type).
     */
    function handleAddMainCondition() {
        const added = addCondition(conditions, (newConditions) => {
            conditions = newConditions
            renderConditions()
            updateConditionsState()
        })
        if (!added) {
            showToast('No more condition types available', 'info')
        }
    }

    function toggleRulesVisibility() {
        rulesContainer.style.display = policyModeSelect.value === 'calculated' ? 'block' : 'none'
    }

    function toggleProblematicFields() {
        const enableDisable = (checkbox, settings) => {
            const inputs = settings.querySelectorAll('input')
            inputs.forEach((input) => {
                input.disabled = !checkbox.checked
                if (!checkbox.checked) {
                    input.classList.remove('input-error')
                    input.removeAttribute('aria-describedby')
                }
            })
        }
        enableDisable(enableIdle, idleSettings)
        enableDisable(enableAvailability, availabilitySettings)
        enableDisable(enableStalled, stalledSettings)
        enableDisable(enableSlowSpeed, slowSpeedSettings)
    }

    /**
     * Get a human-readable summary of an override policy for the card display.
     * @param {Object} override - The override object.
     * @returns {{type: string, label?: string, operator?: string, conditions?: Array}}
     */
    function getPolicySummary(override) {
        if (override.delete_policy === 'none') return { type: 'tag', label: 'None' }
        if (override.delete_policy === 'immediate') return { type: 'tag', label: 'Immediate' }
        if (override.delete_policy === 'calculated' && override.deletion_rules) {
            const rules = override.deletion_rules
            const op = rules.operator === 'any' ? 'OR' : 'AND'
            const condTags = rules.conditions.map((c) => {
                const info = conditionTypes[c.type]
                const label = info.shortLabel
                let display = c.threshold
                if (c.type !== 'ratio') display = formatDuration(c.threshold)
                else display = c.threshold.toFixed(1)
                return { type: 'cond', label: `${label}: ${display}` }
            })
            return { type: 'calculated', operator: op, conditions: condTags }
        }
        return { type: 'tag', label: 'Unknown' }
    }

    /**
     * Render the ARR override cards (including add card).
     */
    function renderOverrides() {
        if (!overridesList) return
        overridesList.innerHTML = ''
        arrOverrides.forEach((override, idx) => {
            const arr = arrClients.find((a) => a.id === override.arr_id)
            const arrName = arr ? arr.name : override.arr_id
            const summary = getPolicySummary(override)
            const statusBadge = override.enabled
                ? '<span class="status-badge enabled">Enabled</span>'
                : '<span class="status-badge disabled">Disabled</span>'
            let policyHtml = ''
            if (summary.type === 'tag') {
                policyHtml = `<span class="chip policy-tag">${escapeHtml(summary.label)}</span>`
            } else if (summary.type === 'calculated') {
                const opTag = `<span class="chip policy-tag">Calculated: ${summary.operator}</span>`
                const condSpans = summary.conditions
                    .map((c) => `<span class="chip condition-tag">${escapeHtml(c.label)}</span>`)
                    .join('')
                policyHtml = `
                    <div class="policy-details">
                        ${opTag}
                        <div class="conditions-block">${condSpans}</div>
                    </div>
                `
            }
            const card = document.createElement('div')
            card.className = 'client-card'
            card.dataset.index = idx
            card.innerHTML = `
                <div class="card-header">
                    <div class="client-name">${escapeHtml(arrName)}</div>
                </div>
                <div class="card-body">${policyHtml}</div>
                <div class="card-footer"><div></div>${statusBadge}</div>
            `
            card.addEventListener('click', () => openOverrideModal(idx))
            overridesList.appendChild(card)
        })
        const overriddenIds = arrOverrides.map((o) => o.arr_id)
        const availableArrs = arrClients.filter((arr) => !overriddenIds.includes(arr.id))
        if (availableArrs.length > 0) {
            const addCard = document.createElement('div')
            addCard.className = 'client-card add-card'
            addCard.innerHTML = `<i class="fas fa-plus-circle"></i><span>Add override</span>`
            addCard.addEventListener('click', () => openOverrideModal(-1))
            overridesList.appendChild(addCard)
        }
    }

    /**
     * Open the modal to add or edit an ARR override.
     * @param {number} index - Index in arrOverrides array, or -1 for new.
     */
    function openOverrideModal(index) {
        const isEdit = index !== -1
        const override = isEdit ? arrOverrides[index] : null
        const editingIndex = index
        const showAdvanced =
            document.querySelectorAll('.advanced-field')[0]?.style.display === 'block'

        const availableArrs = isEdit
            ? [arrClients.find((a) => a.id === override.arr_id)]
            : arrClients.filter((arr) => !arrOverrides.some((o) => o.arr_id === arr.id))

        let arrOptions = ''
        availableArrs.forEach((arr) => {
            arrOptions += `<option value="${escapeHtml(arr.id)}" ${isEdit ? 'selected' : ''}>${escapeHtml(arr.name)}</option>`
        })

        let advancedFieldsHtml = ''
        if (showAdvanced) {
            advancedFieldsHtml = `
                <div class="form-group">
                    <label for="modalOverrideUploadAmount">Upload Amount (bytes, 0 = disabled)</label>
                    <input type="number" id="modalOverrideUploadAmount" value="${override?.upload_amount_bytes || 0}" step="1073741824" min="0">
                </div>
                <div class="form-group">
                    <label for="modalOverrideMinSeeders">Minimum Seeders (0 = disabled)</label>
                    <input type="number" id="modalOverrideMinSeeders" value="${override?.min_seeders || 0}" min="0">
                </div>
            `
        }

        const bodyHtml = `
            <div class="form-group">
                <label>ARR Client</label>
                <select id="modalOverrideArrId" ${isEdit ? 'disabled' : ''}>${arrOptions}</select>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="modalOverrideEnabled" ${!isEdit || override.enabled ? 'checked' : ''}>
                <label for="modalOverrideEnabled">Enabled</label>
            </div>
            <div class="form-group">
                <label>Policy Mode</label>
                <select id="modalOverrideDeletePolicy">
                    <option value="none" ${override?.delete_policy === 'none' ? 'selected' : ''}>None</option>
                    <option value="immediate" ${override?.delete_policy === 'immediate' ? 'selected' : ''}>Immediate</option>
                    <option value="calculated" ${override?.delete_policy === 'calculated' ? 'selected' : ''}>Calculated</option>
                </select>
            </div>
            <div id="modalOverrideRulesContainer" style="display: ${override?.delete_policy === 'calculated' ? 'block' : 'none'};">
                <h3 style="margin-bottom: 12px;">Conditions</h3>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <button id="modalAddOverrideConditionBtn" class="secondary-btn"><i class="fas fa-plus"></i> Add Condition</button>
                    <div id="modalOperatorDropdownContainer" style="display: none;">
                        <label for="modalOverrideOperatorSelect" style="margin-bottom: 0;">Match:</label>
                        <select id="modalOverrideOperatorSelect">
                            <option value="any">Any (OR)</option>
                            <option value="all">All (AND)</option>
                        </select>
                    </div>
                </div>
                <div id="modalOverrideConditionsList" class="conditions-list"></div>
                <div id="modalEmptyConditionsPlaceholder" class="placeholder-card" style="display: none;">No conditions – click + Add Condition to add one.</div>
            </div>
            ${advancedFieldsHtml}
        `

        let modalConditions = override?.deletion_rules?.conditions
            ? override.deletion_rules.conditions.map((c) => ({ ...c }))
            : []

        function renderModalConditions() {
            const container = document.getElementById('modalOverrideConditionsList')
            const dropdownContainer = document.getElementById('modalOperatorDropdownContainer')
            const placeholder = document.getElementById('modalEmptyConditionsPlaceholder')
            if (!container) return

            if (modalConditions.length === 0) {
                container.innerHTML = ''
                if (placeholder) placeholder.style.display = 'block'
                if (dropdownContainer) dropdownContainer.style.display = 'none'
                return
            }
            if (placeholder) placeholder.style.display = 'none'
            if (dropdownContainer) {
                dropdownContainer.style.display = modalConditions.length >= 2 ? 'flex' : 'none'
            }

            renderConditionList(
                container,
                modalConditions,
                (newModalConditions) => {
                    modalConditions = newModalConditions
                    renderModalConditions()
                },
                'condition-row'
            )
        }

        openModal({
            title: isEdit ? 'Edit ARR Override' : 'Add ARR Override',
            bodyHtml,
            leftButtons: isEdit
                ? [
                      {
                          text: 'Delete',
                          class: 'danger-btn',
                          onClick: async () => {
                              if (await confirmAction('config', 'Delete this override?')) {
                                  arrOverrides.splice(editingIndex, 1)
                                  const config = await loadConfig()
                                  config.arrs_overrides.deletion = arrOverrides
                                  await saveConfig(config)
                                  renderOverrides()
                                  showToast('Override deleted', 'success')
                              } else return false
                          },
                      },
                  ]
                : [],
            rightButtons: [
                { text: 'Cancel', class: 'secondary-btn' },
                {
                    text: isEdit ? 'Save' : 'Add',
                    class: 'primary-btn',
                    onClick: async () => {
                        const arrId = document.getElementById('modalOverrideArrId').value
                        const enabled = document.getElementById('modalOverrideEnabled').checked
                        const deletePolicy = document.getElementById(
                            'modalOverrideDeletePolicy'
                        ).value
                        let deletionRules = null
                        if (deletePolicy === 'calculated') {
                            const operator =
                                document.getElementById('modalOverrideOperatorSelect')?.value ||
                                'any'
                            if (modalConditions.length === 0) {
                                showToast(
                                    'Calculated policy requires at least one condition.',
                                    'error'
                                )
                                return false
                            }
                            deletionRules = { operator, conditions: modalConditions }
                        }
                        const newOverride = {
                            arr_id: arrId,
                            enabled,
                            delete_policy: deletePolicy,
                            deletion_rules: deletionRules,
                        }
                        const uploadAmountEl = document.getElementById('modalOverrideUploadAmount')
                        if (uploadAmountEl)
                            newOverride.upload_amount_bytes =
                                parseInt(uploadAmountEl.value, 10) || 0
                        const minSeedersEl = document.getElementById('modalOverrideMinSeeders')
                        if (minSeedersEl)
                            newOverride.min_seeders = parseInt(minSeedersEl.value, 10) || 0
                        if (isEdit) arrOverrides[editingIndex] = newOverride
                        else arrOverrides.push(newOverride)
                        const config = await loadConfig()
                        if (!config.arrs_overrides) config.arrs_overrides = {}
                        config.arrs_overrides.deletion = arrOverrides
                        await saveConfig(config)
                        renderOverrides()
                        showToast('Override saved', 'success')
                    },
                },
            ],
            onClose: () => {},
        })

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                renderModalConditions()
                const operatorSelectModal = document.getElementById('modalOverrideOperatorSelect')
                if (operatorSelectModal && override?.deletion_rules?.operator) {
                    operatorSelectModal.value = override.deletion_rules.operator
                }
                const policySelect = document.getElementById('modalOverrideDeletePolicy')
                const rulesContainerModal = document.getElementById('modalOverrideRulesContainer')
                if (policySelect && rulesContainerModal) {
                    const toggleRules = () => {
                        rulesContainerModal.style.display =
                            policySelect.value === 'calculated' ? 'block' : 'none'
                        if (policySelect.value === 'calculated') renderModalConditions()
                    }
                    policySelect.addEventListener('change', toggleRules)
                    toggleRules()
                }
                document
                    .getElementById('modalAddOverrideConditionBtn')
                    ?.addEventListener('click', () => {
                        const added = addCondition(modalConditions, (newModalConditions) => {
                            modalConditions = newModalConditions
                            renderModalConditions()
                        })
                        if (!added) {
                            showToast('No more condition types available', 'info')
                        }
                    })
            })
        })
    }

    /**
     * Load configuration and populate all form fields.
     * @returns {Promise<void>}
     */
    async function load() {
        const config = await loadConfig()
        arrClients = config.arrs || []
        const uiPrefs = config.ui_preferences || {}
        const initiallyAdvanced = uiPrefs.show_advanced || false
        toolbar.setAdvancedVisible(initiallyAdvanced)

        const defaults = config.defaults || {}
        successIdleSeconds.value = defaults.idle_seconds || 3600
        successAvailabilitySeconds.value = defaults.no_availability_seconds || 7200
        policyModeSelect.value = defaults.delete_policy || 'none'
        uploadAmountInput.value = defaults.upload_amount_bytes || 0
        minSeedersInput.value = defaults.min_seeders || 0

        if (defaults.delete_policy === 'calculated' && defaults.deletion_rules) {
            operatorSelect.value = defaults.deletion_rules.operator || 'any'
            conditions = defaults.deletion_rules.conditions.map((c) => ({ ...c }))
            renderConditions()
            updateConditionsState()
        } else {
            conditions = []
            renderConditions()
            updateConditionsState()
        }
        toggleRulesVisibility()

        const problem = config.problematic_torrents || {}
        enableIdle.checked = problem.idle_enabled || false
        problemIdleSeconds.value = problem.idle_seconds || 3600
        enableAvailability.checked = problem.availability_enabled || false
        problemAvailabilitySeconds.value = problem.availability_seconds || 7200
        enableStalled.checked = problem.stalled_enabled || false
        stalledMinAge.value = problem.stalled_min_age || 300
        stalledMinProgress.value = problem.stalled_min_progress || 0.05
        stalledStrikeThreshold.value = problem.stalled_strike_threshold || 3
        enableSlowSpeed.checked = problem.slow_speed_enabled || false
        slowSpeedKb.value = problem.slow_speed_kb || 10
        slowSpeedDuration.value = problem.slow_speed_duration || 300
        enableErrorState.checked = problem.error_state_enabled || false
        maxDownloadTime.value = problem.max_download_time_hours || 0
        problemSearchOnDelete.checked = problem.search_on_delete || false
        problemPolicyBlacklist.checked = problem.policy_blacklist || false
        toggleProblematicFields()

        const cleanup = config.general_cleanup || {}
        torrentAgeDays.value = cleanup.torrent_age_days || 0

        const rawOverrides = config.arrs_overrides?.deletion || []
        arrOverrides = rawOverrides.map((ov) => ({ ...ov, arr_id: ov.arr_id || ov.arrId }))
        renderOverrides()

        initDurationInputs(document.querySelector('.settings-container') || document)
        initByteInputs(document.querySelector('.settings-container') || document)
        setupFieldErrorClearing(document.querySelector('#pageContent'))
    }

    /**
     * Save all torrent handling settings.
     * @returns {Promise<void>}
     * @throws Will throw if validation fails.
     */
    async function save() {
        const errors = []
        const successfulData = {
            delete_policy: policyModeSelect.value,
            upload_amount_bytes: parseInt(uploadAmountInput.value, 10) || 0,
            min_seeders: parseInt(minSeedersInput.value, 10) || 0,
            ratio_goal: parseFloat(document.getElementById('ratioGoal')?.value) || 2.0,
            seed_time_seconds: parseInt(document.getElementById('seedTime')?.value, 10) || 86400,
            idle_seconds: parseInt(successIdleSeconds.value, 10) || 3600,
            no_availability_seconds: parseInt(successAvailabilitySeconds.value, 10) || 7200,
            deletion_rules:
                policyModeSelect.value === 'calculated'
                    ? {
                          operator: operatorSelect.value,
                          conditions: conditions.map((c) => ({
                              type: c.type,
                              threshold: c.threshold,
                          })),
                      }
                    : undefined,
        }
        const successfulErrors = validateDefaultsSection(successfulData)
        if (successfulErrors.length) errors.push(...successfulErrors)

        const problematicData = {
            idle_enabled: enableIdle.checked,
            idle_seconds: parseInt(problemIdleSeconds.value, 10),
            availability_enabled: enableAvailability.checked,
            availability_seconds: parseInt(problemAvailabilitySeconds.value, 10),
            stalled_enabled: enableStalled.checked,
            stalled_min_age: parseInt(stalledMinAge.value, 10),
            stalled_min_progress: parseFloat(stalledMinProgress.value),
            stalled_strike_threshold: parseInt(stalledStrikeThreshold.value, 10),
            slow_speed_enabled: enableSlowSpeed.checked,
            slow_speed_kb: parseInt(slowSpeedKb.value, 10),
            slow_speed_duration: parseInt(slowSpeedDuration.value, 10),
            search_on_delete: problemSearchOnDelete.checked,
            policy_blacklist: problemPolicyBlacklist.checked,
            error_state_enabled: enableErrorState.checked,
            max_download_time_hours: parseInt(maxDownloadTime.value, 10) || 0,
        }
        const problematicErrors = validateProblematicSection(problematicData)
        if (problematicErrors.length) errors.push(...problematicErrors)

        const cleanupData = { torrent_age_days: parseInt(torrentAgeDays.value, 10) || 0 }
        const cleanupErrors = validateGeneralCleanupSection(cleanupData)
        if (cleanupErrors.length) errors.push(...cleanupErrors)

        if (errors.length > 0) {
            displayFormErrors(errors)
            throw new Error('Validation failed')
        }

        const config = await loadConfig()
        if (!config.defaults) config.defaults = {}
        Object.assign(config.defaults, successfulData)
        if (policyModeSelect.value !== 'calculated') delete config.defaults.deletion_rules

        config.problematic_torrents = problematicData
        config.general_cleanup = cleanupData

        if (!config.arrs_overrides) config.arrs_overrides = {}
        config.arrs_overrides.deletion = arrOverrides

        if (!config.ui_preferences) config.ui_preferences = {}
        config.ui_preferences.show_advanced = toolbar._advancedVisible

        await saveConfig(config)
    }

    // Event listeners
    policyModeSelect.addEventListener('change', toggleRulesVisibility)
    addConditionBtn.addEventListener('click', handleAddMainCondition)
    enableIdle.addEventListener('change', toggleProblematicFields)
    enableAvailability.addEventListener('change', toggleProblematicFields)
    enableStalled.addEventListener('change', toggleProblematicFields)
    enableSlowSpeed.addEventListener('change', toggleProblematicFields)

    // Toolbar initialisation
    const toolbar = new SettingsToolbar({
        container: '#pageContent',
        save,
        showAdvanced: true,
    })
    toolbar.init()
    load().then(() => toolbar.captureSnapshot())
}
