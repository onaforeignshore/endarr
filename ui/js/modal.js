// ui/js/modal.js
let activeModal = null
let previousFocus = null

function trapFocus(element) {
    // Remove any existing trap handlers to avoid duplicates
    if (element._escapeHandler) {
        document.removeEventListener('keydown', element._escapeHandler)
    }
    if (element._tabHandler) {
        element.removeEventListener('keydown', element._tabHandler)
    }

    // Escape key handler
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal()
        }
    }
    element._escapeHandler = escapeHandler
    document.addEventListener('keydown', escapeHandler)

    // Tab key focus trap
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

    // Left buttons (e.g., Delete)
    if (options.leftButtons) {
        options.leftButtons.forEach((btn) => {
            const btnEl = createModalButton(btn)
            footerLeft.appendChild(btnEl)
        })
    }

    // Right buttons (e.g., Cancel, Save)
    if (options.rightButtons) {
        options.rightButtons.forEach((btn) => {
            const btnEl = createModalButton(btn)
            footerRight.appendChild(btnEl)
        })
    }

    // Fallback for legacy `buttons` option (all right-aligned)
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

export function closeModal() {
    const modal = document.getElementById('globalModal')
    if (!modal) return

    // Remove Escape handler
    if (modal._escapeHandler) {
        document.removeEventListener('keydown', modal._escapeHandler)
        delete modal._escapeHandler
    }

    // Remove Tab trap handler
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

    // Restore focus
    if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus()
    }
    activeModal = null
}

// Make available globally
window.openModal = openModal
window.closeModal = closeModal
