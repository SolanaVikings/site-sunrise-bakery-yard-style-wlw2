// ============================================
// Client Dashboard - Schema-Driven Admin
// ============================================

// Initialize Supabase
let supabaseClient = null;
if (window.CONFIG && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const siteKeyDisplay = document.getElementById('site-key-display');
const contentSections = document.getElementById('content-sections');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');
const logoutBtn = document.getElementById('logout-btn');
const toast = document.getElementById('toast');

// State
let isAuthenticated = false;
let hasUnsavedChanges = false;
let contentCache = {};
let sessionToken = null;

// Get auth headers for authenticated Supabase requests
function getAuthHeaders() {
    return sessionToken ? { 'x-site-token': sessionToken } : {};
}

// ============ AUTHENTICATION ============
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;

    const submitBtn = loginForm.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.rpc('site_login', {
                p_site_key: CONFIG.SITE_KEY,
                p_password: password
            });

            if (error) throw new Error('Incorrect password');
            if (!data || !data.length) throw new Error('Incorrect password');

            sessionToken = data[0].token;
            sessionStorage.setItem('session_token', sessionToken);

            // Recreate client with x-site-token in global headers so RLS can scope writes
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
                global: { headers: { 'x-site-token': sessionToken } }
            });
        } else {
            // Demo mode
            if (password !== 'demo') {
                throw new Error('Demo mode: use "demo" as password');
            }
        }

        isAuthenticated = true;
        sessionStorage.setItem('authenticated', 'true');
        showDashboard();

    } catch (err) {
        loginError.textContent = err.message || 'Incorrect password. Please try again.';
        loginError.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Access Dashboard';
    }
});

logoutBtn.addEventListener('click', async () => {
    // Invalidate the session token on the server
    if (supabaseClient && sessionToken) {
        try {
            await supabaseClient.rpc('site_logout', { p_token: sessionToken });
        } catch (err) {
            // Logout should succeed even if the RPC fails
        }
    }

    sessionToken = null;
    sessionStorage.removeItem('authenticated');
    sessionStorage.removeItem('session_token');
    isAuthenticated = false;
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
    document.getElementById('password').value = '';
});

// Check for existing session or Supabase SSO
const storedToken = sessionStorage.getItem('session_token');
if (sessionStorage.getItem('authenticated') === 'true' && storedToken) {
    sessionToken = storedToken;
    isAuthenticated = true;
    // Recreate client with stored token in global headers
    if (supabaseClient) {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            global: { headers: { 'x-site-token': sessionToken } }
        });
    }
    showDashboard();
} else if (supabaseClient) {
    // Check for Supabase auth session (SSO from portal)
    checkSupabaseSession();
}

// ============ SUPABASE SSO ============
async function checkSupabaseSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session && session.user && session.user.email) {
            // Check if this user owns a site with this site_key
            const { data: builds } = await supabaseClient
                .from('site_builds')
                .select('id, submission_id')
                .eq('site_key', CONFIG.SITE_KEY)
                .maybeSingle();

            if (builds && builds.submission_id) {
                const { data: submission } = await supabaseClient
                    .from('submissions')
                    .select('email')
                    .eq('id', builds.submission_id)
                    .maybeSingle();

                if (submission && submission.email.toLowerCase() === session.user.email.toLowerCase()) {
                    // User owns this site! Create a session token for them
                    const { data: loginData } = await supabaseClient.rpc('site_sso_login', {
                        p_site_key: CONFIG.SITE_KEY,
                        p_email: session.user.email
                    });

                    if (loginData && loginData.length && loginData[0].token) {
                        sessionToken = loginData[0].token;
                        sessionStorage.setItem('session_token', sessionToken);
                        sessionStorage.setItem('authenticated', 'true');

                        // Recreate client with session token
                        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
                            global: { headers: { 'x-site-token': sessionToken } }
                        });

                        isAuthenticated = true;
                        showDashboard();
                        showToast('Logged in via My Sites portal', 'success');
                    }
                }
            }
        }
    } catch (err) {
        // SSO failed, show normal login screen
        console.error('SSO check failed:', err);
    }
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'flex';
    siteKeyDisplay.textContent = CONFIG.SITE_KEY;

    // Generate form from schema
    generateFormFromSchema();

    // Load content
    loadContent();

    // Load agent readiness panel (async, non-blocking)
    setTimeout(loadAgentReadiness, 500);
}

