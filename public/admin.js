// ============================================
// Client Dashboard - Schema-Driven Admin
// ============================================

// Initialize Supabase
// NOTE: config.js declares CONFIG with `const`, which does NOT become a
// property of window in regular scripts (only var does). Use the bare
// identifier through typeof to detect it without throwing.
let supabaseClient = null;
if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL' && typeof window.supabase !== 'undefined') {
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
const retryBtn = document.getElementById('retry-btn');
const saveBar = document.getElementById('save-bar');
const uploadStatusEl = document.getElementById('upload-status');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

// ============ AUTHENTICATION (magic link) ============
// Customer never picked a password \u2014 they sign in by email-only magic link.
// admin-magic-link Edge Function emails them a #token=... URL; arriving with
// that hash lands them in the dashboard via the existing checkTokenLogin path.
if (loginForm) {
    const loginSuccess = document.getElementById('login-success');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        if (loginSuccess) loginSuccess.style.display = 'none';
        const email = (document.getElementById('email').value || '').trim().toLowerCase();
        if (!email || email.indexOf('@') < 1) {
            loginError.textContent = 'Please enter a valid email address.';
            loginError.style.display = 'block';
            return;
        }
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending\u2026';

        try {
            const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/admin-magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
                body: JSON.stringify({
                    site_key: CONFIG.SITE_KEY,
                    email: email,
                    return_url: window.location.origin + '/admin.html'
                })
            });
            // Always show success even if 404 — never reveal whether an email is registered
            if (loginSuccess) {
                loginSuccess.textContent = 'If that email matches our records, a sign-in link is on its way. Check your inbox (and spam).';
                loginSuccess.style.display = 'block';
            }
            loginForm.style.display = 'none';
            // Drop the explanatory blurb — the success message replaces it now.
            const blurb = document.getElementById('login-blurb');
            if (blurb) blurb.style.display = 'none';
        } catch (err) {
            loginError.textContent = 'Couldn\u2019t send the link right now. Please try again, or email support@getmeonlinefast.com.';
            loginError.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Email me a sign-in link';
        }
    });
}
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const shortcutsOverlay = document.getElementById('shortcuts-overlay');
const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
const previewFrame = null; // Preview pane removed — site opens via View Site button

// State
let isAuthenticated = false;
let hasUnsavedChanges = false;
let contentCache = {};
let sessionToken = null;
let activeUploads = 0;
let lastSaveTime = null;
let autoSaveTimer = null;
let saveTimeInterval = null;
let currentAdminPage = 'index';

// ============ UNDO/REDO SYSTEM ============
let changeHistory = [];
let historyIndex = -1;
let historyDebounceTimers = {};
let isApplyingHistory = false;

function escapeSelectorValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getFieldControl(section, field) {
    return document.querySelector(
        '[data-section="' + escapeSelectorValue(section) + '"][data-field="' + escapeSelectorValue(field) + '"]'
    );
}

function getFieldControlValue(el) {
    if (!el) return '';
    if (el.classList.contains('image-upload')) {
        const img = el.querySelector('.image-preview img');
        return (img && (img.dataset.url || img.src)) || '';
    }
    return el.value || '';
}

function setFieldControlValue(el, value) {
    if (!el) return;
    const next = value || '';
    if (el.classList.contains('image-upload')) {
        const preview = el.querySelector('.image-preview');
        const placeholder = el.querySelector('.upload-placeholder');
        const img = el.querySelector('.image-preview img');
        if (img) {
            img.src = next;
            img.dataset.url = next;
        }
        if (preview && placeholder) {
            preview.style.display = next ? 'block' : 'none';
            placeholder.style.display = next ? 'none' : 'block';
        }
    } else {
        el.value = next;
        el.dataset.historyValue = next;
    }
}

function updateAiPreviewField(key, value, shouldFlash) {
    const iframe = document.getElementById('ai-preview-iframe');
    let doc = null;
    try { doc = iframe && iframe.contentDocument; } catch (_) {}
    if (!doc) return;
    doc.querySelectorAll('[data-content="' + escapeSelectorValue(key) + '"]').forEach(el => {
        if (el.tagName === 'IMG') {
            el.src = value || '';
        } else {
            el.textContent = value || '';
        }
        if (shouldFlash) flashIframeElement(el);
    });
}

function pushToHistory(section, field, oldValue, newValue) {
    if (oldValue === newValue) return;

    // Truncate any redo entries beyond current index
    if (historyIndex < changeHistory.length - 1) {
        changeHistory = changeHistory.slice(0, historyIndex + 1);
    }

    changeHistory.push({ section, field, oldValue, newValue });
    historyIndex = changeHistory.length - 1;
    updateUndoRedoButtons();
}

function performUndo() {
    if (historyIndex < 0) return;

    const entry = changeHistory[historyIndex];
    historyIndex--;

    const el = getFieldControl(entry.section, entry.field);
    if (el) {
        isApplyingHistory = true;
        try {
            setFieldControlValue(el, entry.oldValue);
            if (!el.classList.contains('image-upload')) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                hasUnsavedChanges = true;
                updateSaveStatus('unsaved');
                resetAutoSaveTimer();
                backupToLocalStorage();
            }
        } finally {
            isApplyingHistory = false;
        }
        const key = entry.section + '.' + entry.field;
        contentCache[key] = entry.oldValue || '';
        updateAiPreviewField(key, entry.oldValue, true);
    }
    updateUndoRedoButtons();
    updatePreview();
}

function performRedo() {
    if (historyIndex >= changeHistory.length - 1) return;

    historyIndex++;
    const entry = changeHistory[historyIndex];

    const el = getFieldControl(entry.section, entry.field);
    if (el) {
        isApplyingHistory = true;
        try {
            setFieldControlValue(el, entry.newValue);
            if (!el.classList.contains('image-upload')) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                hasUnsavedChanges = true;
                updateSaveStatus('unsaved');
                resetAutoSaveTimer();
                backupToLocalStorage();
            }
        } finally {
            isApplyingHistory = false;
        }
        const key = entry.section + '.' + entry.field;
        contentCache[key] = entry.newValue || '';
        updateAiPreviewField(key, entry.newValue, true);
    }
    updateUndoRedoButtons();
    updatePreview();
}

function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = historyIndex < 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= changeHistory.length - 1;
}

// ============ STRUCTURED ERROR HANDLING ============
async function handleError(error, context) {
    const status = error?.status || error?.statusCode || 0;
    const message = error?.message || String(error);

    // Auth errors (401/403)
    if (status === 401 || status === 403 || message.includes('JWT') || message.includes('token')) {
        showToast('Session expired. Please log in again.', 'error');
        // Trigger re-login after short delay
        setTimeout(() => {
            sessionToken = null;
            sessionStorage.removeItem('authenticated');
            sessionStorage.removeItem('session_token');
            isAuthenticated = false;
            loginScreen.style.display = 'flex';
            dashboard.style.display = 'none';
        }, 2000);
        return { retry: false };
    }

    // Data/validation errors (400)
    if (status === 400 || status === 422) {
        showToast(`${context}: ${message}`, 'error');
        return { retry: false };
    }

    // Transient errors (network, 5xx) -- caller handles retry
    if (status >= 500 || status === 0 || message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
        return { retry: true };
    }

    // Default: show error
    showToast(`${context}: ${message}`, 'error');
    return { retry: false };
}

async function withRetry(fn, context, maxRetries) {
    if (maxRetries === undefined) maxRetries = 3;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const result = await handleError(err, context);
            if (!result.retry || attempt === maxRetries) {
                throw err;
            }
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise(resolve => setTimeout(resolve, delay));
            if (attempt < maxRetries) {
                showToast(`Retrying ${context}... (attempt ${attempt + 2}/${maxRetries + 1})`, 'info');
            }
        }
    }
    throw lastError;
}

// ============ AUTO-SAVE ============
function resetAutoSaveTimer() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        if (hasUnsavedChanges && activeUploads === 0) {
            saveContent();
        }
    }, 3000);
}

function backupToLocalStorage() {
    if (!CONFIG || !CONFIG.SITE_KEY) return;
    const data = {};
    document.querySelectorAll('[data-section][data-field]').forEach(el => {
        const key = el.dataset.section + '.' + el.dataset.field;
        if (el.classList.contains('image-upload')) {
            const img = el.querySelector('.image-preview img');
            data[key] = (img && img.dataset.url) || '';
        } else {
            data[key] = el.value || '';
        }
    });
    try {
        localStorage.setItem('admin-backup-' + CONFIG.SITE_KEY, JSON.stringify(data));
    } catch (e) {
        // localStorage full or unavailable, ignore
    }
}

