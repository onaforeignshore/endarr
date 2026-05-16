// ui/js/conditionUtils.js
// Shared logic for rendering and managing condition rows (ratio/time)

export const conditionTypes = {
    ratio: {
        label: 'Minimum Ratio',
        shortLabel: 'Min Ratio',
        default: 2.0,
        step: 0.1,
        unit: '',
    },
    time: {
        label: 'Seed Time',
        shortLabel: 'Seed Time',
        default: 86400,
        step: 1,
        unit: 'sec',
    },
}

/**
 * Get an array of condition type keys that are not yet used.
 * @param {string[]} usedTypes - Array of type keys already in use.
 * @returns {string[]} Available type keys.
 */
export function getAvailableTypes(usedTypes) {
    return Object.keys(conditionTypes).filter((t) => !usedTypes.includes(t))
}

/**
 * Create a DOM element for a single condition row.
 * @param {Object} condition - Condition object with type and threshold.
 * @param {number} index - Index of the condition (for event handlers).
 * @param {Function} onUpdate - Callback when type or threshold changes (receives new condition object).
 * @param {Function} onDelete - Callback when delete button is clicked (receives index).
 * @param {string} wrapperClass - CSS class for the wrapper div (e.g., 'condition-row' or 'condition-card').
 * @returns {HTMLDivElement} The condition row element.
 */
export function createConditionRow(condition, index, onUpdate, onDelete, wrapperClass = 'condition-row') {
    const row = document.createElement('div')
    row.className = wrapperClass

    // Type select
    const typeSelect = document.createElement('select')
    Object.keys(conditionTypes).forEach((type) => {
        const opt = document.createElement('option')
        opt.value = type
        opt.textContent = conditionTypes[type].label
        if (type === condition.type) opt.selected = true
        typeSelect.appendChild(opt)
    })
    typeSelect.addEventListener('change', (e) => {
        const newType = e.target.value
        const newThreshold = conditionTypes[newType].default
        thresholdInput.value = newThreshold
        thresholdInput.step = conditionTypes[newType].step
        onUpdate(index, { type: newType, threshold: newThreshold })
    })

    // Threshold input
    const thresholdInput = document.createElement('input')
    thresholdInput.type = 'number'
    thresholdInput.step = conditionTypes[condition.type].step
    thresholdInput.value = condition.threshold
    thresholdInput.addEventListener('change', (e) => {
        const newThreshold = parseFloat(e.target.value)
        onUpdate(index, { type: condition.type, threshold: newThreshold })
    })

    // Delete button
    const removeBtn = document.createElement('button')
    removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'
    removeBtn.className = 'remove-condition'
    removeBtn.addEventListener('click', () => onDelete(index))

    row.appendChild(typeSelect)
    row.appendChild(thresholdInput)
    row.appendChild(removeBtn)
    return row
}

/**
 * Render a list of conditions into a container.
 * @param {HTMLElement} container - The container element.
 * @param {Array} conditions - Array of condition objects.
 * @param {Function} onUpdate - Callback when any condition changes (receives new conditions array).
 * @param {string} wrapperClass - CSS class for each condition row.
 */
export function renderConditionList(container, conditions, onUpdate, wrapperClass = 'condition-row') {
    container.innerHTML = ''
    if (!conditions.length) return

    conditions.forEach((cond, idx) => {
        const row = createConditionRow(
            cond,
            idx,
            (i, newCond) => {
                conditions[i] = newCond
                onUpdate([...conditions])
            },
            (i) => {
                conditions.splice(i, 1)
                onUpdate([...conditions])
            },
            wrapperClass
        )
        container.appendChild(row)
    })
}

/**
 * Enable/disable the add condition button based on available types.
 * @param {HTMLButtonElement} addButton - The add button element.
 * @param {Array} conditions - Current conditions array.
 */
export function updateAddButtonState(addButton, conditions) {
    if (!addButton) return
    const used = conditions.map(c => c.type)
    addButton.disabled = getAvailableTypes(used).length === 0
}

/**
 * Add a new condition with the first available type.
 * @param {Array} conditions - Current conditions array (will be mutated).
 * @param {Function} onUpdate - Callback after adding (receives new conditions array).
 * @returns {boolean} True if a condition was added, false if no types available.
 */
export function addCondition(conditions, onUpdate) {
    const used = conditions.map(c => c.type)
    const available = getAvailableTypes(used)
    if (available.length === 0) return false
    conditions.push({ type: available[0], threshold: conditionTypes[available[0]].default })
    onUpdate([...conditions])
    return true
}