// ============ GENERATE FORM FROM SCHEMA ============
function generateFormFromSchema() {
    if (!CONFIG.SCHEMA || !CONFIG.SCHEMA.length) {
        contentSections.innerHTML = '<p class="error-text">No schema defined in config.js</p>';
        return;
    }

    let html = '';

    CONFIG.SCHEMA.forEach(section => {
        html += `
            <section class="editor-section">
                <div class="section-header">
                    <h2>${escapeHtml(section.name)}</h2>
                    ${section.hint ? `<span class="section-hint">${escapeHtml(section.hint)}</span>` : ''}
                </div>
                <div class="section-content">
                    ${generateFieldsHtml(section.id, section.fields)}
                </div>
            </section>
        `;
    });

    contentSections.innerHTML = html;

    // Attach event listeners for image uploads
    initImageUploads();

    // Track changes on all inputs
    document.querySelectorAll('input:not([type="file"]), textarea').forEach(input => {
        input.addEventListener('input', () => {
            hasUnsavedChanges = true;
            updateSaveStatus('unsaved');
        });
    });
}

function generateFieldsHtml(sectionId, fields) {
    return fields.map(field => {
        const fieldId = `${sectionId}-${field.id}`;
        const dataAttrs = `data-section="${sectionId}" data-field="${field.id}"`;

        switch (field.type) {
            case 'text':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${escapeHtml(field.label)}</label>
                        <input type="text"
                               id="${fieldId}"
                               ${dataAttrs}
                               placeholder="${escapeHtml(field.placeholder || '')}">
                    </div>
                `;

            case 'textarea':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${escapeHtml(field.label)}</label>
                        <textarea id="${fieldId}"
                                  ${dataAttrs}
                                  rows="3"
                                  placeholder="${escapeHtml(field.placeholder || '')}"></textarea>
                    </div>
                `;

            case 'image':
                return `
                    <div class="form-group">
                        <label>${escapeHtml(field.label)}</label>
                        <div class="image-upload" ${dataAttrs}>
                            <input type="file" accept="image/*" class="image-input">
                            <div class="upload-placeholder">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <path d="M21 15l-5-5L5 21"/>
                                </svg>
                                <span>Click or drag to upload</span>
                            </div>
                            <div class="image-preview" style="display: none;">
                                <img src="" alt="Preview">
                                <button type="button" class="remove-image">&times;</button>
                            </div>
                        </div>
                    </div>
                `;

            default:
                return '';
        }
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
}

// ============ IMAGE UPLOAD HANDLERS ============
function initImageUploads() {
    document.querySelectorAll('.image-upload').forEach(upload => {
        const input = upload.querySelector('.image-input');
        const placeholder = upload.querySelector('.upload-placeholder');
        const preview = upload.querySelector('.image-preview');
        const img = preview.querySelector('img');
        const removeBtn = preview.querySelector('.remove-image');

        // Click to upload
        upload.addEventListener('click', (e) => {
            if (e.target !== removeBtn && !e.target.closest('.remove-image')) {
                input.click();
            }
        });

        // Drag and drop
        upload.addEventListener('dragover', (e) => {
            e.preventDefault();
            upload.classList.add('dragover');
        });

        upload.addEventListener('dragleave', () => {
            upload.classList.remove('dragover');
        });

        upload.addEventListener('drop', (e) => {
            e.preventDefault();
            upload.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleImageUpload(file, upload);
            }
        });

        // File input change
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file) {
                handleImageUpload(file, upload);
            }
        });

        // Remove image
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            img.src = '';
            img.dataset.url = '';
            preview.style.display = 'none';
            placeholder.style.display = 'block';
            input.value = '';
            hasUnsavedChanges = true;
            updateSaveStatus('unsaved');
        });
    });
}