function restoreFromLocalStorage() {
    if (!CONFIG || !CONFIG.SITE_KEY) return;
    try {
        const raw = localStorage.getItem('admin-backup-' + CONFIG.SITE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.keys(data).forEach(key => {
            const [section, field] = key.split('.');
            const el = document.querySelector(
                `[data-section="${section}"][data-field="${field}"]`
            );
            if (el && !el.classList.contains('image-upload') && !el.value) {
                el.value = data[key];
            }
        });
    } catch (e) {
        // corrupt data, ignore
    }
}

// Last saved timestamp display
function updateSaveTimeDisplay() {
    const timeEl = document.getElementById('save-time');
    if (!timeEl || !lastSaveTime) {
        if (timeEl) timeEl.textContent = '';
        return;
    }
    const seconds = Math.floor((Date.now() - lastSaveTime) / 1000);
    if (seconds < 10) {
        timeEl.textContent = '(just now)';
    } else if (seconds < 60) {
        timeEl.textContent = '(' + seconds + 's ago)';
    } else {
        const mins = Math.floor(seconds / 60);
        timeEl.textContent = '(' + mins + 'm ago)';
    }
}

// ============ LIVE PREVIEW ============
function updatePreview() {
    if (!previewFrame || !previewFrame.contentDocument) return;
    try {
        const doc = previewFrame.contentDocument;
        document.querySelectorAll('[data-section][data-field]').forEach(el => {
            const key = el.dataset.section + '.' + el.dataset.field;
            let value = '';
            if (el.classList.contains('image-upload')) {
                const img = el.querySelector('.image-preview img');
                value = (img && (img.dataset.url || img.src)) || '';
            } else {
                value = el.value || '';
            }

            // Find matching data-content elements in iframe
            const targets = doc.querySelectorAll('[data-content="' + key + '"]');
            targets.forEach(target => {
                if (target.tagName === 'IMG') {
                    if (value) target.src = value;
                } else if (target.tagName === 'A') {
                    target.textContent = value;
                } else {
                    target.textContent = value;
                }
            });
        });
    } catch (e) {
        // Cross-origin or iframe not ready, ignore
    }
}

// ============ THEME TOGGLE ============
function initTheme() {
    const saved = localStorage.getItem('admin-theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? '' : 'light';
    if (next) {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('admin-theme', next);
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('admin-theme');
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
}

// Get auth headers for authenticated Supabase requests
function getAuthHeaders() {
    return sessionToken ? { 'x-site-token': sessionToken } : {};
}

// ============ AUTHENTICATION ============

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
const hasUrlToken = window.location.hash && window.location.hash.startsWith('#token=');
const storedToken = sessionStorage.getItem('session_token');

if (hasUrlToken) {
    // URL token takes priority — skip stored token validation
    checkTokenLogin();
} else if (sessionStorage.getItem('authenticated') === 'true' && storedToken && supabaseClient) {
    // Validate stored token server-side via RPC
    (async () => {
        try {
            const { data, error } = await supabaseClient.rpc('validate_site_token', { p_token: storedToken });

            if (error || !data || data !== CONFIG.SITE_KEY) {
                // Token expired, invalid, or belongs to different site
                sessionStorage.removeItem('session_token');
                sessionStorage.removeItem('authenticated');
                checkSupabaseSession();
                return;
            }

            // Token valid and matches this site
            sessionToken = storedToken;
            isAuthenticated = true;
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
                global: { headers: { 'x-site-token': sessionToken } }
            });
            showDashboard();
        } catch (err) {
            sessionStorage.removeItem('session_token');
            sessionStorage.removeItem('authenticated');
            checkSupabaseSession();
        }
    })();
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

// ============ TOKEN-BASED LOGIN (NO PASSWORD) ============
// Check for #token= in URL (from portal "Edit Site" button)
// Visible login-screen status reporter so we don't lose magic-link errors
// behind the toast (which lives inside the dashboard and isn't visible
// while the login screen is showing).
function setLoginStatus(msg, isError) {
    const errEl = document.getElementById('login-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';
    errEl.style.color = isError ? '' : '#2C6E3F';
}

async function checkTokenLogin() {
    const hash = window.location.hash;
    if (!(hash && hash.startsWith('#token='))) return;

    const token = decodeURIComponent(hash.substring(7));
    // Clear hash immediately to prevent leaking via referrer/history
    history.replaceState(null, null, window.location.pathname + window.location.search);

    if (!token) {
        setLoginStatus('Sign-in link is missing the token. Try requesting a new one.', true);
        return;
    }
    if (!supabaseClient) {
        setLoginStatus('Could not connect to the server. Check your connection and reload.', true);
        return;
    }

    setLoginStatus('Signing you in\u2026', false);

    try {
        const { data, error } = await supabaseClient.rpc('validate_site_token', { p_token: token });

        if (error) {
            console.error('Token validation RPC error:', error);
            setLoginStatus('Sign-in failed: ' + (error.message || 'server error') + '. Request a fresh link.', true);
            return;
        }
        if (!data) {
            setLoginStatus('Sign-in link has expired. Request a fresh link below.', true);
            return;
        }
        if (data !== CONFIG.SITE_KEY) {
            setLoginStatus('Sign-in link is for a different site.', true);
            return;
        }

        // Token valid — promote it to session
        sessionToken = token;
        sessionStorage.setItem('session_token', sessionToken);
        sessionStorage.setItem('authenticated', 'true');
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            global: { headers: { 'x-site-token': sessionToken } }
        });
        isAuthenticated = true;
        showDashboard();
    } catch (err) {
        console.error('Token login threw:', err);
        setLoginStatus('Sign-in failed: ' + (err && err.message ? err.message : err) + '. Request a fresh link.', true);
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

    // Init mobile tab toggle
    initMobileTabToggle();

    // Start save-time updater
    if (saveTimeInterval) clearInterval(saveTimeInterval);
    saveTimeInterval = setInterval(updateSaveTimeDisplay, 30000);

    // Load Google Business Profile guide (async, non-blocking)
    setTimeout(loadGBPGuide, 400);

    // Load agent readiness panel (async, non-blocking)
    setTimeout(loadAgentReadiness, 500);

    // Load domain status (async, non-blocking)
    setTimeout(loadDomainStatus, 300);

    // Initialise AI content editor (iframe + chat split view)
    initAiEditor();
    setAdminEditorMode('ai');
    updateAdminHeaderHeight();
    if (!window.__adminHeaderResizeAttached) {
        window.__adminHeaderResizeAttached = true;
        window.addEventListener('resize', updateAdminHeaderHeight);
    }
}

// ============ AI EDITOR ============
const aiPendingChanges = []; // { key, value, old_value, label }
let aiSelectedKey = null;
let aiSelectedIsImage = false;
let aiIframeReady = false;
let currentAiPreviewPage = 'index';
let currentAiPreviewDevice = 'desktop';
let revisionCache = [];

const AI_DEFAULT_HINT = 'Click editable text or images in the preview, or describe a content change below.';

function updateAdminHeaderHeight() {
    const header = document.querySelector('.dashboard-header');
    if (!header) return;
    document.documentElement.style.setProperty('--admin-header-height', Math.ceil(header.getBoundingClientRect().height) + 'px');
}

function setAdminEditorMode(mode) {
    updateAdminHeaderHeight();
    const ai = document.getElementById('ai-editor-main');
    const grid = document.getElementById('dashboard-main');
    const toggle = document.getElementById('all-fields-toggle');
    const showFields = mode === 'fields';

    if (ai) {
        if (showFields) ai.setAttribute('hidden', '');
        else ai.removeAttribute('hidden');
    }
    if (grid) {
        if (showFields) grid.removeAttribute('hidden');
        else grid.setAttribute('hidden', '');
    }
    if (saveBar) {
        if (showFields) saveBar.removeAttribute('hidden');
        else saveBar.setAttribute('hidden', '');
    }
    if (dashboard) dashboard.classList.toggle('is-ai-mode', !showFields);
    if (toggle) toggle.textContent = showFields ? 'AI content' : 'All fields';

    if (showFields) {
        setAiToolsDrawerOpen(false);
        movePluginPanels('dashboard');
    }
}

function initAiEditor() {
    const iframe = document.getElementById('ai-preview-iframe');
    const form = document.getElementById('ai-chat-form');
    const input = document.getElementById('ai-chat-input');
    const messages = document.getElementById('ai-chat-messages');
    const clearSelectionBtn = document.getElementById('ai-clear-selection');
    const selectedChipClearBtn = document.getElementById('ai-selected-chip-clear');
    const allFieldsBtn = document.getElementById('all-fields-toggle');
    const guideBtn = document.getElementById('ai-guide-btn');
    const guideCloseBtn = document.getElementById('ai-guide-close-btn');
    const historyBtn = document.getElementById('ai-history-btn');
    const toolsBtn = document.getElementById('ai-tools-btn');
    const toolsCloseBtn = document.getElementById('ai-tools-close-btn');
    const revisionRefreshBtn = document.getElementById('revision-refresh-btn');
    if (!iframe || !form) return;

    initAiPreviewControls();
    initAiImageTools();
    restoreAiChatHistory();

    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            const drawer = document.getElementById('revision-drawer');
            if (!drawer) return;
            const opening = drawer.hasAttribute('hidden');
            if (opening) {
                drawer.removeAttribute('hidden');
                loadRevisionHistory();
            } else {
                drawer.setAttribute('hidden', '');
            }
        });
    }
    if (guideBtn) {
        guideBtn.addEventListener('click', () => {
            const drawer = document.getElementById('ai-guide-drawer');
            if (!drawer) return;
            if (drawer.hasAttribute('hidden')) drawer.removeAttribute('hidden');
            else drawer.setAttribute('hidden', '');
        });
    }
    if (guideCloseBtn) {
        guideCloseBtn.addEventListener('click', () => {
            const drawer = document.getElementById('ai-guide-drawer');
            if (drawer) drawer.setAttribute('hidden', '');
        });
    }
    if (toolsBtn) {
        toolsBtn.addEventListener('click', () => {
            const drawer = document.getElementById('ai-tools-drawer');
            if (!drawer) return;
            const opening = drawer.hasAttribute('hidden');
            setAiToolsDrawerOpen(opening);
        });
    }
    if (toolsCloseBtn) {
        toolsCloseBtn.addEventListener('click', () => setAiToolsDrawerOpen(false));
    }
    if (revisionRefreshBtn) {
        revisionRefreshBtn.addEventListener('click', () => loadRevisionHistory());
    }

    // Toggle between AI content editor + all-fields form
    if (allFieldsBtn) {
        allFieldsBtn.addEventListener('click', () => {
            const ai = document.getElementById('ai-editor-main');
            const grid = document.getElementById('dashboard-main');
            if (!ai || !grid) return;
            const showingForm = !grid.hasAttribute('hidden');
            if (showingForm) {
                setAdminEditorMode('ai');
            } else {
                setAdminEditorMode('fields');
            }
        });
    }

    // Iframe load → inject click-to-select handlers (and run now if already loaded)
    iframe.addEventListener('load', () => {
        aiIframeReady = true;
        injectAiClickHandlers(iframe);
    });
    try {
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
            aiIframeReady = true;
            injectAiClickHandlers(iframe);
        }
    } catch (_) { /* cross-origin guard \u2014 should never hit since same origin */ }

    // Auto-grow textarea + Enter to send
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    // Clear selection
    clearSelectionBtn.addEventListener('click', () => {
        clearAiSelection(AI_DEFAULT_HINT);
    });
    if (selectedChipClearBtn) {
        selectedChipClearBtn.addEventListener('click', () => {
            clearAiSelection(AI_DEFAULT_HINT);
        });
    }

    // Submit chat
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';
        appendChatMessage('user', escapeHtml(text));
        const thinking = appendChatMessage('thinking', '\u2728 Thinking\u2026');
        const sendBtn = form.querySelector('button[type="submit"]');
        sendBtn.disabled = true;

        try {
            const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/admin-edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
                body: JSON.stringify({
                    site_key: CONFIG.SITE_KEY,
                    session_token: sessionToken,
                    prompt: text,
                    selected_key: aiSelectedKey || undefined,
                    plugin_context: getAiPluginContext(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            thinking.remove();
            if (!res.ok || data.error) {
                const message = data.error || ('AI request failed with status ' + res.status);
                appendChatMessage('assistant', escapeHtml(message));
                showToast(message, 'error');
                return;
            }
            renderAiResponse(data);
        } catch (err) {
            thinking.remove();
            const message = 'Couldn\u2019t reach the AI service. Try again or message support@getmeonlinefast.com.';
            appendChatMessage('assistant', message);
            showToast(message, 'error');
        } finally {
            sendBtn.disabled = false;
        }
    });
}

