// ui/js/settings_protection.js
import { SettingsToolbar } from './SettingsToolbar.js'
import { showToast, setupFieldErrorClearing } from './ui-helpers.js'
import { escapeHtml, consoleDebug } from './utils.js'

/**
 * Initialise the Protection & Blocking settings page.
 * @param {Function} loadConfig - Async function to load configuration.
 * @param {Function} saveConfig - Async function to save configuration.
 */
export function initProtectionForm(loadConfig, saveConfig) {
    consoleDebug('[Protection] Form initialised')

    const tagsContainer = document.getElementById('tagsList')
    const categoriesContainer = document.getElementById('categoriesList')
    const domainsContainer = document.getElementById('trackerDomainsList')
    const extensionsContainer = document.getElementById('dangerousExtensionsList')
    const newTagInput = document.getElementById('newTag')
    const addTagBtn = document.getElementById('addTagBtn')
    const newCategoryInput = document.getElementById('newCategory')
    const addCategoryBtn = document.getElementById('addCategoryBtn')
    const newDomainInput = document.getElementById('newTrackerDomain')
    const addDomainBtn = document.getElementById('addTrackerDomainBtn')
    const newExtensionInput = document.getElementById('newExtension')
    const addExtensionBtn = document.getElementById('addExtensionBtn')
    const hiddenState = document.getElementById('protectionState')

    let tags = []
    let categories = []
    let trackerDomains = []
    let dangerousExtensions = []

    /**
     * Update hidden JSON field and notify toolbar of dirty changes.
     */
    function updateHiddenState() {
        const state = { tags, categories, trackerDomains, dangerousExtensions }
        hiddenState.value = JSON.stringify(state)
        if (toolbar) toolbar._checkDirty()
    }

    /**
     * Render a list of removable items.
     * @param {HTMLElement} container - The container element.
     * @param {Array} items - Array of strings.
     * @param {Function} onRemove - Callback when remove button is clicked.
     */
    function renderList(container, items, onRemove) {
        container.innerHTML = ''
        items.forEach((item) => {
            const chip = document.createElement('span')
            chip.className = 'removable-item'
            chip.setAttribute('role', 'listitem')
            chip.innerHTML = `${escapeHtml(item)} <button class="remove-item" aria-label="Remove ${escapeHtml(item)}"><i class="fas fa-times-circle" aria-hidden="true"></i></button>`
            chip.querySelector('.remove-item').addEventListener('click', () => onRemove(item))
            container.appendChild(chip)
        })
    }

    /**
     * Render all lists (tags, categories, domains, extensions).
     */
    function renderAll() {
        renderList(tagsContainer, tags, (item) => {
            tags = tags.filter(t => t !== item)
            renderAll()
            updateHiddenState()
        })
        renderList(categoriesContainer, categories, (item) => {
            categories = categories.filter(c => c !== item)
            renderAll()
            updateHiddenState()
        })
        renderList(domainsContainer, trackerDomains, (item) => {
            trackerDomains = trackerDomains.filter(d => d !== item)
            renderAll()
            updateHiddenState()
        })
        renderList(extensionsContainer, dangerousExtensions, (item) => {
            dangerousExtensions = dangerousExtensions.filter(e => e !== item)
            renderAll()
            updateHiddenState()
        })
    }

    /**
     * Add a new item to a list.
     * @param {HTMLInputElement} input - The input element with the new value.
     * @param {Array} list - The list to add to.
     * @param {string} listName - Human-readable name for error messages.
     * @param {Function} [transform] - Optional transformation function (e.g., add dot).
     */
    function addItem(input, list, listName, transform = (x) => x) {
        let value = input.value.trim()
        if (!value) return
        value = transform(value)
        if (list.includes(value)) {
            showToast(`"${value}" already in ${listName}`, 'error')
            return
        }
        list.push(value)
        renderAll()
        updateHiddenState()
        input.value = ''
    }

    /**
     * Load configuration and populate all lists.
     * @returns {Promise<void>}
     */
    async function load() {
        const config = await loadConfig()
        const uiPrefs = config.ui_preferences || {}
        const initiallyAdvanced = uiPrefs.show_advanced || false
        toolbar.setAdvancedVisible(initiallyAdvanced)

        const protection = config.protection || {}
        tags = protection.tags || []
        categories = protection.categories || []
        trackerDomains = protection.tracker_domains || []
        dangerousExtensions = config.dangerous_extensions || []

        renderAll()
        updateHiddenState()
        setupFieldErrorClearing(document.querySelector('#pageContent'))
    }

    /**
     * Save protection and blocking settings.
     * @returns {Promise<void>}
     */
    async function save() {
        const config = await loadConfig()
        config.protection = { tags, categories, tracker_domains: trackerDomains }
        config.dangerous_extensions = dangerousExtensions
        if (!config.ui_preferences) config.ui_preferences = {}
        config.ui_preferences.show_advanced = toolbar._advancedVisible
        await saveConfig(config)
    }

    // Wire event listeners
    addTagBtn.addEventListener('click', () => addItem(newTagInput, tags, 'tags'))
    addCategoryBtn.addEventListener('click', () => addItem(newCategoryInput, categories, 'categories'))
    addDomainBtn.addEventListener('click', () => addItem(newDomainInput, trackerDomains, 'tracker domains'))
    addExtensionBtn.addEventListener('click', () => {
        let ext = newExtensionInput.value.trim()
        if (ext && !ext.startsWith('.')) ext = '.' + ext
        if (!ext) return
        if (dangerousExtensions.includes(ext)) {
            showToast(`"${ext}" already in extensions`, 'error')
            return
        }
        dangerousExtensions.push(ext)
        renderAll()
        updateHiddenState()
        newExtensionInput.value = ''
    })

    // Enter key support
    const inputs = [newTagInput, newCategoryInput, newDomainInput, newExtensionInput]
    inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                if (input === newTagInput) addTagBtn.click()
                else if (input === newCategoryInput) addCategoryBtn.click()
                else if (input === newDomainInput) addDomainBtn.click()
                else if (input === newExtensionInput) addExtensionBtn.click()
            }
        })
    })

    // Toolbar initialisation
    const toolbar = new SettingsToolbar({
        container: '#pageContent',
        save,
        showAdvanced: true,
    })
    toolbar.init()
    load().then(() => toolbar.captureSnapshot())
}