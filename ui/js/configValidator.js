// ui/js/configValidator.js
// Shared configuration validation rules and error display utilities

import { escapeHtml, formatBytes, formatDuration } from './utils.js'

/**
 * Validates a non‑negative integer.
 * @param {any} value - The value to validate.
 * @param {string} field - Field path (e.g., 'defaults.ratio_goal').
 * @param {boolean} allowZero - Whether zero is allowed (default true).
 * @returns {string|null} Error message or null if valid.
 */
export function validatePositiveInt(value, field, allowZero = true) {
    const num = Number(value)
    if (isNaN(num) || !Number.isInteger(num)) {
        return `${field}: Must be a whole number`
    }
    if (allowZero ? num < 0 : num <= 0) {
        return `${field}: Must be ${allowZero ? 'non‑negative' : 'positive'}`
    }
    return null
}

/**
 * Validates a non‑negative float.
 */
export function validatePositiveFloat(value, field, allowZero = true) {
    const num = parseFloat(value)
    if (isNaN(num)) {
        return `${field}: Must be a number`
    }
    if (allowZero ? num < 0 : num <= 0) {
        return `${field}: Must be ${allowZero ? 'non‑negative' : 'positive'}`
    }
    return null
}

/**
 * Validates progress (0.0 – 1.0).
 */
export function validateProgress(value, field) {
    const num = parseFloat(value)
    if (isNaN(num)) {
        return `${field}: Must be a number`
    }
    if (num < 0 || num > 1) {
        return `${field}: Must be between 0 and 1`
    }
    return null
}

/**
 * Validates a condition threshold based on its type.
 */
export function validateConditionThreshold(type, value, field) {
    if (type === 'ratio') {
        return validatePositiveFloat(value, field)
    } else if (type === 'time') {
        return validatePositiveInt(value, field)
    }
    return null
}

// ----------------------------------------------------------------------------
// Section‑specific validators
// ----------------------------------------------------------------------------

/**
 * Validate successful torrents (defaults) section.
 * @param {Object} defaults - The defaults config object from the form.
 * @returns {Array<{field: string, message: string}>}
 */
export function validateDefaultsSection(defaults) {
    const errors = []

    const checks = [
        {
            field: 'defaults.ratio_goal',
            value: defaults.ratio_goal,
            validator: (v) => validatePositiveFloat(v, 'defaults.ratio_goal'),
        },
        {
            field: 'defaults.seed_time_seconds',
            value: defaults.seed_time_seconds,
            validator: (v) => validatePositiveInt(v, 'defaults.seed_time_seconds'),
        },
        {
            field: 'defaults.upload_amount_bytes',
            value: defaults.upload_amount_bytes,
            validator: (v) => validatePositiveInt(v, 'defaults.upload_amount_bytes'),
        },
        {
            field: 'defaults.min_seeders',
            value: defaults.min_seeders,
            validator: (v) => validatePositiveInt(v, 'defaults.min_seeders'),
        },
        {
            field: 'defaults.idle_seconds',
            value: defaults.idle_seconds,
            validator: (v) => validatePositiveInt(v, 'defaults.idle_seconds'),
        },
        {
            field: 'defaults.no_availability_seconds',
            value: defaults.no_availability_seconds,
            validator: (v) => validatePositiveInt(v, 'defaults.no_availability_seconds'),
        },
    ]

    checks.forEach(({ field, value, validator }) => {
        const err = validator(value)
        if (err) errors.push({ field, message: err })
    })

    // Validate deletion rules conditions
    const deletionRules = defaults.deletion_rules
    if (deletionRules && deletionRules.conditions) {
        deletionRules.conditions.forEach((cond, idx) => {
            const err = validateConditionThreshold(
                cond.type,
                cond.threshold,
                `defaults.deletion_rules.conditions[${idx}]`
            )
            if (err)
                errors.push({ field: `defaults.deletion_rules.conditions[${idx}]`, message: err })
        })
    }

    return errors
}

/**
 * Validate problematic torrents section.
 */
