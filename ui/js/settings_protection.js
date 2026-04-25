// ui/js/settings_protection.js
import { escapeHtml } from './utils.js'

export function initProtectionForm(loadConfig, saveConfig) {
    console.log('Initialising Protection & Blocking form')

    // Containers
    const tagsContainer = document.getElementById('tagsList')
    const categoriesContainer = document.getElementById('categoriesList')
    const domainsContainer = document.getElementById('trackerDomainsList')
    const extensionsContainer = document.getElementById('dangerousExtensionsList')

    // Inputs and buttons
    const newTagInput = document.getElementById('newTag')
    const addTagBtn = document.getElementById('addTagBtn')
    const newCategoryInput = document.getElementById('newCategory')
    const addCategoryBtn = document.getElementById('addCategoryBtn')
    const newDomainInput = document.getElementById('newTrackerDomain')
    const addDomainBtn = document.getElementById('addTrackerDomainBtn')
    const newExtensionInput = document.getElementById('newExtension')
    const addExtensionBtn = document.getElementById('addExtensionBtn')

    const saveBtn = document.getElementById('saveProtectionBtn')

    // State
    let tags = []
    let categories = []
    let trackerDomains = []
    let dangerousExtensions = []

    // Render a list with remove buttons
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

    // Generic add handler
    function addItem(input, list, renderFn, listName) {
        const value = input.value.trim()
        if (!value) return
        if (list.includes(value)) {
            showToast(`"${value}" already in ${listName}`, 'error')
            return
        }
        list.push(value)
        renderFn()
        input.value = ''
    }

    // Load config
    async function load() {
        const config = await loadConfig()
        const protection = config.protection || {}
        tags = protection.tags || []
        categories = protection.categories || []
        trackerDomains = protection.tracker_domains || []
        dangerousExtensions = config.dangerous_extensions || []

        renderAll()
    }

    function renderAll() {
        renderList(tagsContainer, tags, (item) => {
            tags = tags.filter((t) => t !== item)
            renderAll()
        })
        renderList(categoriesContainer, categories, (item) => {
            categories = categories.filter((c) => c !== item)
            renderAll()
        })
        renderList(domainsContainer, trackerDomains, (item) => {
            trackerDomains = trackerDomains.filter((d) => d !== item)
            renderAll()
        })
        renderList(extensionsContainer, dangerousExtensions, (item) => {
            dangerousExtensions = dangerousExtensions.filter((e) => e !== item)
            renderAll()
        })
    }

    // Save config
    async function save() {
        const config = await loadConfig()
        config.protection = {
            tags,
            categories,
            tracker_domains: trackerDomains,
        }
        config.dangerous_extensions = dangerousExtensions

        try {
            await saveConfig(config)
            showButtonFeedback(saveBtn, 'success', {
                successText: 'Saved',
                originalText: 'Save Settings',
            })
        } catch (err) {
            showButtonFeedback(saveBtn, 'error', {
                errorText: 'Not saved',
                originalText: 'Save Settings',
            })
            showToast(`Save failed: ${err.message}`, 'error')
        }
    }

    // Event listeners
    addTagBtn.addEventListener('click', () => {
        addItem(newTagInput, tags, renderAll, 'tags')
    })
    addCategoryBtn.addEventListener('click', () => {
        addItem(newCategoryInput, categories, renderAll, 'categories')
    })
    addDomainBtn.addEventListener('click', () => {
        addItem(newDomainInput, trackerDomains, renderAll, 'tracker domains')
    })
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
        newExtensionInput.value = ''
    })

    // Allow Enter key to add
    ;[newTagInput, newCategoryInput, newDomainInput, newExtensionInput].forEach((input) => {
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

    saveBtn.addEventListener('click', save)

    load()
}
