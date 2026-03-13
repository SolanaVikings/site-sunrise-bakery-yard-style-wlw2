// ============================================
// Client Site - Content Loading
// ============================================

// Initialize Supabase
let supabaseClient = null;
if (window.CONFIG && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Load content on page load
document.addEventListener('DOMContentLoaded', loadSiteContent);

async function loadSiteContent() {
    // Get all editable elements
    const editableElements = document.querySelectorAll('[data-content]');

    if (!supabaseClient) {
        // Demo mode: content already visible in HTML
        console.log('Demo mode: Using default content');
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