function getAiPluginContext() {
    const plugins = (typeof CONFIG !== 'undefined' && CONFIG.PLUGINS) ? CONFIG.PLUGINS : {};
    const ecommerce = plugins.ecommerce || {};
    return {
        pages: Array.isArray(CONFIG.PAGES) ? CONFIG.PAGES : ['index'],
        ecommerce_enabled: !!ecommerce.enabled,
        shop_enabled: !!(ecommerce.shop && ecommerce.shop.enabled),
        booking_enabled: !!(ecommerce.booking && ecommerce.booking.enabled),
        newsletter_enabled: !!(ecommerce.newsletter && ecommerce.newsletter.enabled),
        contact_button_enabled: !!(plugins.contactButton && plugins.contactButton.enabled),
    };
}

function setAiToolsDrawerOpen(open) {
    const drawer = document.getElementById('ai-tools-drawer');
    if (!drawer) return;
    if (open) {
        movePluginPanels('ai');
        drawer.removeAttribute('hidden');
    } else {
        drawer.setAttribute('hidden', '');
        movePluginPanels('dashboard');
    }
}

function movePluginPanels(target) {
    const panel = document.getElementById('plugin-panels');
    if (!panel) return;
    const host = target === 'ai'
        ? document.getElementById('ai-plugin-panels-host')
        : document.getElementById('dashboard-plugin-panels-host');
    if (!host) return;
    if (panel.parentElement !== host) host.appendChild(panel);
    panel.style.display = target === 'ai' || currentAdminPage === 'index' ? '' : 'none';
}

function aiChatHistoryKey() {
    return 'admin-ai-chat-history-' + (CONFIG.SITE_KEY || 'site');
}

function restoreAiChatHistory() {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(aiChatHistoryKey()) || '[]');
    } catch (_) {
        history = [];
    }
    if (!Array.isArray(history) || history.length === 0) return;

    const welcome = container.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();
    history.slice(-30).forEach(item => {
        if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.html !== 'string') return;
        const div = document.createElement('div');
        div.className = 'ai-chat-msg ' + item.role;
        div.innerHTML = item.html;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function persistAiChatHistory() {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    const items = Array.from(container.querySelectorAll('.ai-chat-msg'))
        .filter(el => !el.classList.contains('thinking'))
        .map(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.ai-chat-actions').forEach(actions => actions.remove());
            clone.querySelectorAll('[data-ai-apply], [data-ai-discard]').forEach(btn => btn.remove());
            clone.querySelectorAll('.ai-change-pill.pending').forEach(pill => pill.classList.remove('pending'));
            return {
                role: el.classList.contains('user') ? 'user' : 'assistant',
                html: clone.innerHTML,
            };
        })
        .slice(-30);
    try {
        localStorage.setItem(aiChatHistoryKey(), JSON.stringify(items));
    } catch (_) {}
}

function initAiImageTools() {
    const uploadBtn = document.getElementById('ai-image-upload-btn');
    const uploadInput = document.getElementById('ai-image-upload-input');
    const generateBtn = document.getElementById('ai-image-generate-btn');

    if (uploadBtn && uploadInput) {
        uploadBtn.addEventListener('click', () => {
            if (!aiSelectedKey || !aiSelectedIsImage) {
                showToast('Select an editable image in the preview first', 'error');
                return;
            }
            uploadInput.click();
        });
        uploadInput.addEventListener('change', () => {
            const file = uploadInput.files && uploadInput.files[0];
            uploadInput.value = '';
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                showToast('Please choose an image file', 'error');
                return;
            }
            replaceSelectedAiImageWithUpload(file);
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            replaceSelectedAiImageWithGeneratedImage();
        });
    }
}

function setAiImageToolsVisible(visible) {
    const tools = document.getElementById('ai-image-tools');
    if (!tools) return;
    if (visible) tools.removeAttribute('hidden');
    else tools.setAttribute('hidden', '');
}

function clearAiSelection(label) {
    aiSelectedKey = null;
    aiSelectedIsImage = false;
    setAiImageToolsVisible(false);

    const clearBtn = document.getElementById('ai-clear-selection');
    if (clearBtn) clearBtn.hidden = true;

    const selectedLabel = document.getElementById('ai-selected-label');
    if (selectedLabel) selectedLabel.textContent = label || AI_DEFAULT_HINT;

    const selectedChip = document.getElementById('ai-selected-chip');
    if (selectedChip) selectedChip.setAttribute('hidden', '');
    const selectedChipLabel = document.getElementById('ai-selected-chip-label');
    if (selectedChipLabel) selectedChipLabel.textContent = 'No element selected';
    const input = document.getElementById('ai-chat-input');
    if (input) input.placeholder = 'Describe a change...';

    const iframe = document.getElementById('ai-preview-iframe');
    try {
        const doc = iframe && iframe.contentDocument;
        if (doc) doc.querySelectorAll('.__ai-selected').forEach(el => el.classList.remove('__ai-selected'));
    } catch (_) {}
}

function setAiSelectionUi(label, selectedKey, isImage, isLayoutOnly) {
    aiSelectedKey = selectedKey || null;
    aiSelectedIsImage = !!isImage && !!selectedKey;
    setAiImageToolsVisible(aiSelectedIsImage);

    const selectedLabel = document.getElementById('ai-selected-label');
    if (selectedLabel) selectedLabel.textContent = label || AI_DEFAULT_HINT;

    const selectedChip = document.getElementById('ai-selected-chip');
    const selectedChipLabel = document.getElementById('ai-selected-chip-label');
    if (selectedChip && selectedChipLabel) {
        selectedChipLabel.textContent = label || 'No element selected';
        selectedChip.removeAttribute('hidden');
    }

    const clearBtn = document.getElementById('ai-clear-selection');
    if (clearBtn) clearBtn.hidden = false;

    const input = document.getElementById('ai-chat-input');
    if (input) {
        if (isLayoutOnly) {
            input.placeholder = 'This is layout-only. Click highlighted copy or image inside it to edit content.';
        } else if (aiSelectedIsImage) {
            input.placeholder = 'Replace this image, or describe the image change...';
        } else {
            input.placeholder = 'What do you want to change about this content?';
        }
        input.focus();
    }
}

