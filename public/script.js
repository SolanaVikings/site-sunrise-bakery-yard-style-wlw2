// ============================================
// Client Site - Content Loading
// ============================================

// Initialize Supabase
// CONFIG is declared in config.js with `const`, which DOESN'T attach to
// window in plain (non-module) scripts. Use the bare identifier behind
// `typeof` so we don't blow up when window.CONFIG is undefined.
let supabaseClient = null;
// Disable supabase auth — this is the public-site reader, no sign-in flow.
// Distinct storageKey from admin.js so the two clients (parent admin + iframe)
// don't fight over the same localStorage GoTrue slot. Stops the "Multiple
// GoTrueClient instances detected" warning + intermittent header-stomping.
if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL' && typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gmof-public' }
    });
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

        // Split design overrides off from regular content. Each design change
        // is stored with section='__design' and field_name=<ISO stamp>; the
        // payload is JSON {label, css}. We concatenate all of them in stamp
        // order and inject as a <style> tag — runtime version of what
        // admin-edit used to commit to GitHub. Same effect, no rebuild loop.
        const designOverrides = data
            .filter(item => item.section === '__design')
            .sort((a, b) => (a.field_name || '').localeCompare(b.field_name || ''));
        if (designOverrides.length) {
            const cssParts = designOverrides.map(row => {
                let css = '';
                let label = '';
                try {
                    const payload = JSON.parse(row.content || '{}');
                    css = String(payload.css || '');
                    label = String(payload.label || '');
                } catch (_) {
                    css = String(row.content || '');
                }
                return `/* === Admin AI design change: ${label} (${row.field_name}) === */\n${css}\n/* === End === */`;
            });
            const styleTag = document.createElement('style');
            styleTag.id = '__admin-design-overrides';
            styleTag.textContent = cssParts.join('\n\n');
            document.head.appendChild(styleTag);
        }

        // Create a map for quick lookup (excluding design rows)
        const contentMap = {};
        data
            .filter(item => item.section !== '__design')
            .forEach(item => {
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
