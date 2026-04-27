// ============================================
// Client Site - Content Loading
// ============================================

// Initialize Supabase
// CONFIG is declared in config.js with `const`, which DOESN'T attach to
// window in plain (non-module) scripts. Use the bare identifier behind
// `typeof` so we don't blow up when window.CONFIG is undefined.
let supabaseClient = null;
if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL' && typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Load content on page load
document.addEventListener('DOMContentLoaded', loadSiteContent);

// Keep the footer copyright year fresh — runs on every page that has the span,
// even before site content has loaded.
document.addEventListener('DOMContentLoaded', function() {
    var yearEl = document.getElementById('copyright-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});

async function loadSiteContent() {
    // Get all editable elements
    const editableElements = document.querySelectorAll('[data-content]');

    if (!supabaseClient) {
        // Demo mode: content already visible in HTML
        console.log('Demo mode: Using default content');
        window._siteContentLoaded = true;
        window.dispatchEvent(new Event('siteContentLoaded'));
        return;
    }

    try {
        // Fetch all content for this site
        const { data, error } = await supabaseClient
            .from('site_content')
            .select('section, field_name, content')
            .eq('site_key', CONFIG.SITE_KEY);

        if (error) {
            console.error('Error fetching content:', error);
            return;
        }

        // Create a map for quick lookup
        const contentMap = {};
        data.forEach(item => {
            contentMap[`${item.section}.${item.field_name}`] = item.content;
        });

        // Expose for plugins.js to read saved plugin config
        window._siteContentMap = contentMap;

        // Apply content to elements
        editableElements.forEach(el => {
            const key = el.dataset.content;
            const content = contentMap[key];

            if (content) {
                if (el.tagName === 'IMG') {
                    el.src = content;
                } else if (el.tagName === 'A' && el.classList.contains('btn')) {
                    el.textContent = content;
                } else {
                    el.textContent = content;
                }
            }
        });

        console.log('Content loaded successfully');

        // Signal plugins that content is ready for schema generation
        window._siteContentLoaded = true;
        window.dispatchEvent(new Event('siteContentLoaded'));

    } catch (err) {
        console.error('Error loading content:', err);
    }
}

// ============ SMOOTH SCROLL ============
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