export function validateProblematicSection(problematic) {
    const errors = []

    const checks = [
        {
            field: 'problematic_torrents.idle_seconds',
            value: problematic.idle_seconds,
            validator: (v) => validatePositiveInt(v, 'problematic_torrents.idle_seconds'),
        },
        {
            field: 'problematic_torrents.availability_seconds',
            value: problematic.availability_seconds,
            validator: (v) => validatePositiveInt(v, 'problematic_torrents.availability_seconds'),
        },
        {
            field: 'problematic_torrents.stalled_min_age',
            value: problematic.stalled_min_age,
            validator: (v) => validatePositiveInt(v, 'problematic_torrents.stalled_min_age'),
        },
        {
            field: 'problematic_torrents.stalled_min_progress',
            value: problematic.stalled_min_progress,
            validator: (v) => validateProgress(v, 'problematic_torrents.stalled_min_progress'),
        },
        {
            field: 'problematic_torrents.stalled_strike_threshold',
            value: problematic.stalled_strike_threshold,
            validator: (v) =>
                validatePositiveInt(v, 'problematic_torrents.stalled_strike_threshold', false),
        },
        {
            field: 'problematic_torrents.slow_speed_kb',
            value: problematic.slow_speed_kb,
            validator: (v) => validatePositiveInt(v, 'problematic_torrents.slow_speed_kb'),
        },
        {
            field: 'problematic_torrents.slow_speed_duration',
            value: problematic.slow_speed_duration,
            validator: (v) => validatePositiveInt(v, 'problematic_torrents.slow_speed_duration'),
        },
        {
            field: 'problematic_torrents.max_download_time_hours',
            value: problematic.max_download_time_hours,
            validator: (v) =>
                validatePositiveInt(v, 'problematic_torrents.max_download_time_hours'),
        },
    ]

    checks.forEach(({ field, value, validator }) => {
        const err = validator(value)
        if (err) errors.push({ field, message: err })
    })

    return errors
}

/**
 * Validate general cleanup section.
 */
export function validateGeneralCleanupSection(cleanup) {
    const errors = []
    const err = validatePositiveInt(cleanup.torrent_age_days, 'general_cleanup.torrent_age_days')
    if (err) errors.push({ field: 'general_cleanup.torrent_age_days', message: err })
    return errors
}

// ----------------------------------------------------------------------------
// Error display utility
// ----------------------------------------------------------------------------

/**
 * Display inline validation errors on a form.
 * @param {Array<{field: string, message: string}>} errors - Validation errors.
 * @param {HTMLElement} container - Container element to scope the search (default document).
 */
export function displayFormErrors(errors, container = document) {
    // Clear all existing error states
    container.querySelectorAll('.input-error').forEach((el) => {
        el.classList.remove('input-error')
        el.removeAttribute('aria-describedby')
    })
    container.querySelectorAll('.error-message').forEach((el) => {
        el.style.display = 'none'
        el.textContent = ''
    })

    errors.forEach(({ field, message }) => {
        const input = container.querySelector(`[data-field="${field}"]`)
        if (input) {
            input.classList.add('input-error')

            // Find the corresponding error container
            const errorId = input.id + 'Error'
            const errorDiv = document.getElementById(errorId)
            if (errorDiv) {
                errorDiv.innerHTML = `<i class="fas fa-exclamation-circle" aria-hidden="true"></i> ${escapeHtml(message)}`
                errorDiv.style.display = 'flex'
                input.setAttribute('aria-describedby', errorId)
            } else {
                console.warn(`Error container #${errorId} not found`)
            }
        } else {
            console.warn(`Field "${field}" not found in DOM`)
        }
    })
}

/**
 * Initialise helper text for numeric inputs with data-numeric-helper attribute.
 * Creates/updates a .helper-text span and formats the value based on data-unit,
 * data-percentage, and data-zero-label.
 * @param {HTMLElement} [container=document] - Container to scan for inputs.
 */
export function initNumericHelpers(container = document) {
    container.querySelectorAll('[data-numeric-helper]').forEach((input) => {
        // Find or create helper span
        let helper = input.nextElementSibling?.classList.contains('helper-text')
            ? input.nextElementSibling
            : null
        if (!helper && input.parentNode?.classList.contains('input-wrapper')) {
            helper = input.parentNode.querySelector('.helper-text')
        }
        if (!helper) {
            helper = document.createElement('span')
            helper.className = 'helper-text'
            if (input.parentNode?.classList.contains('input-wrapper')) {
                input.parentNode.appendChild(helper)
            } else {
                input.insertAdjacentElement('afterend', helper)
            }
        }
        const unit = input.dataset.unit
        const isPercentage = input.dataset.percentage !== undefined
        const zeroLabel = input.dataset.zeroLabel
        const updateHelper = () => {
            let val = parseFloat(input.value)
            if (isNaN(val)) val = 0
            if (val === 0 && zeroLabel !== undefined) {
                helper.textContent = `(${zeroLabel})`
                return
            }
            if (val === 0) {
                helper.textContent = ''
                return
            }
            if (unit === 'seconds') {
                helper.textContent = `(${formatDuration(val)})`
            } else if (unit === 'bytes') {
                helper.textContent = `(${formatBytes(val)})`
            } else if (isPercentage) {
                const percent = val > 1 ? val : Math.round(val * 100)
                helper.textContent = `(${percent}%)`
            } else {
                helper.textContent = ''
            }
        }
        input.addEventListener('input', updateHelper)
        updateHelper()
    })
}
