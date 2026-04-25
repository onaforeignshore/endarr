// ui/js/system.js

const systemSubpages = {
    logs: {
        file: 'logs.html',
        init: async () => {
            const m = await import('./logs.js');
            return m.initLogsPage();
        },
    },
    // Future sub‑pages (e.g., 'tasks') go here
};

let currentSystemPage = 'logs';

async function loadSystemSubpage(pageId) {
    const page = systemSubpages[pageId];
    if (!page) return;

    // Update active state in sidebar sub‑items
    document.querySelectorAll('#systemSubNav .sub-item').forEach(item => {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
        if (item.getAttribute('data-system-page') === pageId) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        }
    });

    const contentDiv = document.getElementById('pageContent');   // system page already loaded, so just replace content
    if (!contentDiv) return;
    contentDiv.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const response = await fetch(`/ui/pages/${page.file}`);
        if (!response.ok) throw new Error('Subpage not found');
        const html = await response.text();
        contentDiv.innerHTML = html;
        currentSystemPage = pageId;
        if (page.init && typeof page.init === 'function') {
            await page.init();
        }
    } catch (err) {
        contentDiv.innerHTML = `<div class="placeholder-text">Error loading subpage: ${err.message}</div>`;
        showToast(`Failed to load system page: ${err.message}`, 'error');
    }
}

// Expose globally so the main sidebar can call it
window.loadSystemSubpage = loadSystemSubpage;

export function initSystemSubpage() {
    // Load the default system subpage (Logs)
    loadSystemSubpage('logs');
}