function getReadableElementLabel(el) {
    if (!el || !el.tagName) return 'element';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const classes = el.classList
        ? Array.from(el.classList)
            .filter(c => c && !c.startsWith('__') && c !== 'data-ai-selected')
            .slice(0, 2)
            .map(c => '.' + c)
            .join('')
        : '';
    const key = el.getAttribute && el.getAttribute('data-content');
    const text = (el.textContent || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 42);
    if (key) return key + (text ? ' - "' + text + (text.length === 42 ? '...' : '') + '"' : '');
    return tag + id + classes + (text ? ' - "' + text + (text.length === 42 ? '...' : '') + '"' : '');
}

function parseContentKey(key) {
    const dotIdx = String(key || '').indexOf('.');
    if (dotIdx < 1) return null;
    return {
        section: key.slice(0, dotIdx),
        fieldName: key.slice(dotIdx + 1),
    };
}

function looksLikeImageField(key) {
    const field = String(key || '').split('.').pop() || '';
    return /(image|img|photo|picture|logo|gallery|avatar|thumbnail|background|banner)/i.test(field);
}

async function replaceSelectedAiImageWithUpload(file) {
    if (!aiSelectedKey || !aiSelectedIsImage) {
        showToast('Select an editable image in the preview first', 'error');
        return;
    }
    const uploadBtn = document.getElementById('ai-image-upload-btn');
    try {
        if (uploadBtn) uploadBtn.disabled = true;
        const publicUrl = await uploadAiImageToStorage(file, aiSelectedKey, file.name);
        await applyAiFieldChange(aiSelectedKey, publicUrl, 'Image replaced', 'ai');
        appendChatMessage('assistant', 'Image replaced and saved. It is live on the site now.');
        showToast('Image replaced', 'success');
    } catch (err) {
        console.error('AI image upload failed:', err);
        const message = err && err.message ? err.message : 'Failed to replace image';
        appendChatMessage('assistant', escapeHtml(message));
        showToast(message, 'error');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

async function replaceSelectedAiImageWithGeneratedImage() {
    if (!aiSelectedKey || !aiSelectedIsImage) {
        showToast('Select an editable image in the preview first', 'error');
        return;
    }
    if (!CONFIG.SUPABASE_URL || !sessionToken) {
        showToast('Sign in again before generating an image', 'error');
        return;
    }

    const imagePrompt = window.prompt('Describe the replacement image');
    if (!imagePrompt || !imagePrompt.trim()) return;

    const generateBtn = document.getElementById('ai-image-generate-btn');
    appendChatMessage('user', escapeHtml('Generate image: ' + imagePrompt.trim()));
    const thinking = appendChatMessage('thinking', 'Generating image...');

    try {
        if (generateBtn) generateBtn.disabled = true;
        const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/image-gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
            body: JSON.stringify({
                site_key: CONFIG.SITE_KEY,
                session_token: sessionToken,
                prompt: imagePrompt.trim(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            throw new Error(data.error || ('Image generation failed with status ' + res.status));
        }
        const firstImage = data.images && data.images[0];
        if (!firstImage || !firstImage.base64 || !firstImage.mimeType) {
            throw new Error('Image generation returned no image');
        }

        const blob = base64ToBlob(firstImage.base64, firstImage.mimeType);
        const publicUrl = await uploadAiImageToStorage(blob, aiSelectedKey, 'ai-generated.' + extensionForImage(firstImage.mimeType));
        await applyAiFieldChange(aiSelectedKey, publicUrl, 'Generated image', 'ai');

        thinking.remove();
        appendChatMessage('assistant', 'Generated image applied and saved. It is live on the site now.');
        showToast('Generated image saved', 'success');
    } catch (err) {
        thinking.remove();
        console.error('AI image generation failed:', err);
        const message = err && err.message ? err.message : 'Failed to generate image';
        appendChatMessage('assistant', escapeHtml(message));
        showToast(message, 'error');
    } finally {
        if (generateBtn) generateBtn.disabled = false;
    }
}

async function uploadAiImageToStorage(blob, key, originalName) {
    if (!supabaseClient) throw new Error('Storage is not available in demo mode');

    const parsed = parseContentKey(key);
    if (!parsed) throw new Error('Selected image field is invalid');

    const ext = extensionForImage(blob.type, originalName);
    const fileName = `${CONFIG.SITE_KEY}/${parsed.section}-${parsed.fieldName}-${Date.now()}.${ext}`;
    const options = { upsert: true };
    if (blob.type) options.contentType = blob.type;

    const { error } = await supabaseClient.storage
        .from('site-images')
        .upload(fileName, blob, options);

    if (error) throw error;

    const { data: urlData } = supabaseClient.storage
        .from('site-images')
        .getPublicUrl(fileName);

    if (!urlData || !urlData.publicUrl) throw new Error('Could not get uploaded image URL');
    return urlData.publicUrl;
}

function extensionForImage(mimeType, originalName) {
    const fromName = String(originalName || '').split('.').pop();
    if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
        return fromName.toLowerCase() === 'jpeg' ? 'jpg' : fromName.toLowerCase();
    }
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/avif': 'avif',
    };
    return map[mimeType] || 'png';
}

function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType || 'image/png' });
}

async function applyAiFieldChange(key, value, label, source) {
    if (!supabaseClient) throw new Error('Saving is not available in demo mode');

    const parsed = parseContentKey(key);
    if (!parsed) throw new Error('Invalid content field');

    const oldValue = contentCache[key] || '';
    const nextValue = value || '';

    const { error } = await supabaseClient
        .from('site_content')
        .upsert({
            site_key: CONFIG.SITE_KEY,
            section: parsed.section,
            field_name: parsed.fieldName,
            content: nextValue,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'site_key,section,field_name' });

    if (error) throw error;

    updateAiPreviewField(key, nextValue, true);
    const formInput = getFieldControl(parsed.section, parsed.fieldName);
    if (formInput) setFieldControlValue(formInput, nextValue);
    contentCache[key] = nextValue;
    pushToHistory(parsed.section, parsed.fieldName, oldValue, nextValue);

    if (oldValue !== nextValue) {
        await recordContentRevisions([{
            site_key: CONFIG.SITE_KEY,
            section: parsed.section,
            field_name: parsed.fieldName,
            old_content: oldValue,
            new_content: nextValue,
            source: source || 'ai',
        }]);
    }

    lastSaveTime = Date.now();
    updateSaveTimeDisplay();
    if (!hasUnsavedChanges) updateSaveStatus('saved');
    if (saveBar) {
        saveBar.classList.add('just-saved');
        setTimeout(() => saveBar.classList.remove('just-saved'), 500);
    }
    return { key, value: nextValue, label: label || key };
}

function initAiPreviewControls() {
    const urlBar = document.getElementById('ai-preview-url');
    if (urlBar && typeof CONFIG !== 'undefined' && CONFIG.SITE_KEY) {
        urlBar.textContent = CONFIG.SITE_KEY + '.onrender.com';
    }

    const tabs = document.getElementById('ai-preview-page-tabs');
    const deviceButtons = document.querySelectorAll('[data-ai-device]');
    if (tabs && CONFIG.PAGES && CONFIG.PAGES.length > 1) {
        const labels = { index: 'Home', about: 'About', services: 'Services', contact: 'Contact', terms: 'Terms', privacy: 'Privacy' };
        tabs.innerHTML = CONFIG.PAGES.map(page => {
            const label = labels[page] || page.charAt(0).toUpperCase() + page.slice(1);
            const active = page === currentAiPreviewPage ? ' active' : '';
            return '<button type="button" class="ai-preview-page-tab' + active + '" data-ai-page="' + escapeHtml(page) + '">' + escapeHtml(label) + '</button>';
        }).join('');
        tabs.hidden = false;
        tabs.addEventListener('click', (e) => {
            const tab = e.target.closest('[data-ai-page]');
            if (!tab) return;
            switchAiPreviewPage(tab.dataset.aiPage || 'index');
        });
    }

    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            setAiPreviewDevice(btn.dataset.aiDevice || 'desktop');
        });
    });
}

function pageToFile(page) {
    return page === 'index' ? 'index.html' : page + '.html';
}

function switchAiPreviewPage(page) {
    currentAiPreviewPage = page || 'index';
    const iframe = document.getElementById('ai-preview-iframe');
    if (iframe) {
        iframe.src = pageToFile(currentAiPreviewPage) + '?cb=admin';
    }
    document.querySelectorAll('[data-ai-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.aiPage === currentAiPreviewPage);
    });
    clearAiSelection(AI_DEFAULT_HINT);
}