async function handleImageUpload(file, uploadEl) {
    const section = uploadEl.dataset.section;
    const field = uploadEl.dataset.field;
    const preview = uploadEl.querySelector('.image-preview');
    const placeholder = uploadEl.querySelector('.upload-placeholder');
    const img = preview.querySelector('img');

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
        img.src = e.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);

    hasUnsavedChanges = true;
    updateSaveStatus('unsaved');

    // Upload to Supabase Storage
    if (supabaseClient) {
        try {
            const fileName = `${CONFIG.SITE_KEY}/${section}-${field}-${Date.now()}.${file.name.split('.').pop()}`;

            const { data, error } = await supabaseClient.storage
                .from('site-images')
                .upload(fileName, file, {
                    upsert: true
                });

            if (error) throw error;

            // Get public URL
            const { data: urlData } = supabaseClient.storage
                .from('site-images')
                .getPublicUrl(fileName);

            img.dataset.url = urlData.publicUrl;
            showToast('Image uploaded!', 'success');

        } catch (err) {
            console.error('Error uploading image:', err);
            showToast('Failed to upload image', 'error');
        }
    }
}

// ============ LOAD CONTENT ============
async function loadContent() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('site_content')
            .select('*')
            .eq('site_key', CONFIG.SITE_KEY);

        if (error) throw error;

        // Populate form fields
        data.forEach(item => {
            const key = `${item.section}.${item.field_name}`;
            contentCache[key] = item.content;

            // Find matching input
            const input = document.querySelector(
                `[data-section="${item.section}"][data-field="${item.field_name}"]`
            );

            if (input) {
                if (input.classList.contains('image-upload')) {
                    // Handle image
                    if (item.content) {
                        const preview = input.querySelector('.image-preview');
                        const placeholder = input.querySelector('.upload-placeholder');
                        const img = preview.querySelector('img');
                        img.src = item.content;
                        img.dataset.url = item.content;
                        preview.style.display = 'block';
                        placeholder.style.display = 'none';
                    }
                } else {
                    // Handle text input
                    input.value = item.content || '';
                }
            }
        });

        updateSaveStatus('saved');

    } catch (err) {
        console.error('Error loading content:', err);
        showToast('Failed to load content', 'error');
    }
}

// ============ SAVE CONTENT ============
saveBtn.addEventListener('click', saveContent);

