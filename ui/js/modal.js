// ui/js/modal.js
let activeModal = null
let previousFocus = null

/**
 * Trap focus inside the modal for accessibility.
 * @param {HTMLElement} element - The modal element.
 * @private
 */
function trapFocus(element) {
    if (element._escapeHandler) {
        document.removeEventListener('keydown', element._escapeHandler)
    }
    if (element._tabHandler) {
        element.removeEventListener('keydown', element._tabHandler)
    }

    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal()
        }
    }
    element._escapeHandler = escapeHandler
    document.addEventListener('keydown', escapeHandler)

    const focusableSelector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const tabHandler = (e) => {
        if (e.key !== 'Tab') return
        const focusableElements = element.querySelectorAll(focusableSelector)
        if (focusableElements.length === 0) return
        const firstFocusable = focusableElements[0]
        const lastFocusable = focusableElements[focusableElements.length - 1]
        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
                e.preventDefault()
                lastFocusable.focus()
            }
        } else {
            if (document.activeElement === lastFocusable) {
                e.preventDefault()
                firstFocusable.focus()
            }
        }
    }
    element._tabHandler = tabHandler
    element.addEventListener('keydown', tabHandler)
}

function createModalButton(btn) {
    const btnEl = document.createElement('button')
    btnEl.className = btn.class || 'secondary-btn'
    if (btn.style) btnEl.style.cssText = btn.style
    if (btn.html) {
        btnEl.innerHTML = btn.html
    } else {
        btnEl.innerText = btn.text
    }
    btnEl.addEventListener('click', async (e) => {
        e.stopPropagation()
        let shouldClose = true
        if (btn.onClick) {
            const result = await btn.onClick(e, btnEl)
            if (result === false) shouldClose = false
        }
        if (shouldClose && btn.closeOnClick !== false) {
            closeModal()
        }
    })
    return btnEl
}

/**
 * Open a global modal dialog.
 * @param {Object} options - Modal options.
 * @param {string} options.title - Modal title.
 * @param {string} options.bodyHtml - HTML content for modal body.
 * @param {Array} [options.leftButtons] - Buttons on left side.
 * @param {Array} [options.rightButtons] - Buttons on right side.
 * @param {Array} [options.buttons] - Legacy buttons (all right-aligned).
 * @param {Function} [options.onClose] - Callback when modal closes.
 */
export function openModal(options) {
    const modal = document.getElementById('globalModal')
    const titleEl = document.getElementById('globalModalTitle')
    const bodyEl = document.getElementById('globalModalBody')
    const footerLeft = document.getElementById('globalModalFooterLeft')
    const footerRight = document.getElementById('globalModalFooterRight')
    const closeBtn = document.getElementById('globalModalClose')

    previousFocus = document.activeElement

    titleEl.innerText = options.title || 'Modal'
    bodyEl.innerHTML = options.bodyHtml || ''
    footerLeft.innerHTML = ''
    footerRight.innerHTML = ''

    if (options.leftButtons) {
        options.leftButtons.forEach((btn) => {
            const btnEl = createModalButton(btn)
            footerLeft.appendChild(btnEl)
        })
    }

    if (options.rightButtons) {
        options.rightButtons.forEach((btn) => {
            const btnEl = createModalButton(btn)
            footerRight.appendChild(btnEl)
        })
    }

    if (!options.leftButtons && !options.rightButtons && options.buttons) {
        options.buttons.forEach((btn) => {
            const btnEl = createModalButton(btn)
            footerRight.appendChild(btnEl)
        })
    }

    modal.style.display = 'flex'
    modal.setAttribute('aria-hidden', 'false')
    activeModal = modal

    trapFocus(modal)

    const firstFocusable = modal.querySelector('button, input, select, textarea')
    if (firstFocusable) firstFocusable.focus()

    const closeHandler = () => closeModal()
    closeBtn.addEventListener('click', closeHandler)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal()
    })

    modal._onClose = options.onClose
}

/**
 * Close the currently open modal.
 */
export function closeModal() {
    const modal = document.getElementById('globalModal')
    if (!modal) return

    if (modal._escapeHandler) {
        document.removeEventListener('keydown', modal._escapeHandler)
        delete modal._escapeHandler
    }

    if (modal._tabHandler) {
        modal.removeEventListener('keydown', modal._tabHandler)
        delete modal._tabHandler
    }

    modal.style.display = 'none'
    modal.setAttribute('aria-hidden', 'true')

    if (modal._onClose) {
        modal._onClose()
        delete modal._onClose
    }

    if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus()
    }
    activeModal = null
}
