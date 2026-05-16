// ui/js/tooltip.js
/**
 * Initialise tooltips by moving .tooltip-text elements to body and positioning on hover.
 * @param {HTMLElement} [root=document] - Root element to scan for tooltips.
 */
export function initTooltips(root = document) {
    root.querySelectorAll('.tooltip').forEach((trigger) => {
        const text = trigger.querySelector('.tooltip-text')
        if (!text || text._tooltipMoved) return
        document.body.appendChild(text)
        text.style.position = 'fixed'
        text.style.zIndex = '9999'
        text.style.pointerEvents = 'none'
        text._tooltipMoved = true
        trigger.addEventListener('mouseenter', () => {
            const rect = trigger.getBoundingClientRect()
            text.style.left = rect.left + rect.width / 2 + 'px'
            text.style.top = rect.top - 8 + 'px'
            text.style.display = 'block'
        })
        trigger.addEventListener('mouseleave', () => {
            text.style.display = 'none'
        })
    })
}