async function saveContent() {
    if (!supabaseClient) {
        showToast('Demo mode: Changes not saved', 'error');
        return;
    }

    saveBtn.disabled = true;
    updateSaveStatus('saving');

    try {
        const updates = [];

        // Gather text inputs
        document.querySelectorAll('[data-section][data-field]').forEach(el => {
            const section = el.dataset.section;
            const field = el.dataset.field;

            let content = '';
            if (el.classList.contains('image-upload')) {
                const img = el.querySelector('.image-preview img');
                content = img.dataset.url || img.src || '';
                // Don't save data: URLs (local previews)
                if (content.startsWith('data:')) content = '';
            } else {
                content = el.value || '';
            }

            updates.push({
                site_key: CONFIG.SITE_KEY,
                section: section,
                field_name: field,
                content: content,
                updated_at: new Date().toISOString()
            });
        });

        // Upsert all content with session token header
        for (const update of updates) {
            const { error } = await supabaseClient
                .from('site_content')
                .upsert(update, {
                    onConflict: 'site_key,section,field_name'
                });

            if (error) throw error;
        }

        hasUnsavedChanges = false;
        updateSaveStatus('saved');
        showToast('Changes saved!', 'success');

    } catch (err) {
        console.error('Error saving:', err);
        updateSaveStatus('error');
        showToast('Failed to save changes', 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

// ============ UI HELPERS ============
function updateSaveStatus(status) {
    const statusText = saveStatus.querySelector('.status-text');

    saveStatus.classList.remove('saved', 'unsaved', 'saving', 'error');
    saveStatus.classList.add(status);

    switch (status) {
        case 'saved':
            statusText.textContent = 'All changes saved';
            break;
        case 'unsaved':
            statusText.textContent = 'Unsaved changes';
            break;
        case 'saving':
            statusText.textContent = 'Saving...';
            break;
        case 'error':
            statusText.textContent = 'Error saving';
            break;
    }
}

function showToast(message, type = 'info') {
    toast.querySelector('.toast-message').textContent = message;
    toast.className = 'toast visible ' + type;

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

// Warn on unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ============ AGENT READINESS ============
// Checks the live site for agent-readiness and shows score + AI preview

async function loadAgentReadiness() {
    const panel = document.getElementById('agent-readiness-panel');
    if (!panel || !CONFIG || !CONFIG.SITE_KEY) return;
    panel.style.display = 'block';

    try {
        // Fetch the live site HTML
        const siteUrl = window.location.origin + '/index.html';
        const response = await fetch(siteUrl);
        const html = await response.text();

        const checks = runAgentReadinessChecks(html);
        renderAgentReadiness(checks);
        renderAiPreview(html);
    } catch (err) {
        console.error('Agent readiness check failed:', err);
    }

    // Load AI traffic stats
    loadAiTraffic();
}

function runAgentReadinessChecks(html) {
    const checks = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // R-02: No opacity:0 on data-content
    const hasOpacityHide = html.includes('[data-content]') && html.includes('opacity: 0') || html.includes('opacity:0');
    checks.push({ id: 'R-02', label: 'Content visible without JS', pass: !hasOpacityHide, critical: true });

    // S-01: Has <main> element
    checks.push({ id: 'S-01', label: 'Has <main> landmark', pass: !!doc.querySelector('main'), critical: true });

    // S-02: Has exactly one h1
    const h1s = doc.querySelectorAll('h1');
    checks.push({ id: 'S-02', label: 'Single <h1> heading', pass: h1s.length === 1, critical: true });

    // S-03: Nav has aria-label
    const nav = doc.querySelector('nav');
    checks.push({ id: 'S-03', label: 'Nav has aria-label', pass: nav && nav.hasAttribute('aria-label'), critical: false });

    // S-06: Contact in <address>
    checks.push({ id: 'S-06', label: 'Contact in <address> element', pass: !!doc.querySelector('address'), critical: false });

    // S-07: All images have alt text
    const imgs = doc.querySelectorAll('img');
    const allAlts = Array.from(imgs).every(img => img.hasAttribute('alt') && img.alt.length > 2);
    checks.push({ id: 'S-07', label: 'All images have descriptive alt text', pass: imgs.length === 0 || allAlts, critical: true });

    // D-01: Has JSON-LD structured data
    const jsonLds = doc.querySelectorAll('script[type="application/ld+json"]');
    checks.push({ id: 'D-01', label: 'Has JSON-LD structured data', pass: jsonLds.length >= 2, critical: true });

    // M-01: Has title tag
    checks.push({ id: 'M-01', label: 'Has <title> tag', pass: !!doc.querySelector('title') && doc.title.length > 5, critical: true });

    // M-02: Has meta description
    const metaDesc = doc.querySelector('meta[name="description"]');
    checks.push({ id: 'M-02', label: 'Has meta description', pass: !!metaDesc && metaDesc.content.length > 20, critical: true });

    // M-03: Has Open Graph tags
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    checks.push({ id: 'M-03', label: 'Has Open Graph tags', pass: !!ogTitle, critical: false });

    // M-05: Has robots meta with max-snippet
    const robotsMeta = doc.querySelector('meta[name="robots"]');
    checks.push({ id: 'M-05', label: 'Robots meta with max-snippet', pass: !!robotsMeta && robotsMeta.content.includes('max-snippet'), critical: false });

    // P-01: Images have loading="lazy"
    const lazyImgs = Array.from(imgs).filter(img => img.hasAttribute('loading'));
    checks.push({ id: 'P-01', label: 'Images use lazy loading', pass: imgs.length === 0 || lazyImgs.length >= imgs.length / 2, critical: false });

    // P-03: Has preconnect hints
    const preconnects = doc.querySelectorAll('link[rel="preconnect"]');
    checks.push({ id: 'P-03', label: 'Has preconnect hints', pass: preconnects.length > 0, critical: false });

    // Content check: Enough visible text
    const mainEl = doc.querySelector('main');
    const textContent = mainEl ? mainEl.textContent.trim() : doc.body.textContent.trim();
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 1).length;
    checks.push({ id: 'R-02b', label: 'Has substantial text content (100+ words)', pass: wordCount >= 100, critical: true });

    // Footer exists
    checks.push({ id: 'S-09', label: 'Has <footer> element', pass: !!doc.querySelector('footer'), critical: false });

    return checks;
}

function renderAgentReadiness(checks) {
    const passCount = checks.filter(c => c.pass).length;
    const total = checks.length;
    const score = Math.round((passCount / total) * 100);

    const scoreEl = document.getElementById('ar-score');
    scoreEl.textContent = score + '%';
    scoreEl.className = 'ar-score ' + (score >= 80 ? 'ar-good' : score >= 50 ? 'ar-ok' : 'ar-bad');

    const checklist = document.getElementById('ar-checklist');
    checklist.innerHTML = checks.map(c => `
        <div class="ar-check ${c.pass ? 'ar-pass' : 'ar-fail'}">
            <span class="ar-check-icon">${c.pass ? '\u2713' : '\u2717'}</span>
            <span class="ar-check-label">${c.label}</span>
            ${c.critical ? '<span class="ar-critical">CRITICAL</span>' : ''}
        </div>
    `).join('');
}

function renderAiPreview(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract what AI crawlers see: headings + text content
    const preview = [];

    // Title
    if (doc.title) preview.push('TITLE: ' + doc.title);

    // Meta description
    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc) preview.push('DESCRIPTION: ' + metaDesc.content);

    // Headings and content
    const mainEl = doc.querySelector('main') || doc.body;
    const headings = mainEl.querySelectorAll('h1, h2, h3');
    headings.forEach(h => {
        preview.push('\n' + h.tagName + ': ' + h.textContent.trim());
    });

    // Paragraphs
    const paragraphs = mainEl.querySelectorAll('p');
    paragraphs.forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 10) preview.push(text);
    });

    // Contact info
    const address = doc.querySelector('address');
    if (address) preview.push('\nCONTACT: ' + address.textContent.trim());

    const previewEl = document.getElementById('ar-preview-content');
    previewEl.textContent = preview.join('\n');
}

async function loadAiTraffic() {
    if (!supabaseClient || !CONFIG.SITE_KEY) return;

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabaseClient
            .from('ai_visits')
            .select('visit_type, source')
            .eq('site_key', CONFIG.SITE_KEY)
            .gte('created_at', thirtyDaysAgo.toISOString());

        if (error || !data) return;

        const crawlers = data.filter(v => v.visit_type === 'crawler').length;
        const referrals = data.filter(v => v.visit_type === 'referral').length;

        document.getElementById('ar-crawlers').textContent = crawlers;
        document.getElementById('ar-referrals').textContent = referrals;

        // Group by source
        const sourceMap = {};
        data.forEach(v => {
            sourceMap[v.source] = (sourceMap[v.source] || 0) + 1;
        });
        const sources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const sourcesEl = document.getElementById('ar-traffic-sources');
        if (sources.length > 0) {
            sourcesEl.innerHTML = sources.map(([source, count]) =>
                '<div class="ar-source"><span>' + source + '</span><span>' + count + ' visits</span></div>'
            ).join('');
        } else {
            sourcesEl.innerHTML = '<p class="ar-no-data">No AI visits recorded yet</p>';
        }
    } catch (err) {
        console.error('Failed to load AI traffic:', err);
    }
}
