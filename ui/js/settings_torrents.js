// ui/js/settings_torrents.js
import {
    validateDefaultsSection,
    validateProblematicSection,
    validateGeneralCleanupSection,
    displayFormErrors,
    initDurationInputs,
    initByteInputs,
} from './configValidator.js'
import { escapeHtml, formatDuration } from './utils.js'

export function initTorrentsForm(loadConfig, saveConfig) {
    console.log('Initialising Torrent Handling form')

    // Condition types for Successful Torrents (only Minimum Ratio and Seed Time)
    const conditionTypes = {
        ratio: {
            label: 'Minimum Ratio',
            shortLabel: 'Min Ratio',
            default: 2.0,
            step: 0.1,
            unit: '',
        },
        time: { label: 'Seed Time', shortLabel: 'Seed Time', default: 86400, step: 1, unit: 'sec' },
    }

    // ---- Successful Torrents DOM ----
    const policyModeSelect = document.getElementById('globalDeletePolicyMode')
    const rulesContainer = document.getElementById('deletionRulesContainer')
    const conditionsList = document.getElementById('conditionsList')
    const addConditionBtn = document.getElementById('addConditionBtn')
    const operatorRadios = document.querySelectorAll('input[name="operator"]')
    const saveSuccessfulBtn = document.getElementById('saveSuccessfulBtn')

    // New successful fields
    const successIdleSeconds = document.getElementById('successIdleSeconds')
    const successAvailabilitySeconds = document.getElementById('successAvailabilitySeconds')
    const uploadAmountInput = document.getElementById('uploadAmount')
    const minSeedersInput = document.getElementById('minSeeders')

    // ---- Problematic Torrents DOM ----
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
    const saveProblematicBtn = document.getElementById('saveProblematicBtn')

    // --- General Cleanup Section ---
    const saveCleanupBtn = document.getElementById('saveCleanupBtn')

    // ---- ARR Overrides DOM ----
    const overridesList = document.getElementById('arrOverridesList')
    const addArrOverrideBtn = document.getElementById('addArrOverrideBtn')
    let arrOverrides = []
    let arrClients = []

    // ---- UI Toggle ----
    const showAdvancedToggle = document.getElementById('showAdvancedToggle')
    const advancedFields = document.querySelectorAll('.advanced-field')

    // ---- State ----
    let conditions = [] // for successful torrents (ratio/time)

    // ---- Helpers ----
    // Remove error styling from a specific field when the user starts typing
    function clearFieldErrorOnInput() {
        document.querySelectorAll('[data-field]').forEach((input) => {
            const handler = () => {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                const errorDiv = document.getElementById(input.id + 'Error')
                if (errorDiv) {
                    errorDiv.style.display = 'none'
                    errorDiv.textContent = ''
                }
            }
            input.removeEventListener('input', handler)
            input.addEventListener('input', handler)
        })
    }

    function getAvailableTypes(usedTypes) {
        return Object.keys(conditionTypes).filter((t) => !usedTypes.includes(t))
    }

    // ---- Toggle Advanced Fields ----
    function toggleAdvancedFields(show) {
        advancedFields.forEach((field) => {
            field.style.display = show ? 'block' : 'none'
        })
    }

    // ---- Successful Conditions Rendering ----
    function renderConditions() {
        conditionsList.innerHTML = ''
        conditions.forEach((cond, idx) => {
            const row = document.createElement('div')
            row.className = 'condition-row'
            const typeSelect = document.createElement('select')
            Object.keys(conditionTypes).forEach((type) => {
                const opt = document.createElement('option')
                opt.value = type
                opt.textContent = conditionTypes[type].label
                if (type === cond.type) opt.selected = true
                typeSelect.appendChild(opt)
            })
            typeSelect.addEventListener('change', (e) => {
                cond.type = e.target.value
                cond.threshold = conditionTypes[cond.type].default
                thresholdInput.value = cond.threshold
                thresholdInput.step = conditionTypes[cond.type].step
            })

            const thresholdInput = document.createElement('input')
            thresholdInput.type = 'number'
            thresholdInput.step = conditionTypes[cond.type].step
            thresholdInput.value = cond.threshold
            thresholdInput.addEventListener(
                'change',
                (e) => (cond.threshold = parseFloat(e.target.value))
            )

            const removeBtn = document.createElement('button')
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'
            removeBtn.className = 'remove-condition'
            removeBtn.addEventListener('click', () => {
                conditions.splice(idx, 1)
                renderConditions()
            })

            row.appendChild(typeSelect)
            row.appendChild(thresholdInput)
            row.appendChild(removeBtn)
            conditionsList.appendChild(row)
        })
        if (addConditionBtn) {
            const used = conditions.map((c) => c.type)
            addConditionBtn.disabled = getAvailableTypes(used).length === 0
        }
    }

    function addCondition() {
        const used = conditions.map((c) => c.type)
        const available = getAvailableTypes(used)
        if (available.length === 0) return
        conditions.push({ type: available[0], threshold: conditionTypes[available[0]].default })
        renderConditions()
    }

    function toggleRulesVisibility() {
        rulesContainer.style.display = policyModeSelect.value === 'calculated' ? 'block' : 'none'
    }

    // ---- Problematic Toggles ----
    function toggleProblematicFields() {
        // Idle
        const idleInputs = idleSettings.querySelectorAll('input')
        idleInputs.forEach((input) => {
            input.disabled = !enableIdle.checked
            if (!enableIdle.checked) {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                document.getElementById('problemIdleError').style.display = 'none'
            }
        })

        // Availability
        const availabilityInputs = availabilitySettings.querySelectorAll('input')
        availabilityInputs.forEach((input) => {
            input.disabled = !enableAvailability.checked
            if (!enableAvailability.checked) {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                document.getElementById('problemAvailabilityError').style.display = 'none'
            }
        })

        // Stalled
        const stalledInputs = stalledSettings.querySelectorAll('input')
        stalledInputs.forEach((input) => {
            input.disabled = !enableStalled.checked
            if (!enableStalled.checked) {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                ;[
                    'stalledMinAgeError',
                    'stalledMinProgressError',
                    'stalledStrikeThresholdError',
                ].forEach((id) => {
                    const err = document.getElementById(id)
                    if (err) err.style.display = 'none'
                })
            }
        })

        // Slow Speed
        const slowSpeedInputs = slowSpeedSettings.querySelectorAll('input')
        slowSpeedInputs.forEach((input) => {
            input.disabled = !enableSlowSpeed.checked
            if (!enableSlowSpeed.checked) {
                input.classList.remove('input-error')
                input.removeAttribute('aria-describedby')
                ;['slowSpeedKbError', 'slowSpeedDurationError'].forEach((id) => {
                    const err = document.getElementById(id)
                    if (err) err.style.display = 'none'
                })
            }
        })
    }

    // ---- ARR Overrides (Full Implementation) ----
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
                <div class="card-body">
                    ${policyHtml}
                </div>
                <div class="card-footer">
                    <div></div>
                    ${statusBadge}
                </div>
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

    function openOverrideModal(index) {
        const isEdit = index !== -1
        const override = isEdit ? arrOverrides[index] : null
        const editingIndex = index
        const showAdvanced = showAdvancedToggle.checked

        const availableArrs = isEdit
            ? [arrClients.find((a) => a.id === override.arr_id)]
            : arrClients.filter((arr) => !arrOverrides.some((o) => o.arr_id === arr.id))

        let arrOptions = ''
        availableArrs.forEach((arr) => {
            arrOptions += `<option value="${escapeHtml(arr.id)}" ${isEdit ? 'selected' : ''}>${escapeHtml(arr.name)}</option>`
        })

        // Build advanced fields HTML conditionally
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
            <div class="form-group">
                <label class="checkbox-group">
                    <input type="checkbox" id="modalOverrideEnabled" ${!isEdit || override.enabled ? 'checked' : ''}>
                    <span>Enabled</span>
                </label>
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
                <div class="conditions-header">
                    <h3>Conditions</h3>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="modalOverrideOperator" value="any" ${!override?.deletion_rules?.operator || override.deletion_rules.operator === 'any' ? 'checked' : ''}> Any (OR)</label>
                        <label class="radio-label"><input type="radio" name="modalOverrideOperator" value="all" ${override?.deletion_rules?.operator === 'all' ? 'checked' : ''}> All (AND)</label>
                    </div>
                </div>
                <div id="modalOverrideConditionsList" class="conditions-list"></div>
                <button id="modalAddOverrideConditionBtn" class="secondary-btn"><i class="fas fa-plus"></i> Add Condition</button>
            </div>
            ${advancedFieldsHtml}
        `

        let modalConditions = override?.deletion_rules?.conditions
            ? override.deletion_rules.conditions.map((c) => ({ ...c }))
            : []

        function renderModalConditions() {
            const container = document.getElementById('modalOverrideConditionsList')
            if (!container) return
            container.innerHTML = ''
            modalConditions.forEach((cond, idx) => {
                const row = document.createElement('div')
                row.className = 'condition-row'
                const typeSelect = document.createElement('select')
                Object.keys(conditionTypes).forEach((type) => {
                    const opt = document.createElement('option')
                    opt.value = type
                    opt.textContent = conditionTypes[type].label
                    if (type === cond.type) opt.selected = true
                    typeSelect.appendChild(opt)
                })
                typeSelect.addEventListener('change', (e) => {
                    cond.type = e.target.value
                    cond.threshold = conditionTypes[cond.type].default
                    thresholdInput.value = cond.threshold
                    thresholdInput.step = conditionTypes[cond.type].step
                })

                const thresholdInput = document.createElement('input')
                thresholdInput.type = 'number'
                thresholdInput.step = conditionTypes[cond.type].step
                thresholdInput.value = cond.threshold
                thresholdInput.addEventListener(
                    'change',
                    (e) => (cond.threshold = parseFloat(e.target.value))
                )

                const removeBtn = document.createElement('button')
                removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'
                removeBtn.className = 'remove-condition'
                removeBtn.addEventListener('click', () => {
                    modalConditions.splice(idx, 1)
                    renderModalConditions()
                })

                row.appendChild(typeSelect)
                row.appendChild(thresholdInput)
                row.appendChild(removeBtn)
                container.appendChild(row)
            })
            const addBtn = document.getElementById('modalAddOverrideConditionBtn')
            if (addBtn) {
                const used = modalConditions.map((c) => c.type)
                addBtn.style.display = getAvailableTypes(used).length === 0 ? 'none' : 'block'
            }
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
                              } else {
                                  return false
                              }
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
                                document.querySelector(
                                    'input[name="modalOverrideOperator"]:checked'
                                )?.value || 'any'
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

                        // Add advanced fields if they exist
                        const uploadAmountEl = document.getElementById('modalOverrideUploadAmount')
                        if (uploadAmountEl)
                            newOverride.upload_amount_bytes =
                                parseInt(uploadAmountEl.value, 10) || 0
                        const minSeedersEl = document.getElementById('modalOverrideMinSeeders')
                        if (minSeedersEl)
                            newOverride.min_seeders = parseInt(minSeedersEl.value, 10) || 0

                        if (isEdit) {
                            arrOverrides[editingIndex] = newOverride
                        } else {
                            arrOverrides.push(newOverride)
                        }

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
                const policySelect = document.getElementById('modalOverrideDeletePolicy')
                const rulesContainer = document.getElementById('modalOverrideRulesContainer')
                if (policySelect && rulesContainer) {
                    rulesContainer.style.display =
                        policySelect.value === 'calculated' ? 'block' : 'none'
                    policySelect.addEventListener('change', () => {
                        rulesContainer.style.display =
                            policySelect.value === 'calculated' ? 'block' : 'none'
                    })
                }
                renderModalConditions()
                document
                    .getElementById('modalAddOverrideConditionBtn')
                    ?.addEventListener('click', () => {
                        const used = modalConditions.map((c) => c.type)
                        const available = getAvailableTypes(used)
                        if (available.length === 0) return
                        modalConditions.push({
                            type: available[0],
                            threshold: conditionTypes[available[0]].default,
                        })
                        renderModalConditions()
                    })
            })
        })
    }

    // ---- Load / Save ----
    async function load() {
        const config = await loadConfig()
        arrClients = config.arrs || []

        // UI Preferences
        const uiPrefs = config.ui_preferences || {}
        showAdvancedToggle.checked = uiPrefs.show_advanced || false
        toggleAdvancedFields(showAdvancedToggle.checked)

        // Successful Torrents
        const defaults = config.defaults || {}

        successIdleSeconds.value = defaults.idle_seconds || 3600
        successAvailabilitySeconds.value = defaults.no_availability_seconds || 7200

        policyModeSelect.value = defaults.delete_policy || 'none'
        uploadAmountInput.value = defaults.upload_amount_bytes || 0
        minSeedersInput.value = defaults.min_seeders || 0

        if (defaults.delete_policy === 'calculated' && defaults.deletion_rules) {
            operatorRadios.forEach((r) => {
                if (r.value === defaults.deletion_rules.operator) r.checked = true
            })
            conditions = defaults.deletion_rules.conditions.map((c) => ({ ...c }))
            renderConditions()
        } else {
            conditions = []
            renderConditions()
        }
        toggleRulesVisibility()

        // Problematic Torrents
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

        // General Cleanup
        const cleanup = config.general_cleanup || {}
        torrentAgeDays.value = cleanup.torrent_age_days || 0

        // Overrides
        const rawOverrides = config.arrs_overrides?.deletion || []
        arrOverrides = rawOverrides.map((ov) => ({ ...ov, arr_id: ov.arr_id || ov.arrId }))
        renderOverrides()

        // Initialize duration helpers on all duration inputs
        initDurationInputs(document.querySelector('.settings-container') || document)
        initByteInputs(document.querySelector('.settings-container') || document)
        clearFieldErrorOnInput()
    }

    async function saveSuccessful() {
        const defaults = {
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
                          operator:
                              document.querySelector('input[name="operator"]:checked')?.value ||
                              'any',
                          conditions: conditions.map((c) => ({
                              type: c.type,
                              threshold: c.threshold,
                          })),
                      }
                    : undefined,
        }

        const errors = validateDefaultsSection(defaults)
        if (errors.length > 0) {
            displayFormErrors(errors)
            showToast('Please correct the highlighted fields.', 'error')
            return
        }

        const config = await loadConfig()
        if (!config.defaults) config.defaults = {}
        Object.assign(config.defaults, defaults)
        if (policyModeSelect.value !== 'calculated') {
            delete config.defaults.deletion_rules
        }
        await saveConfig(config)
        showButtonFeedback(saveSuccessfulBtn, 'success', {
            successText: 'Saved',
            originalText: 'Save Settings',
        })
    }

    async function saveProblematic() {
        const problematic = {
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

        const errors = validateProblematicSection(problematic)
        if (errors.length > 0) {
            displayFormErrors(errors)
            showToast('Please correct the highlighted fields.', 'error')
            return
        }

        const config = await loadConfig()
        config.problematic_torrents = problematic
        await saveConfig(config)
        showButtonFeedback(saveProblematicBtn, 'success', {
            successText: 'Saved',
            originalText: 'Save Settings',
        })
    }

    async function saveCleanup() {
        const cleanup = {
            torrent_age_days: parseInt(torrentAgeDays.value, 10) || 0,
        }

        const errors = validateGeneralCleanupSection(cleanup)
        if (errors.length > 0) {
            displayFormErrors(errors)
            showToast('Please correct the highlighted fields.', 'error')
            return
        }

        const config = await loadConfig()
        config.general_cleanup = {
            torrent_age_days: parseInt(torrentAgeDays.value, 10) || 0,
        }
        await saveConfig(config)
        showButtonFeedback(saveCleanupBtn, 'success', {
            successText: 'Saved',
            originalText: 'Save Settings',
        })
    }

    async function saveUiPreferences() {
        const config = await loadConfig()
        if (!config.ui_preferences) config.ui_preferences = {}
        config.ui_preferences.show_advanced = showAdvancedToggle.checked
        await saveConfig(config)
    }

    // ---- Event Listeners ----
    policyModeSelect.addEventListener('change', toggleRulesVisibility)
    addConditionBtn.addEventListener('click', addCondition)
    saveSuccessfulBtn.addEventListener('click', saveSuccessful)

    enableIdle.addEventListener('change', toggleProblematicFields)
    enableAvailability.addEventListener('change', toggleProblematicFields)
    enableStalled.addEventListener('change', toggleProblematicFields)
    enableSlowSpeed.addEventListener('change', toggleProblematicFields)
    saveProblematicBtn.addEventListener('click', saveProblematic)

    if (saveCleanupBtn) saveCleanupBtn.addEventListener('click', saveCleanup)

    addArrOverrideBtn.addEventListener('click', () => openOverrideModal(-1))

    showAdvancedToggle.addEventListener('change', () => {
        toggleAdvancedFields(showAdvancedToggle.checked)
        saveUiPreferences()
    })

    load()
}
