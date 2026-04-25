// ui/js/configValidator.js
// Shared configuration validation rules and error display utilities

import { escapeHtml } from './utils.js'

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

// Parse duration string (e.g., "2h", "90m", "1d 3h") to seconds
export function parseDurationToSeconds(value) {
    if (typeof value === 'number') return value
    if (!value || typeof value !== 'string') return null
    const trimmed = value.trim().toLowerCase()
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)

    let total = 0
    const regex = /(\d+)\s*([dhms])?/g
    let match
    while ((match = regex.exec(trimmed)) !== null) {
        const num = parseInt(match[1], 10)
        const unit = match[2] || 's'
        if (unit === 'd') total += num * 86400
        else if (unit === 'h') total += num * 3600
        else if (unit === 'm') total += num * 60
        else total += num
    }
    return total > 0 ? total : null
}

// Format seconds to human readable (e.g., "1h 30m")
export function formatSeconds(seconds) {
    if (!seconds || seconds < 0) return '0s'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    const parts = []
    if (days) parts.push(`${days}d`)
    if (hours) parts.push(`${hours}h`)
    if (minutes) parts.push(`${minutes}m`)
    if (secs || parts.length === 0) parts.push(`${secs}s`)
    return parts.join(' ')
}

// Initialize duration inputs with blur handler and helper display
// Initialize duration inputs: parse on blur, update existing helper span
export function initDurationInputs(container = document) {
    container.querySelectorAll('[data-duration]').forEach((input) => {
        // Find the associated helper span (assumes it's the next .helper-text sibling)
        const helper = input.parentNode?.querySelector('.helper-text')

        const updateHelper = () => {
            const seconds = parseInt(input.value, 10)
            if (!isNaN(seconds) && helper) {
                helper.textContent = `(${formatSeconds(seconds)})`
            }
        }
        updateHelper()

        // Remove existing listener to avoid duplicates, then attach new one
        input.removeEventListener('blur', input._durationBlurHandler)
        const blurHandler = () => {
            const parsed = parseDurationToSeconds(input.value)
            if (parsed !== null) {
                input.value = parsed
                updateHelper()
            }
        }
        input._durationBlurHandler = blurHandler
        input.addEventListener('blur', blurHandler)
    })
}

// Parse byte string (e.g., "10GB", "500MB", "2KB") to bytes
export function parseBytesToNumber(value) {
    if (typeof value === 'number') return value
    if (!value || typeof value !== 'string') return null
    const trimmed = value.trim().toLowerCase()
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?b?)$/)
    if (!match) return null
    const num = parseFloat(match[1])
    const unit = match[2].replace('b', '')
    const multipliers = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }
    return Math.round(num * (multipliers[unit] || 1))
}

// Format bytes to human readable (e.g., "10 GB")
export function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)
    return `${val} ${units[i]}`
}

// Initialize byte inputs: parse on blur, update existing helper span
export function initByteInputs(container = document) {
    container.querySelectorAll('[data-byte-input]').forEach((input) => {
        const helper = input.parentNode?.querySelector('.helper-text')

        const updateHelper = () => {
            const bytes = parseInt(input.value, 10)
            if (!isNaN(bytes) && helper) {
                helper.textContent = `(${formatBytes(bytes)})`
            }
        }
        updateHelper()

        input.removeEventListener('blur', input._byteBlurHandler)
        const blurHandler = () => {
            const parsed = parseBytesToNumber(input.value)
            if (parsed !== null) {
                input.value = parsed
                updateHelper()
            }
        }
        input._byteBlurHandler = blurHandler
        input.addEventListener('blur', blurHandler)
    })
}
