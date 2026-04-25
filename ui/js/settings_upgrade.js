// ui/js/settings_upgrade.js
import { displayFormErrors } from './configValidator.js'
import { escapeHtml } from './utils.js'

export function initUpgradeForm(loadConfig, saveConfig) {
    console.log('Initialising Upgrade Handling form')

    const globalAction = document.getElementById('globalUpgradeAction')
    const globalCategoryGroup = document.getElementById('globalUpgradeCategoryGroup')
    const globalCategoryInput = document.getElementById('globalUpgradeCategory')
    const saveGlobalBtn = document.getElementById('saveUpgradeGlobalBtn')
    const overridesList = document.getElementById('upgradeOverridesList')

    let arrClients = []
    let upgradeOverrides = []

    function toggleGlobalCategory() {
        globalCategoryGroup.style.display = globalAction.value === 'move_category' ? 'grid' : 'none'
    }

    // Helper to clear error on input
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

    // ---- Override cards rendering ----
    function getActionSummary(override) {
        const action = override.upgrade_action
        if (action === 'do_nothing') return 'Do nothing'
        if (action === 'move_category') return `Move to: ${override.upgrade_category || 'upgraded'}`
        if (action === 'delete_immediate') return 'Delete immediately'
        return 'Unknown'
    }

    function renderOverrides() {
        if (!overridesList) return
        overridesList.innerHTML = ''
        upgradeOverrides.forEach((override, idx) => {
            const arr = arrClients.find((a) => a.id === override.arr_id)
            const arrName = arr ? arr.name : override.arr_id
            const actionSummary = getActionSummary(override)
            const statusBadge =
                override.enabled !== false
                    ? '<span class="status-badge enabled">Enabled</span>'
                    : '<span class="status-badge disabled">Disabled</span>'

            const card = document.createElement('div')
            card.className = 'client-card'
            card.setAttribute('role', 'listitem')
            card.dataset.index = idx
            card.innerHTML = `
                <div class="card-header">
                    <div class="client-name">${escapeHtml(arrName)}</div>
                </div>
                <div class="card-body">
                    <div class="policy-details">
                        <span class="chip policy-tag">${escapeHtml(actionSummary)}</span>
                    </div>
                </div>
                <div class="card-footer">
                    <div></div>
                    ${statusBadge}
                </div>
            `
            card.addEventListener('click', () => openOverrideModal(idx))
            overridesList.appendChild(card)
        })

        const overriddenIds = upgradeOverrides.map((o) => o.arr_id)
        const availableArrs = arrClients.filter((arr) => !overriddenIds.includes(arr.id))
        if (availableArrs.length > 0) {
            const addCard = document.createElement('div')
            addCard.className = 'client-card add-card'
            addCard.setAttribute('role', 'button')
            addCard.setAttribute('tabindex', '0')
            addCard.setAttribute('aria-label', 'Add ARR override')
            addCard.innerHTML = `<i class="fas fa-plus-circle" aria-hidden="true"></i><span>Add override</span>`
            addCard.addEventListener('click', () => openOverrideModal(-1))
            addCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openOverrideModal(-1)
                }
            })
            overridesList.appendChild(addCard)
        }
    }

    function openOverrideModal(index) {
        const isEdit = index !== -1
        const override = isEdit ? upgradeOverrides[index] : null
        const editingIndex = index

        const availableArrs = isEdit
            ? [arrClients.find((a) => a.id === override.arr_id)]
            : arrClients.filter((arr) => !upgradeOverrides.some((o) => o.arr_id === arr.id))

        if (availableArrs.length === 0 && !isEdit) {
            showToast('All ARR clients already have overrides.', 'error')
            return
        }

        let arrOptions = ''
        availableArrs.forEach((arr) => {
            arrOptions += `<option value="${escapeHtml(arr.id)}" ${isEdit ? 'selected' : ''}>${escapeHtml(arr.name)}</option>`
        })

        const bodyHtml = `
            <div class="form-group">
                <label for="modalOverrideArrId">ARR Client</label>
                <select id="modalOverrideArrId" ${isEdit ? 'disabled' : ''} aria-label="Select ARR client">${arrOptions}</select>
            </div>
            <div class="checkbox-row">
                <input type="checkbox" id="modalOverrideEnabled" ${!isEdit || override.enabled !== false ? 'checked' : ''}>
                <label for="modalOverrideEnabled">Enabled</label>
            </div>
            <div class="form-group">
                <label for="modalOverrideAction">Upgrade Action</label>
                <select id="modalOverrideAction" aria-label="Select upgrade action">
                    <option value="do_nothing" ${override?.upgrade_action === 'do_nothing' ? 'selected' : ''}>Do nothing</option>
                    <option value="move_category" ${override?.upgrade_action === 'move_category' ? 'selected' : ''}>Move to category</option>
                    <option value="delete_immediate" ${override?.upgrade_action === 'delete_immediate' ? 'selected' : ''}>Delete immediately</option>
                </select>
            </div>
            <div class="form-group" id="modalOverrideCategoryGroup" style="display: ${override?.upgrade_action === 'move_category' ? 'block' : 'none'};">
                <label for="modalOverrideCategory">Upgrade Category</label>
                <input type="text" id="modalOverrideCategory" value="${escapeHtml(override?.upgrade_category || 'upgraded')}" aria-label="Category name">
            </div>
        `

        openModal({
            title: isEdit ? 'Edit Upgrade Override' : 'Add Upgrade Override',
            bodyHtml,
            leftButtons: isEdit
                ? [
                      {
                          text: 'Delete',
                          class: 'danger-btn',
                          onClick: async () => {
                              if (await confirmAction('config', 'Delete this override?')) {
                                  upgradeOverrides.splice(editingIndex, 1)
                                  await persistOverrides()
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
                        const action = document.getElementById('modalOverrideAction').value
                        const category =
                            document.getElementById('modalOverrideCategory')?.value || ''

                        const newOverride = {
                            arr_id: arrId,
                            enabled,
                            upgrade_action: action,
                            upgrade_category: action === 'move_category' ? category : '',
                        }

                        if (isEdit) {
                            upgradeOverrides[editingIndex] = newOverride
                        } else {
                            upgradeOverrides.push(newOverride)
                        }
                        await persistOverrides()
                        renderOverrides()
                        showToast('Override saved', 'success')
                    },
                },
            ],
            onClose: () => {},
        })

        // Use requestAnimationFrame to ensure DOM is fully updated after modal insertion
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const actionSelect = document.getElementById('modalOverrideAction')
                const categoryGroup = document.getElementById('modalOverrideCategoryGroup')
                if (actionSelect && categoryGroup) {
                    // Set initial visibility
                    categoryGroup.style.display =
                        actionSelect.value === 'move_category' ? 'block' : 'none'
                    // Attach change listener
                    actionSelect.addEventListener('change', () => {
                        categoryGroup.style.display =
                            actionSelect.value === 'move_category' ? 'block' : 'none'
                    })
                }
            })
        })
    }

    async function persistOverrides() {
        const config = await loadConfig()
        if (!config.arrs_overrides) config.arrs_overrides = {}
        config.arrs_overrides.upgrade = upgradeOverrides
        await saveConfig(config)
    }

    async function load() {
        const config = await loadConfig()
        arrClients = config.arrs || []

        const defaults = config.defaults || {}
        globalAction.value = defaults.upgrade_action || 'move_category'
        globalCategoryInput.value = defaults.upgrade_category || 'upgraded'
        toggleGlobalCategory()

        upgradeOverrides = config.arrs_overrides?.upgrade || []
        upgradeOverrides = upgradeOverrides.map((ov) => ({ ...ov, arr_id: ov.arr_id || ov.arrId }))
        renderOverrides()

        clearFieldErrorOnInput()
    }

    async function saveGlobal() {
        const action = globalAction.value
        const category = globalCategoryInput.value.trim()

        const errors = []
        if (action === 'move_category' && !category) {
            errors.push({
                field: 'defaults.upgrade_category',
                message: 'Category is required when action is "Move to category"',
            })
        }

        if (errors.length > 0) {
            displayFormErrors(errors)
            showToast('Please correct the highlighted fields.', 'error')
            return
        }

        const config = await loadConfig()
        if (!config.defaults) config.defaults = {}
        config.defaults.upgrade_action = action
        config.defaults.upgrade_category = action === 'move_category' ? category : ''
        try {
            await saveConfig(config)
            showButtonFeedback(saveGlobalBtn, 'success', {
                successText: 'Saved',
                originalText: 'Save Settings',
            })
        } catch (err) {
            showButtonFeedback(saveGlobalBtn, 'error', {
                errorText: 'Not saved',
                originalText: 'Save Settings',
            })
            showToast(`Save failed: ${err.message}`, 'error')
        }
    }

    globalAction.addEventListener('change', toggleGlobalCategory)
    saveGlobalBtn.addEventListener('click', saveGlobal)
    load()
}
