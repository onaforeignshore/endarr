// ui/js/ui-helpers.js – toast, confirmation, feedback utilities
import { getApiKey, consoleDebug } from './utils.js'

// ── Toast container (created once) ──
let toastContainer = null

function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div')
        toastContainer.className = 'toast-container'
        document.body.appendChild(toastContainer)
    }
}

/**
 * Show a stacked toast notification.
 * @param {string} message - The message to display.
 * @param {string} [type='success'] - Toast type: 'success', 'error', or 'info'.
 * @param {number|null} [duration=null] - Duration in milliseconds (overrides config).
 */
export function showToast(message, type = 'success', duration = null) {
    ensureToastContainer()
    const configDuration = window.uiPreferences?.toast_duration_seconds || 5
    const finalDuration = duration !== null ? duration : configDuration * 1000

    // Suppress duplicate visible messages
    const existing = toastContainer.querySelectorAll('.toast')
    for (const toast of existing) {
        if (toast.dataset.message === message && toast.dataset.type === type) return
    }

    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.dataset.message = message
    toast.dataset.type = type
    const icon =
        type === 'success'
            ? 'fa-check-circle'
            : type === 'error'
            ? 'fa-exclamation-circle'
            : 'fa-info-circle'
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span><button class="toast-close" aria-label="Dismiss">&times;</button>`

    toastContainer.appendChild(toast)

    const MAX_TOASTS = 3
    while (toastContainer.children.length > MAX_TOASTS) {
        toastContainer.removeChild(toastContainer.firstChild)
    }

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove())

    setTimeout(() => {
        if (toast.parentNode) toast.remove()
    }, finalDuration)
}

/**
 * Show a confirmation modal and return user's choice.
 * @param {string} message - The confirmation message.
 * @returns {Promise<boolean>} True if OK, false if Cancel.
 */
export function showConfirm(message) {
    const previousFocus = document.activeElement
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal')
        const msgSpan = document.getElementById('confirmModalMessage')
        const okBtn = document.getElementById('confirmModalOk')
        const cancelBtn = document.getElementById('confirmModalCancel')
        const closeBtn = document.getElementById('confirmModalClose')

        msgSpan.innerText = message
        modal.style.display = 'flex'
        modal.setAttribute('aria-hidden', 'false')

        const globalModal = document.getElementById('globalModal')
        const globalEscapeHandler = globalModal._escapeHandler
        if (globalEscapeHandler) {
            document.removeEventListener('keydown', globalEscapeHandler)
        }

        const cleanup = () => {
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus()
            } else {
                document.body.focus()
            }
            modal.style.display = 'none'
            modal.setAttribute('aria-hidden', 'true')
            okBtn.removeEventListener('click', okHandler)
            cancelBtn.removeEventListener('click', cancelHandler)
            closeBtn.removeEventListener('click', cancelHandler)
            document.removeEventListener('keydown', escHandler)
            if (globalEscapeHandler) {
                document.addEventListener('keydown', globalEscapeHandler)
            }
        }

        const okHandler = () => {
            cleanup()
            resolve(true)
        }
        const cancelHandler = () => {
            cleanup()
            resolve(false)
        }
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                cancelHandler()
            }
        }

        okBtn.addEventListener('click', okHandler)
        cancelBtn.addEventListener('click', cancelHandler)
        closeBtn.addEventListener('click', cancelHandler)
        document.addEventListener('keydown', escHandler)
        modal.focus()
    })
}

/**
 * Confirm an action based on user preferences.
 * @param {string} type - 'data' or 'config' – determines which preference to check.
 * @param {string} message - The confirmation message.
 * @returns {Promise<boolean>} True if confirmed (or confirmation disabled), false otherwise.
 */
export async function confirmAction(type, message) {
    const key = getApiKey()
    if (!key) return false

    try {
        const resp = await fetch('/api/v1/config', { headers: { 'X-Api-Key': key } })
        if (!resp.ok) return false
        const config = await resp.json()
        const uiPrefs = config.ui_preferences || {}

        if (type === 'data' && !uiPrefs.confirm_data_deletion) return true
        if (type === 'config' && !uiPrefs.confirm_config_modification) return true

        return await showConfirm(message)
    } catch {
        return await showConfirm(message)
    }
}

/**
 * Show feedback on a button (text change, colour) for a short duration.
 * @param {HTMLElement} button - The button element.
 * @param {string} state - 'success' or 'error'.
 * @param {Object} [options] - Optional settings.
 * @param {number} [options.duration=2000] - Duration in ms.
 * @param {string|null} [options.successText] - Text to show on success.
 * @param {string|null} [options.errorText] - Text to show on error.
 * @param {string|null} [options.originalText] - Original button text to restore.
 */
export function showButtonFeedback(button, state, options = {}) {
    const { duration = 2000, successText = null, errorText = null, originalText = null } = options
    button.classList.remove('success', 'error')
    button.classList.add(state)

    const textSpan = button.querySelector('.btn-text')
    if (textSpan) {
        if (state === 'success' && successText) textSpan.textContent = successText
        else if (state === 'error' && errorText) textSpan.textContent = errorText
    }

    setTimeout(() => {
        button.classList.remove('success', 'error')
        if (textSpan && originalText) textSpan.textContent = originalText
    }, duration)
}

/**
 * Show an icon‑based feedback on a button (icon changes).
 * @param {HTMLElement} button - The button element.
 * @param {string} state - 'success' or 'error'.
 * @param {number} [duration=2000] - Duration in ms.
 */
export function showIconFeedback(button, state, duration = 2000) {
    button.classList.remove('success', 'error')
    button.classList.add(state)
    setTimeout(() => button.classList.remove('success', 'error'), duration)
}

/**
 * Set up error clearing on form inputs.
 * Adds event listeners to all elements with [data-field] to remove error styling on input/change.
 * @param {HTMLElement} container - The container element to search within (default document).
 */
export function setupFieldErrorClearing(container = document) {
    container.querySelectorAll('[data-field]').forEach((input) => {
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