function setAiPreviewDevice(device) {
    currentAiPreviewDevice = device === 'mobile' ? 'mobile' : 'desktop';
    const shell = document.getElementById('ai-preview-device-shell');
    if (shell) shell.classList.toggle('is-mobile', currentAiPreviewDevice === 'mobile');
    document.querySelectorAll('[data-ai-device]').forEach(btn => {
        const active = btn.dataset.aiDevice === currentAiPreviewDevice;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function resolveAiClickTarget(rawTarget, doc) {
    let node = rawTarget;
    const inlineTags = { a: 1, span: 1, em: 1, strong: 1, i: 1, b: 1, small: 1, sup: 1, sub: 1, mark: 1, time: 1, abbr: 1 };
    while (node && node !== doc.body && node.nodeType === 1) {
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (!inlineTags[tag]) break;
        if (!node.parentElement) break;
        node = node.parentElement;
    }
    return (node && node.nodeType === 1) ? node : rawTarget;
}

function injectAiClickHandlers(iframe) {
    let doc;
    try { doc = iframe.contentDocument; } catch (e) { return; }
    if (!doc) return;
    if (doc.__aiHandlersAttached) return;
    doc.__aiHandlersAttached = true;

    // Inject hover/select highlight CSS into the iframe
    const style = doc.createElement('style');
    style.textContent =
        '[data-content]{cursor:crosshair!important;}' +
        '[data-content].__ai-editable{outline:1px solid rgba(201,68,43,.18)!important;outline-offset:2px!important;}' +
        '.__ai-hover{outline:2px dashed #C9442B!important;outline-offset:3px!important;cursor:crosshair!important;}' +
        '.__ai-selected{outline:3px solid #C9442B!important;outline-offset:3px!important;background:rgba(201,68,43,0.07)!important;}';
    doc.head.appendChild(style);
    doc.querySelectorAll('[data-content]').forEach(el => el.classList.add('__ai-editable'));

    let lastHover = null;
    doc.addEventListener('mouseover', (e) => {
        const target = findEditableTarget(resolveAiClickTarget(e.target, doc));
        if (lastHover && lastHover !== target) lastHover.classList.remove('__ai-hover');
        if (target) { target.classList.add('__ai-hover'); lastHover = target; }
    }, true);
    doc.addEventListener('mouseout', () => { if (lastHover) lastHover.classList.remove('__ai-hover'); }, true);
    doc.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rawTarget = resolveAiClickTarget(e.target, doc);
        const target = findEditableTarget(rawTarget);

        doc.querySelectorAll('.__ai-selected').forEach(el => el.classList.remove('__ai-selected'));

        if (!target) {
            if (rawTarget && rawTarget !== doc.body && rawTarget !== doc.documentElement) {
                rawTarget.classList.add('__ai-selected');
                setAiSelectionUi('Layout selected: ' + getReadableElementLabel(rawTarget) + '. Published sites can edit saved copy/images only.', null, false, true);
            } else {
                clearAiSelection('That part is layout/design. This dashboard edits saved content fields.');
            }
            return;
        }
        const key = target.getAttribute('data-content');
        if (!key) return;

        target.classList.add('__ai-selected');

        const isImage = target.tagName === 'IMG' || looksLikeImageField(key);
        const fieldText = (target.textContent || target.alt || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        const fieldPreview = isImage ? 'image field' : (fieldText ? '"' + fieldText + '"' : 'content field');
        setAiSelectionUi('Editing: ' + key + ' - ' + fieldPreview, key, isImage, false);
    }, true);
}

function findEditableTarget(start) {
    let node = start;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
        if (node.getAttribute && node.getAttribute('data-content')) return node;
        node = node.parentElement;
        depth++;
    }
    return null;
}

function appendChatMessage(role, html) {
    const container = document.getElementById('ai-chat-messages');
    // Remove welcome card on first real message
    const welcome = container.querySelector('.ai-chat-welcome');
    if (welcome && role !== 'thinking') welcome.remove();
    const div = document.createElement('div');
    div.className = 'ai-chat-msg ' + role;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (role !== 'thinking') persistAiChatHistory();
    return div;
}

function renderAiResponse(data) {
    const message = data && data.message ? data.message : 'Done.';
    const changes = (data && Array.isArray(data.changes)) ? data.changes : [];
    let html = escapeHtml(message);
    if (changes.length > 0) {
        html += '<div style="margin-top:10px;">';
        changes.forEach(c => {
            html += '<span class="ai-change-pill pending">' + escapeHtml(c.label || c.key) + '</span>';
        });
        html += '</div>';
        html += '<div class="ai-chat-actions">';
        html += '<button type="button" class="primary" data-ai-apply="1">Apply ' + (changes.length === 1 ? 'change' : 'all') + '</button>';
        html += '<button type="button" data-ai-discard="1">Discard</button>';
        html += '</div>';
    }
    const msgEl = appendChatMessage('assistant', html);

    if (changes.length > 0) {
        msgEl.querySelector('[data-ai-apply]').addEventListener('click', () => applyAiChanges(changes, msgEl));
        msgEl.querySelector('[data-ai-discard]').addEventListener('click', () => {
            msgEl.querySelector('.ai-chat-actions').remove();
            msgEl.querySelectorAll('.ai-change-pill').forEach(p => { p.style.opacity = '0.5'; p.textContent = '\u2717 ' + p.textContent; });
            persistAiChatHistory();
        });
    }
}

async function applyAiChanges(changes, msgEl) {
    const actions = msgEl.querySelector('.ai-chat-actions');
    if (actions) {
        const buttons = actions.querySelectorAll('button');
        buttons.forEach(b => b.disabled = true);
        actions.querySelector('.primary').textContent = 'Saving\u2026';
    }

    const iframe = document.getElementById('ai-preview-iframe');
    const idoc = iframe ? iframe.contentDocument : null;

    let saved = 0;
    let failed = 0;
    const results = [];
    const revisions = [];
    for (const change of changes) {
        const dotIdx = change.key.indexOf('.');
        if (dotIdx < 0) {
            failed++;
            results.push(false);
            continue;
        }
        const section = change.key.slice(0, dotIdx);
        const fieldName = change.key.slice(dotIdx + 1);
        const oldValue = Object.prototype.hasOwnProperty.call(change, 'old_value')
            ? (change.old_value || '')
            : (contentCache[change.key] || '');

        try {
            const { error } = await supabaseClient
                .from('site_content')
                .upsert({
                    site_key: CONFIG.SITE_KEY,
                    section,
                    field_name: fieldName,
                    content: change.value,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'site_key,section,field_name' });
            if (error) {
                console.error('Upsert failed for', change.key, error);
                failed++;
                results.push(false);
                continue;
            }

            // Reflect in iframe immediately
            updateAiPreviewField(change.key, change.value, true);
            // Reflect in form (if rendered)
            const formInput = getFieldControl(section, fieldName);
            if (formInput) setFieldControlValue(formInput, change.value);
            // Update local cache
            contentCache[change.key] = change.value;
            pushToHistory(section, fieldName, oldValue, change.value);
            if (oldValue !== change.value) {
                revisions.push({
                    site_key: CONFIG.SITE_KEY,
                    section,
                    field_name: fieldName,
                    old_content: oldValue,
                    new_content: change.value,
                    source: 'ai',
                });
            }
            saved++;
            results.push(true);
        } catch (e) {
            console.error('Save error for', change.key, e);
            failed++;
            results.push(false);
        }
    }
    if (revisions.length) await recordContentRevisions(revisions);

    if (actions) actions.remove();
    msgEl.querySelectorAll('.ai-change-pill').forEach((p, idx) => {
        p.classList.remove('pending');
        if (results[idx]) {
            p.textContent = '\u2713 ' + p.textContent;
        } else {
            p.style.opacity = '0.75';
            p.textContent = '\u2717 ' + p.textContent;
        }
    });
    if (failed > 0) {
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:8px;font-size:12px;color:#7A1508;';
        note.textContent = saved + ' saved, ' + failed + ' failed. Try again or message support@getmeonlinefast.com.';
        msgEl.appendChild(note);
    } else {
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:6px;font-size:12px;color:#2C6E3F;';
        note.textContent = 'Saved \u2014 visible on your site instantly.';
        msgEl.appendChild(note);
    }
    if (saved > 0) {
        lastSaveTime = Date.now();
        updateSaveTimeDisplay();
        if (!hasUnsavedChanges) updateSaveStatus('saved');
        showToast(saved === 1 ? 'AI change saved' : saved + ' AI changes saved', 'success');
    }
    // Clear selection after a successful apply
    if (saved > 0) {
        clearAiSelection(AI_DEFAULT_HINT);
    }
    persistAiChatHistory();
}

async function recordContentRevisions(revisions) {
    if (!supabaseClient || !Array.isArray(revisions) || revisions.length === 0) return;
    try {
        const { error } = await supabaseClient
            .from('site_content_revisions')
            .insert(revisions);
        if (error) console.warn('Revision insert failed:', error.message || error);
        const drawer = document.getElementById('revision-drawer');
        if (!error && drawer && !drawer.hasAttribute('hidden')) loadRevisionHistory();
    } catch (e) {
        console.warn('Revision insert failed:', e);
    }
}

async function loadRevisionHistory() {
    const list = document.getElementById('revision-list');
    if (!list || !supabaseClient) return;
    list.innerHTML = '<p class="revision-empty">Loading changes...</p>';
    try {
        const { data, error } = await supabaseClient
            .from('site_content_revisions')
            .select('id, site_key, section, field_name, old_content, new_content, source, created_at')
            .eq('site_key', CONFIG.SITE_KEY)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        revisionCache = data || [];
        renderRevisionHistory();
    } catch (e) {
        console.warn('Failed to load revisions:', e);
        list.innerHTML = '<p class="revision-empty">Could not load recent changes.</p>';
    }
}

function renderRevisionHistory() {
    const list = document.getElementById('revision-list');
    if (!list) return;
    if (!revisionCache.length) {
        list.innerHTML = '<p class="revision-empty">No saved changes yet.</p>';
        return;
    }
    list.innerHTML = revisionCache.map((rev, idx) => {
        const key = rev.section + '.' + rev.field_name;
        const when = formatRevisionTime(rev.created_at);
        const preview = (rev.new_content || '').replace(/\s+/g, ' ').slice(0, 120);
        return '<div class="revision-item">' +
            '<div>' +
                '<div class="revision-meta">' +
                    '<span class="revision-field">' + escapeHtml(key) + '</span>' +
                    '<span class="revision-source">' + escapeHtml(rev.source || 'manual') + '</span>' +
                    '<span>' + escapeHtml(when) + '</span>' +
                '</div>' +
                '<div class="revision-preview">' + escapeHtml(preview || '(empty)') + '</div>' +
            '</div>' +
            '<button type="button" data-revision-rollback="' + idx + '">Rollback</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-revision-rollback]').forEach(btn => {
        btn.addEventListener('click', () => rollbackRevision(parseInt(btn.dataset.revisionRollback, 10)));
    });
}

function formatRevisionTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return date.toLocaleDateString();
}

async function rollbackRevision(index) {
    const rev = revisionCache[index];
    if (!rev || !supabaseClient) return;
    const key = rev.section + '.' + rev.field_name;
    const currentValue = contentCache[key] || rev.new_content || '';
    const rollbackValue = rev.old_content || '';
    try {
        const { error } = await supabaseClient
            .from('site_content')
            .upsert({
                site_key: CONFIG.SITE_KEY,
                section: rev.section,
                field_name: rev.field_name,
                content: rollbackValue,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'site_key,section,field_name' });
        if (error) throw error;

        const formInput = getFieldControl(rev.section, rev.field_name);
        if (formInput) setFieldControlValue(formInput, rollbackValue);
        updateAiPreviewField(key, rollbackValue, true);
        pushToHistory(rev.section, rev.field_name, currentValue, rollbackValue);
        contentCache[key] = rollbackValue;
        lastSaveTime = Date.now();
        updateSaveStatus(hasUnsavedChanges ? 'unsaved' : 'saved');
        updateSaveTimeDisplay();
        showToast('Rolled back ' + key, 'success');
        await recordContentRevisions([{
            site_key: CONFIG.SITE_KEY,
            section: rev.section,
            field_name: rev.field_name,
            old_content: currentValue,
            new_content: rollbackValue,
            source: 'manual',
        }]);
    } catch (e) {
        console.error('Rollback failed:', e);
        showToast('Rollback failed. Try again or message support@getmeonlinefast.com.', 'error');
    }
}

function flashIframeElement(el) {
    if (!el) return;
    const original = el.style.transition;
    const originalBg = el.style.backgroundColor;
    el.style.transition = 'background-color 0.6s ease';
    el.style.backgroundColor = 'rgba(201, 68, 43, 0.18)';
    setTimeout(() => {
        el.style.backgroundColor = originalBg;
        setTimeout(() => { el.style.transition = original; }, 700);
    }, 200);
}

// Mobile tab toggle removed — no preview pane
function initMobileTabToggle() {}

// ============ MULTI-PAGE TABS ============
function isMultiPageSite() {
    return CONFIG.PAGES && CONFIG.PAGES.length > 1;
}

function initPageTabs() {
    const tabBar = document.getElementById('page-tabs-bar');
    if (!tabBar || !isMultiPageSite()) return;

    const pageLabels = { index: 'Home', about: 'About', services: 'Services', contact: 'Contact' };
    let tabsHtml = '';
    CONFIG.PAGES.forEach(page => {
        const label = pageLabels[page] || page.charAt(0).toUpperCase() + page.slice(1);
        const activeClass = page === currentAdminPage ? ' active' : '';
        tabsHtml += '<button class="admin-page-tab' + activeClass + '" data-page="' + escapeHtml(page) + '">' + escapeHtml(label) + '</button>';
    });
    tabBar.innerHTML = tabsHtml;
    tabBar.style.display = 'flex';

    tabBar.addEventListener('click', function(e) {
        const tab = e.target.closest('.admin-page-tab');
        if (!tab) return;
        const page = tab.dataset.page;
        if (page === currentAdminPage) return;
        switchAdminPage(page);
    });
}

function switchAdminPage(page) {
    currentAdminPage = page;

    // Update tab active state
    const tabBar = document.getElementById('page-tabs-bar');
    if (tabBar) {
        tabBar.querySelectorAll('.admin-page-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });
    }

    // Show/hide sections based on page
    filterSectionsByPage();

    // Switch preview iframe
    if (previewFrame) {
        const pageFile = page === 'index' ? 'index.html' : page + '.html';
        previewFrame.src = pageFile;
        const urlBar = document.getElementById('preview-url-bar');
        if (urlBar) urlBar.textContent = pageFile;
    }
}

function filterSectionsByPage() {
    if (!isMultiPageSite()) return;
    const sections = contentSections.querySelectorAll('.editor-section');
    sections.forEach(el => {
        const sectionPage = el.dataset.page || 'index';
        // Sections without a page attribute belong to the index page
        if (sectionPage === currentAdminPage) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
    // Plugin panels only visible on the home page
    const pluginPanels = document.getElementById('plugin-panels');
    if (pluginPanels) {
        pluginPanels.style.display = currentAdminPage === 'index' ? '' : 'none';
    }
}

// ============ GENERATE FORM FROM SCHEMA ============
// Normalise SCHEMA. The site-generator sometimes emits a NESTED structure
// ({id, name, fields:[…]}) and sometimes a FLAT one ({key, type, label, placeholder}).
// Detect and group flat into sections so the rest of the dashboard sees a uniform shape.
function getNormalisedSchema() {
    const raw = CONFIG && CONFIG.SCHEMA;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    // If first entry has `fields`, it's already nested.
    if (raw[0] && Array.isArray(raw[0].fields)) return raw;
    // Otherwise group flat entries by the prefix before '.' in their key.
    const sections = {};
    const order = [];
    raw.forEach(item => {
        if (!item || typeof item.key !== 'string') return;
        const dot = item.key.indexOf('.');
        const sectionId = dot >= 0 ? item.key.slice(0, dot) : 'general';
        const fieldId = dot >= 0 ? item.key.slice(dot + 1) : item.key;
        if (!sections[sectionId]) {
            sections[sectionId] = {
                id: sectionId,
                name: sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/[_-]/g, ' '),
                page: item.page || undefined,
                fields: [],
            };
            order.push(sectionId);
        }
        sections[sectionId].fields.push({
            id: fieldId,
            type: item.type || 'text',
            label: item.label || fieldId,
            placeholder: item.placeholder || '',
        });
    });
    return order.map(id => sections[id]);
}

function generateFormFromSchema() {
    const SCHEMA = getNormalisedSchema();
    if (!SCHEMA.length) {
        contentSections.innerHTML = '<p class="error-text">No schema defined in config.js</p>';
        return;
    }

    let html = '';

    SCHEMA.forEach(section => {
        // Add data-page attribute for multi-page filtering
        const pageAttr = section.page ? ' data-page="' + escapeHtml(section.page) + '"' : '';
        html += `
            <section class="editor-section"${pageAttr}>
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

    // Initialize page tabs if multi-page
    initPageTabs();
    if (isMultiPageSite()) {
        filterSectionsByPage();
    }

    // Attach event listeners for image uploads
    initImageUploads();

    // Track changes on all inputs (auto-save, backup, undo, preview)
    document.querySelectorAll('input:not([type="file"]), textarea').forEach(input => {
        // Store initial value for undo tracking. This is also updated when AI
        // applies a change, so later manual edits start from the correct value.
        input.dataset.historyValue = input.value || '';
        let historyDebounce = null;

        input.addEventListener('input', () => {
            hasUnsavedChanges = true;
            updateSaveStatus('unsaved');
            resetAutoSaveTimer();
            backupToLocalStorage();
            updatePreview();

            // Debounced history push (500ms)
            const section = input.dataset.section;
            const field = input.dataset.field;
            if (section && field && !isApplyingHistory) {
                if (historyDebounce) clearTimeout(historyDebounce);
                const capturedOld = input.dataset.historyValue || '';
                historyDebounce = setTimeout(() => {
                    const newVal = input.value || '';
                    if (capturedOld !== newVal) {
                        pushToHistory(section, field, capturedOld, newVal);
                        input.dataset.historyValue = newVal;
                    }
                }, 500);
            }
        });
    });
}

function generateFieldsHtml(sectionId, fields) {
    // Detect xxxN_yyy patterns for grouping
    const groupPattern = /^(.+?)(\d+)_(.+)$/;
    const groups = {};
    const ungrouped = [];

    fields.forEach(field => {
        const match = field.id.match(groupPattern);
        if (match) {
            const prefix = match[1];
            const num = match[2];
            const suffix = match[3];
            const groupKey = prefix + num;
            if (!groups[groupKey]) {
                groups[groupKey] = { prefix, num: parseInt(num, 10), fields: [] };
            }
            groups[groupKey].fields.push(field);
        } else {
            ungrouped.push({ type: 'field', field });
        }
    });

    // Build ordered list: ungrouped fields and grouped fields in order
    // Figure out where groups fall relative to ungrouped fields
    const allItems = [];
    const processedGroups = new Set();

    fields.forEach(field => {
        const match = field.id.match(groupPattern);
        if (match) {
            const groupKey = match[1] + match[2];
            if (!processedGroups.has(groupKey)) {
                processedGroups.add(groupKey);
                allItems.push({ type: 'group', group: groups[groupKey], key: groupKey });
            }
        } else {
            allItems.push({ type: 'field', field });
        }
    });

    return allItems.map(item => {
        if (item.type === 'field') {
            return renderFieldHtml(sectionId, item.field);
        } else {
            const g = item.group;
            const label = capitalize(g.prefix) + ' ' + g.num;
            const innerHtml = g.fields.map(f => renderFieldHtml(sectionId, f)).join('');
            return `
                <div class="field-group">
                    <div class="field-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <h4>${escapeHtml(label)}</h4>
                        <span class="field-group-toggle">&#9660;</span>
                    </div>
                    <div class="field-group-body">
                        ${innerHtml}
                    </div>
                </div>
            `;
        }
    }).join('');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderFieldHtml(sectionId, field) {
    const fieldId = `${sectionId}-${field.id}`;
    const key = `${sectionId}.${field.id}`;
    const dataAttrs = `data-section="${sectionId}" data-field="${field.id}" data-key="${escapeHtml(key)}"`;

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
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;')
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
            resetAutoSaveTimer();
            backupToLocalStorage();
            updatePreview();
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
        // Show spinner overlay + track active uploads
        activeUploads++;
        updateUploadUI();
        let spinner = uploadEl.querySelector('.upload-spinner-overlay');
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.className = 'upload-spinner-overlay';
            spinner.innerHTML = '<div class="upload-spinner"></div>';
            uploadEl.appendChild(spinner);
        } else {
            spinner.style.display = 'flex';
        }

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
            updatePreview();

        } catch (err) {
            console.error('Error uploading image:', err);
            showToast('Failed to upload image', 'error');
        } finally {
            // Remove spinner, decrement counter
            if (spinner) spinner.style.display = 'none';
            activeUploads--;
            updateUploadUI();
        }
    }
}

function updateUploadUI() {
    if (uploadStatusEl) {
        uploadStatusEl.style.display = activeUploads > 0 ? 'inline' : 'none';
    }
    if (saveBtn) {
        saveBtn.disabled = activeUploads > 0;
    }
}

// ============ LOAD CONTENT ============
async function loadContent() {
    if (!supabaseClient) {
        // In demo mode, try restoring from localStorage
        restoreFromLocalStorage();
        return;
    }

    try {
        await withRetry(async () => {
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
                    setFieldControlValue(input, item.content || '');
                }
            });

            lastSaveTime = Date.now();
            updateSaveStatus('saved');
            updateSaveTimeDisplay();
            updatePreview();
        }, 'Loading content');

    } catch (err) {
        console.error('Error loading content:', err);
        showToast('Failed to load content', 'error');
        // Fall back to localStorage backup
        restoreFromLocalStorage();
    }
}

// ============ SAVE CONTENT ============
saveBtn.addEventListener('click', () => saveContent());

if (retryBtn) {
    retryBtn.addEventListener('click', () => saveContent());
}

async function saveContent() {
    if (!supabaseClient) {
        showToast('Demo mode: Changes not saved', 'error');
        return;
    }

    // Cancel any pending auto-save
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    saveBtn.disabled = true;
    if (retryBtn) retryBtn.style.display = 'none';
    updateSaveStatus('saving');

    try {
        await withRetry(async () => {
            const updates = [];
            const revisions = [];

            // Gather text inputs
            document.querySelectorAll('[data-section][data-field]').forEach(el => {
                const section = el.dataset.section;
                const field = el.dataset.field;
                const key = section + '.' + field;

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
                const oldContent = contentCache[key] || '';
                if (oldContent !== content) {
                    revisions.push({
                        site_key: CONFIG.SITE_KEY,
                        section,
                        field_name: field,
                        old_content: oldContent,
                        new_content: content,
                        source: 'manual',
                    });
                }
            });

            // Upsert all content with session token header
            for (const update of updates) {
                const { error } = await supabaseClient
                    .from('site_content')
                    .upsert(update, {
                        onConflict: 'site_key,section,field_name'
                    });

                if (error) throw error;
                contentCache[update.section + '.' + update.field_name] = update.content;
            }
            if (revisions.length) await recordContentRevisions(revisions);
        }, 'Saving changes');

        hasUnsavedChanges = false;
        lastSaveTime = Date.now();
        updateSaveStatus('saved');
        updateSaveTimeDisplay();

        // Green flash
        if (saveBar) {
            saveBar.classList.add('just-saved');
            setTimeout(() => saveBar.classList.remove('just-saved'), 500);
        }

        showToast('Changes saved!', 'success');

        // Clear localStorage backup on successful save
        if (CONFIG && CONFIG.SITE_KEY) {
            try { localStorage.removeItem('admin-backup-' + CONFIG.SITE_KEY); } catch (e) {}
        }

    } catch (err) {
        console.error('Error saving:', err);
        updateSaveStatus('error');
        if (retryBtn) retryBtn.style.display = 'inline-flex';
        showToast('Failed to save changes', 'error');
    } finally {
        if (activeUploads === 0) {
            saveBtn.disabled = false;
        }
    }
}

// ============ UI HELPERS ============
function updateSaveStatus(status) {
    const statusText = saveStatus.querySelector('.status-text');

    saveStatus.classList.remove('saved', 'unsaved', 'saving', 'error');
    saveStatus.classList.add(status);

    // Update save bar state classes
    if (saveBar) {
        saveBar.classList.remove('unsaved', 'error');
        if (status === 'unsaved') saveBar.classList.add('unsaved');
        if (status === 'error') saveBar.classList.add('error');
    }

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

// ============ CONTEXT-AWARE TOAST ============
let toastTimer = null;
let toastHovered = false;

toast.addEventListener('mouseenter', () => {
    toastHovered = true;
    if (toastTimer) clearTimeout(toastTimer);
});

toast.addEventListener('mouseleave', () => {
    toastHovered = false;
    // Resume dismiss with remaining time (use 1s as minimum)
    scheduleToastDismiss(1000);
});

// Toast close button
const toastCloseBtn = toast.querySelector('.toast-close');
if (toastCloseBtn) {
    toastCloseBtn.addEventListener('click', () => {
        dismissToast();
    });
}

function showToast(message, type) {
    if (type === undefined) type = 'info';
    toast.querySelector('.toast-message').textContent = message;
    toast.className = 'toast visible ' + type;

    // Clear existing timer
    if (toastTimer) clearTimeout(toastTimer);
    toastHovered = false;

    // Context-aware durations
    let duration;
    switch (type) {
        case 'success': duration = 2500; break;
        case 'info':    duration = 4000; break;
        case 'error':   duration = 6000; break;
        default:        duration = 3000; break;
    }

    scheduleToastDismiss(duration);
}

function scheduleToastDismiss(duration) {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        if (!toastHovered) {
            dismissToast();
        }
    }, duration);
}

function dismissToast() {
    toast.classList.remove('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
}

// Warn on unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;

    // Ctrl/Cmd+S: Save
    if (mod && e.key === 's') {
        e.preventDefault();
        if (isAuthenticated && activeUploads === 0) {
            saveContent();
        }
        return;
    }

    // Ctrl/Cmd+Shift+Z: Redo
    if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        performRedo();
        return;
    }

    // Ctrl/Cmd+Z: Undo (must check after Shift+Z)
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
    }

    // Ctrl/Cmd+/: Toggle shortcuts help
    if (mod && e.key === '/') {
        e.preventDefault();
        toggleShortcutsOverlay();
        return;
    }

    // Escape: close shortcuts overlay
    if (e.key === 'Escape' && shortcutsOverlay && shortcutsOverlay.style.display !== 'none') {
        shortcutsOverlay.style.display = 'none';
    }
});

function toggleShortcutsOverlay() {
    if (!shortcutsOverlay) return;
    if (shortcutsOverlay.style.display === 'none') {
        shortcutsOverlay.style.display = 'flex';
    } else {
        shortcutsOverlay.style.display = 'none';
    }
}

if (shortcutsCloseBtn) {
    shortcutsCloseBtn.addEventListener('click', () => {
        shortcutsOverlay.style.display = 'none';
    });
}

// Close shortcuts overlay on backdrop click
if (shortcutsOverlay) {
    shortcutsOverlay.addEventListener('click', (e) => {
        if (e.target === shortcutsOverlay) {
            shortcutsOverlay.style.display = 'none';
        }
    });
}

// Undo/Redo buttons
if (undoBtn) undoBtn.addEventListener('click', performUndo);
if (redoBtn) redoBtn.addEventListener('click', performRedo);

// ============ GOOGLE BUSINESS PROFILE GUIDE ============

function loadGBPGuide() {
    var siteKey = CONFIG.SITE_KEY || 'site';
    var dismissKey = 'gbp-dismissed-' + siteKey;
    var doneKey = 'gbp-done-' + siteKey;

    // Already dismissed — don't show
    if (localStorage.getItem(dismissKey) === 'true') return;

    var container = document.getElementById('gbp-guide-section');
    if (!container) return;

    // Pull data from contentCache
    var bizName = contentCache['site.name'] || contentCache['hero.title'] || contentCache['hero.headline'] || '';
    var bizAddress = contentCache['contact.address'] || '';
    var bizPhone = contentCache['contact.phone'] || '';
    var bizEmail = contentCache['contact.email'] || '';
    var bizHours = contentCache['contact.hours'] || '';
    var siteUrl = window.location.origin;

    // Detect business category heuristic — use normalised SCHEMA so
    // both nested + flat shapes work.
    var category = 'Local Business';
    var normalisedSchema = getNormalisedSchema();
    if (normalisedSchema.length > 0) {
        var sectionIds = normalisedSchema.map(function(s) { return s.id; });
        var allFieldIds = [];
        normalisedSchema.forEach(function(s) {
            if (s.fields) s.fields.forEach(function(f) { allFieldIds.push(f.id); });
        });
        if (sectionIds.indexOf('menu') !== -1) {
            category = 'Restaurant';
        } else if (sectionIds.indexOf('services') !== -1) {
            var beautyKeywords = ['hair', 'nail', 'spa', 'beauty', 'salon', 'facial', 'massage', 'wax'];
            var fieldStr = allFieldIds.join(' ').toLowerCase();
            var isBeauty = beautyKeywords.some(function(kw) { return fieldStr.indexOf(kw) !== -1; });
            if (isBeauty) {
                category = 'Beauty Salon';
            }
        }
    }

    // If already marked done, show collapsed state
    if (localStorage.getItem(doneKey) === 'true') {
        container.style.display = 'block';
        container.className = 'gbp-guide-section gbp-collapsed';
        container.innerHTML = '<div class="gbp-card"><div class="gbp-collapsed-bar">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' +
            'Google Business Profile &mdash; Set up</div></div>';
        return;
    }

    // Build value helper
    function val(text, missingMsg) {
        if (text && text.trim()) {
            return '<span class="gbp-value">' + escapeHtml(text.trim()) + '</span>';
        }
        return '<span class="gbp-value gbp-missing">' + escapeHtml(missingMsg) + '</span>';
    }

    // Build steps
    var steps = [
        {
            title: 'Go to Google Business',
            desc: 'Sign in with your Google account (Gmail). If you don\'t have one, you can create one for free.',
            value: ''
        },
        {
            title: 'Enter your business name',
            desc: 'Type your business name exactly as it appears on your storefront.',
            value: val(bizName, 'Not set yet \u2014 add it in the Site section above')
        },
        {
            title: 'Choose your category',
            desc: 'Pick the category that best describes what you do. You can change it later.',
            value: '<span class="gbp-value">' + escapeHtml(category) + '</span>'
        },
        {
            title: 'Enter your address',
            desc: 'Add your physical business location so customers can find you on Google Maps.',
            value: val(bizAddress, 'Not set yet \u2014 add it in the Contact section above')
        },
        {
            title: 'Add your phone number',
            desc: 'A phone number helps customers reach you and verifies your business.',
            value: val(bizPhone, 'Not set yet \u2014 add it in the Contact section above')
        },
        {
            title: 'Add your website',
            desc: 'This is the website we built for you \u2014 paste this URL when Google asks.',
            value: '<span class="gbp-value">' + escapeHtml(siteUrl) + '</span>'
        },
        {
            title: 'Verify your business',
            desc: 'Google will ask you to record a short video (about 60 seconds) showing your shopfront or workspace and your business name. This confirms you\'re a real business.',
            value: ''
        }
    ];

    var stepsHtml = '';
    for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        stepsHtml += '<li class="gbp-step">' +
            '<span class="gbp-step-number">' + (i + 1) + '</span>' +
            '<div class="gbp-step-content">' +
                '<div class="gbp-step-title">' + escapeHtml(step.title) + '</div>' +
                '<div class="gbp-step-desc">' + escapeHtml(step.desc) +
                    (step.value ? '<br>' + step.value : '') +
                '</div>' +
            '</div>' +
        '</li>';
    }

    var html = '<div class="gbp-card">' +
        '<div class="gbp-header">' +
            '<div class="gbp-header-icon">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            '</div>' +
            '<div class="gbp-header-text">' +
                '<h2>Get on Google</h2>' +
                '<p>Show up in "near me" searches and Google Maps</p>' +
            '</div>' +
        '</div>' +
        '<div class="gbp-body">' +
            '<p class="gbp-intro">A Google Business Profile makes your business show up when people search "near me" on Google and Google Maps. Here\'s your pre-filled setup &mdash; it takes about 5 minutes.</p>' +
            '<ol class="gbp-steps">' + stepsHtml + '</ol>' +
            '<div class="gbp-actions">' +
                '<a href="https://business.google.com/create" target="_blank" rel="noopener" class="gbp-cta">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                    'Open Google Business Profile' +
                '</a>' +
                '<button class="gbp-dismiss" id="gbp-dismiss-btn">I already have a Google Business Profile</button>' +
            '</div>' +
            '<div class="gbp-done-check">' +
                '<input type="checkbox" id="gbp-done-checkbox">' +
                '<label for="gbp-done-checkbox">I\'ve set up my Google Business Profile</label>' +
            '</div>' +
        '</div>' +
    '</div>';

    container.innerHTML = html;
    container.style.display = 'block';

    // Dismiss handler
    var dismissBtn = document.getElementById('gbp-dismiss-btn');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
            localStorage.setItem(dismissKey, 'true');
            container.classList.add('gbp-hiding');
            container.addEventListener('animationend', function() {
                container.style.display = 'none';
                container.classList.remove('gbp-hiding');
            }, { once: true });
        });
    }

    // Done checkbox handler
    var doneCheckbox = document.getElementById('gbp-done-checkbox');
    if (doneCheckbox) {
        doneCheckbox.addEventListener('change', function() {
            if (this.checked) {
                localStorage.setItem(doneKey, 'true');
                container.className = 'gbp-guide-section gbp-collapsed';
                container.innerHTML = '<div class="gbp-card"><div class="gbp-collapsed-bar">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' +
                    'Google Business Profile &mdash; Set up</div></div>';
            }
        });
    }
}

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

// ============ DOMAIN STATUS ============

let _domainStatusTimer = null;

async function loadDomainStatus() {
    const section = document.getElementById('domain-status-section');
    if (!section || !CONFIG.SUPABASE_URL || !CONFIG.SITE_KEY) return;

    try {
        const siteToken = sessionStorage.getItem('session_token') || '';
        if (!siteToken) return;
        const res = await fetch(
            CONFIG.SUPABASE_URL + '/functions/v1/domain-status?site_key=' + encodeURIComponent(CONFIG.SITE_KEY),
            { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'x-site-token': siteToken } }
        );
        const data = await res.json();

        if (data.domain_name) {
            renderDomainStatusPanel(section, data);
            // Poll while not active
            if (data.status !== 'active') {
                startDomainStatusPolling();
            } else {
                stopDomainStatusPolling();
            }
        } else {
            renderNoDomainPanel(section);
        }

        section.style.display = '';
    } catch (err) {
        console.error('Failed to load domain status:', err);
    }
}

function renderDomainStatusPanel(el, data) {
    const statusMap = {
        active: { label: 'Active', cls: 'ds-active' },
        registering: { label: 'Registering...', cls: 'ds-pending' },
        dns_propagating: { label: 'DNS Propagating...', cls: 'ds-pending' },
        renewal_failing: { label: 'Renewal Issue', cls: 'ds-error' },
        expiring: { label: 'Expiring', cls: 'ds-error' },
        expired: { label: 'Expired', cls: 'ds-error' },
        pending: { label: 'Setting up...', cls: 'ds-pending' },
    };
    const s = statusMap[data.status] || { label: data.status, cls: 'ds-pending' };
    const expiry = data.expires_at ? new Date(data.expires_at).toLocaleDateString() : '';

    let html = '<div class="ds-card">' +
        '<div class="ds-header">' +
            '<span class="ds-icon">&#127760;</span>' +
            '<span class="ds-title">Domain</span>' +
        '</div>' +
        '<div class="ds-body">' +
            '<div class="ds-domain-row">' +
                '<span class="ds-domain-name">' + data.domain_name + '</span>' +
                '<span class="ds-badge ' + s.cls + '">' + s.label + '</span>' +
            '</div>';

    if (data.ssl_active) {
        html += '<div class="ds-detail">&#128274; SSL Active</div>';
    }
    if (expiry) {
        html += '<div class="ds-detail">' + (data.auto_renew ? 'Auto-renews' : 'Expires') + ' on ' + expiry + '</div>';
    }

    html += '</div></div>';
    el.innerHTML = html;
}

function renderNoDomainPanel(el) {
    el.innerHTML = '<div class="ds-card ds-card-empty">' +
        '<div class="ds-header">' +
            '<span class="ds-icon">&#127760;</span>' +
            '<span class="ds-title">Domain</span>' +
        '</div>' +
        '<div class="ds-body">' +
            '<p class="ds-no-domain">No custom domain configured</p>' +
            '<a href="/portal.html" class="ds-get-domain-link" target="_blank" rel="noopener">Get a Domain &rarr;</a>' +
        '</div>' +
    '</div>';
}

function startDomainStatusPolling() {
    stopDomainStatusPolling();
    _domainStatusTimer = setInterval(loadDomainStatus, 10000);
}

function stopDomainStatusPolling() {
    if (_domainStatusTimer) {
        clearInterval(_domainStatusTimer);
        _domainStatusTimer = null;
    }
}

// Expose auth headers helper for plugins
window.getAuthHeaders = getAuthHeaders;
