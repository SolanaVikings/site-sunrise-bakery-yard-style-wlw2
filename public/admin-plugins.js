// ============================================
// Admin Plugins - Ecommerce Management Panels
// Loaded after admin.js, conditionally renders
// panels based on CONFIG.PLUGINS
// ============================================

(function() {
    'use strict';

    const SITE_KEY = CONFIG.SITE_KEY;
    const PLUGINS = (CONFIG.PLUGINS && CONFIG.PLUGINS.ecommerce) || {};
    const container = document.getElementById('plugin-panels');
    if (!container) return;

    // Reuse Supabase client from admin.js
    function getSupa() { return window.supabaseClient; }

    // Reuse helpers from admin.js
    function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

    // Format currency in EUR (DB stores euros, not cents)
    function fmtEur(amount) {
        const val = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
        return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // Format date
    function fmtDate(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function fmtDateTime(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) +
               ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    }

    // Truncate text
    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    // CSV download helper
    function downloadCsv(filename, rows) {
        if (!rows.length) return;
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(',')].concat(
            rows.map(r => headers.map(h => '"' + String(r[h] || '').replace(/"/g, '""') + '"').join(','))
        ).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // Stripe Connect state
    let stripeStatus = null; // null = loading, object = fetched

    // Determine which tabs to show
    const tabs = [];
    // Messages only if site has a contact form section
    const hasContactForm = CONFIG.SCHEMA && CONFIG.SCHEMA.some(s => s.id === 'contactform');
    if (hasContactForm) {
        tabs.push({ id: 'messages', label: 'Messages', count: 0 });
    }
    if (PLUGINS.shop && PLUGINS.shop.enabled) {
        tabs.push({ id: 'payments', label: 'Payments', count: 0 });
        tabs.push({ id: 'products', label: 'Products', count: 0 });
        tabs.push({ id: 'orders', label: 'Orders', count: 0 });
    }
    if (PLUGINS.booking && PLUGINS.booking.enabled) {
        tabs.push({ id: 'bookings', label: 'Bookings', count: 0 });
    }
    if (PLUGINS.newsletter && PLUGINS.newsletter.enabled) {
        tabs.push({ id: 'subscribers', label: 'Subscribers', count: 0 });
    }
    const QUOTE_PLUGIN = CONFIG.PLUGINS && CONFIG.PLUGINS.quoteCalculator;
    if (QUOTE_PLUGIN && QUOTE_PLUGIN.enabled) {
        tabs.push({ id: 'quotes', label: 'Quotes', count: 0 });
    }
    const QUIZ_PLUGIN = CONFIG.PLUGINS && CONFIG.PLUGINS.quiz;
    if (QUIZ_PLUGIN && QUIZ_PLUGIN.enabled) {
        tabs.push({ id: 'quiz', label: 'Quiz', count: 0 });
    }

    // Only render if we actually have tabs
    if (!tabs.length) return;

    // State
    let activeTab = tabs[0].id;
    let panelData = {};

    // ============ RENDER SHELL ============
    function renderShell() {
        container.innerHTML = `
            <div class="pp-section">
                <div class="pp-tabs" id="pp-tabs">
                    ${tabs.map(t => `
                        <button class="pp-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
                            ${esc(t.label)}
                            <span class="pp-tab-badge" id="pp-badge-${t.id}" style="display:none;">0</span>
                        </button>
                    `).join('')}
                </div>
                <div class="pp-panel-content" id="pp-panel-content">
                    <div class="pp-loading">Loading...</div>
                </div>
            </div>
        `;

        container.querySelectorAll('.pp-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.tab;
                container.querySelectorAll('.pp-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderActivePanel();
            });
        });

        loadAllData();
    }

    // ============ DATA LOADING ============
    async function loadAllData() {
        const supa = getSupa();
        if (!supa) {
            document.getElementById('pp-panel-content').innerHTML =
                '<div class="pp-empty">Connect to Supabase to view data.</div>';
            return;
        }

        // Load all in parallel
        const promises = [];

        promises.push(
            supa.from('form_submissions').select('*').eq('site_key', SITE_KEY)
                .order('created_at', { ascending: false })
                .then(r => { panelData.messages = r.data || []; })
                .catch(() => { panelData.messages = []; })
        );

        if (PLUGINS.shop && PLUGINS.shop.enabled) {
            promises.push(
                supa.from('products').select('*').eq('site_key', SITE_KEY)
                    .order('sort_order')
                    .then(r => { panelData.products = r.data || []; })
                    .catch(() => { panelData.products = []; })
            );
            promises.push(
                supa.from('orders').select('*').eq('site_key', SITE_KEY)
                    .order('created_at', { ascending: false })
                    .then(r => { panelData.orders = r.data || []; })
                    .catch(() => { panelData.orders = []; })
            );
        }

        if (PLUGINS.booking && PLUGINS.booking.enabled) {
            promises.push(
                supa.from('bookings').select('*').eq('site_key', SITE_KEY)
                    .order('booking_date', { ascending: true })
                    .then(r => { panelData.bookings = r.data || []; })
                    .catch(() => { panelData.bookings = []; })
            );
        }

        if (PLUGINS.newsletter && PLUGINS.newsletter.enabled) {
            promises.push(
                supa.from('subscribers').select('*').eq('site_key', SITE_KEY)
                    .order('created_at', { ascending: false })
                    .then(r => { panelData.subscribers = r.data || []; })
                    .catch(() => { panelData.subscribers = []; })
            );
        }

        if (QUOTE_PLUGIN && QUOTE_PLUGIN.enabled) {
            promises.push(
                supa.from('quote_requests').select('*').eq('site_key', SITE_KEY)
                    .order('created_at', { ascending: false })
                    .then(r => { panelData.quotes = r.data || []; })
                    .catch(() => { panelData.quotes = []; })
            );
            // Load saved calculator fields from site_content
            promises.push(
                supa.from('site_content').select('content')
                    .eq('site_key', SITE_KEY)
                    .eq('section', 'plugins')
                    .eq('field_name', 'quote_calculator_fields')
                    .single()
                    .then(r => {
                        if (r.data && r.data.content) {
                            try { panelData.quoteBuilderFields = JSON.parse(r.data.content); }
                            catch(e) { panelData.quoteBuilderFields = null; }
                        } else {
                            panelData.quoteBuilderFields = null;
                        }
                    })
                    .catch(() => { panelData.quoteBuilderFields = null; })
            );
        }

        if (QUIZ_PLUGIN && QUIZ_PLUGIN.enabled) {
            promises.push(
                supa.from('quizzes').select('*').eq('site_key', SITE_KEY)
                    .then(r => { panelData.quizzes = r.data || []; })
                    .catch(() => { panelData.quizzes = []; })
            );
            promises.push(
                supa.from('quiz_questions').select('*').eq('site_key', SITE_KEY)
                    .order('sort_order')
                    .then(r => { panelData.quizQuestions = r.data || []; })
                    .catch(() => { panelData.quizQuestions = []; })
            );
            promises.push(
                supa.from('quiz_options').select('*').eq('site_key', SITE_KEY)
                    .order('sort_order')
                    .then(r => { panelData.quizOptions = r.data || []; })
                    .catch(() => { panelData.quizOptions = []; })
            );
            promises.push(
                supa.from('quiz_tiers').select('*').eq('site_key', SITE_KEY)
                    .order('sort_order')
                    .then(r => { panelData.quizTiers = r.data || []; })
                    .catch(() => { panelData.quizTiers = []; })
            );
            promises.push(
                supa.from('quiz_responses').select('*').eq('site_key', SITE_KEY)
                    .order('created_at', { ascending: false })
                    .then(r => { panelData.quizResponses = r.data || []; })
                    .catch(() => { panelData.quizResponses = []; })
            );
        }

        await Promise.all(promises);
        updateBadges();
        renderActivePanel();
    }

    function updateBadges() {
        setBadge('messages', (panelData.messages || []).length);
        if (PLUGINS.shop && PLUGINS.shop.enabled) {
            setBadge('products', (panelData.products || []).length);
            setBadge('orders', (panelData.orders || []).length);
        }
        if (PLUGINS.booking && PLUGINS.booking.enabled) {
            setBadge('bookings', (panelData.bookings || []).length);
        }
        if (PLUGINS.newsletter && PLUGINS.newsletter.enabled) {
            setBadge('subscribers', (panelData.subscribers || []).length);
        }
        if (QUOTE_PLUGIN && QUOTE_PLUGIN.enabled) {
            const newQuotes = (panelData.quotes || []).filter(q => q.status === 'new').length;
            setBadge('quotes', newQuotes);
        }
        if (QUIZ_PLUGIN && QUIZ_PLUGIN.enabled) {
            setBadge('quiz', (panelData.quizResponses || []).length);
        }
    }

    function setBadge(tabId, count) {
        const el = document.getElementById('pp-badge-' + tabId);
        if (!el) return;
        el.textContent = count;
        el.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    // ============ PANEL ROUTER ============
    function renderActivePanel() {
        const target = document.getElementById('pp-panel-content');
        if (!target) return;

        switch (activeTab) {
            case 'messages': renderMessages(target); break;
            case 'payments': renderPayments(target); break;
            case 'products': renderProducts(target); break;
            case 'orders': renderOrders(target); break;
            case 'bookings': renderBookings(target); break;
            case 'subscribers': renderSubscribers(target); break;
            case 'quotes': renderQuotes(target); break;
            case 'quiz': renderQuiz(target); break;
        }
    }

    // ============ MESSAGES PANEL ============
    function renderMessages(el) {
        const data = panelData.messages || [];
        if (!data.length) {
            el.innerHTML = '<div class="pp-empty">No messages yet.</div>';
            return;
        }

        el.innerHTML = `
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Message</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((m, i) => `
                            <tr class="pp-row-clickable" data-idx="${i}">
                                <td class="pp-nowrap">${fmtDate(m.created_at)}</td>
                                <td>${esc(m.name || m.customer_name || '-')}</td>
                                <td>${esc(m.email || m.customer_email || '-')}</td>
                                <td class="pp-truncate">${esc(truncate(m.message || m.body || '', 60))}</td>
                                <td>
                                    <a class="btn btn-sm btn-secondary pp-reply-btn"
                                       href="mailto:${esc(m.email || m.customer_email || '')}?subject=Re: Message from your website"
                                       onclick="event.stopPropagation()">Reply</a>
                                </td>
                            </tr>
                            <tr class="pp-detail-row" id="pp-msg-detail-${i}" style="display:none;">
                                <td colspan="5">
                                    <div class="pp-detail-box">
                                        <p><strong>From:</strong> ${esc(m.name || m.customer_name || '-')} &lt;${esc(m.email || m.customer_email || '-')}&gt;</p>
                                        ${m.phone ? '<p><strong>Phone:</strong> ' + esc(m.phone) + '</p>' : ''}
                                        <p><strong>Date:</strong> ${fmtDateTime(m.created_at)}</p>
                                        <div class="pp-detail-message">${esc(m.message || m.body || '')}</div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        el.querySelectorAll('.pp-row-clickable').forEach(row => {
            row.addEventListener('click', () => {
                const detail = document.getElementById('pp-msg-detail-' + row.dataset.idx);
                if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
            });
        });
    }

    // ============ PRODUCTS PANEL ============
    function renderProducts(el) {
        const data = panelData.products || [];

        el.innerHTML = `
            <div class="pp-toolbar">
                <button class="btn btn-primary btn-sm" id="pp-add-product">+ Add Product</button>
            </div>
            ${!data.length ? '<div class="pp-empty">No products yet. Add your first product above.</div>' : `
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th style="width:50px;"></th>
                            <th>Name</th>
                            <th>Price</th>
                            <th>Active</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(p => `
                            <tr class="pp-row-clickable" data-product-id="${esc(p.id)}">
                                <td>
                                    ${p.image_url
                                        ? '<img class="pp-thumb" src="' + esc(p.image_url) + '" alt="">'
                                        : '<div class="pp-thumb-placeholder"></div>'}
                                </td>
                                <td>${esc(p.name)}</td>
                                <td>${fmtEur(p.price)}</td>
                                <td>
                                    <label class="pp-toggle" onclick="event.stopPropagation()">
                                        <input type="checkbox" ${p.active !== false ? 'checked' : ''} data-toggle-id="${esc(p.id)}">
                                        <span class="pp-toggle-slider"></span>
                                    </label>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-ghost pp-delete-product" data-delete-id="${esc(p.id)}" onclick="event.stopPropagation()" title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        `;

        // Add product button
        el.querySelector('#pp-add-product').addEventListener('click', () => openProductModal());

        // Edit product rows
        el.querySelectorAll('.pp-row-clickable').forEach(row => {
            row.addEventListener('click', () => {
                const prod = data.find(p => String(p.id) === row.dataset.productId);
                if (prod) openProductModal(prod);
            });
        });

        // Active toggles
        el.querySelectorAll('[data-toggle-id]').forEach(cb => {
            cb.addEventListener('change', async () => {
                const supa = getSupa();
                if (!supa) return;
                await supa.from('products').update({ active: cb.checked }).eq('id', cb.dataset.toggleId);
            });
        });

        // Delete buttons
        el.querySelectorAll('.pp-delete-product').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this product?')) return;
                const supa = getSupa();
                if (!supa) return;
                await supa.from('products').delete().eq('id', btn.dataset.deleteId);
                toast('Product deleted', 'success');
                await loadAllData();
            });
        });
    }

    // Product modal
    function openProductModal(product) {
        const isEdit = !!product;
        const overlay = document.createElement('div');
        overlay.className = 'pp-modal-overlay';
        overlay.innerHTML = `
            <div class="pp-modal">
                <div class="pp-modal-header">
                    <h3>${isEdit ? 'Edit Product' : 'Add Product'}</h3>
                    <button class="btn btn-ghost btn-icon pp-modal-close">&times;</button>
                </div>
                <form class="pp-modal-body" id="pp-product-form">
                    <div class="form-group">
                        <label>Product Name</label>
                        <input type="text" name="name" value="${esc(product ? product.name : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea name="description" rows="3">${esc(product ? product.description : '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Price (EUR, e.g. 15.00)</label>
                        <input type="number" name="price" value="${product ? product.price || '' : ''}" min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Image</label>
                        <input type="file" name="image" accept="image/*" class="pp-file-input">
                        ${product && product.image_url ? '<img class="pp-modal-preview" src="' + esc(product.image_url) + '" alt="">' : ''}
                    </div>
                    <div class="form-group">
                        <label class="pp-checkbox-label">
                            <input type="checkbox" name="active" ${!product || product.active !== false ? 'checked' : ''}>
                            Active (visible on site)
                        </label>
                    </div>
                    <div class="pp-modal-actions">
                        <button type="button" class="btn btn-secondary pp-modal-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.pp-modal-close').addEventListener('click', close);
        overlay.querySelector('.pp-modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#pp-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const supa = getSupa();
            if (!supa) return;

            const form = e.target;
            const name = form.name.value.trim();
            const description = form.description.value.trim();
            const price = parseInt(form.price.value, 10) || 0;
            const active = form.active.checked;
            const file = form.image.files[0];

            let image_url = product ? product.image_url : null;

            // Upload image if provided
            if (file) {
                const ext = file.name.split('.').pop();
                const path = SITE_KEY + '/products/' + Date.now() + '.' + ext;
                const { data: uploadData, error: uploadErr } = await supa.storage
                    .from('site-images').upload(path, file, { upsert: true });
                if (uploadErr) {
                    toast('Image upload failed: ' + uploadErr.message, 'error');
                    return;
                }
                const { data: urlData } = supa.storage.from('site-images').getPublicUrl(path);
                image_url = urlData.publicUrl;
            }

            const record = { site_key: SITE_KEY, name, description, price, active, image_url };

            if (isEdit) {
                const { error } = await supa.from('products').update(record).eq('id', product.id);
                if (error) { toast('Update failed: ' + error.message, 'error'); return; }
                toast('Product updated', 'success');
            } else {
                record.sort_order = (panelData.products || []).length;
                const { error } = await supa.from('products').insert(record);
                if (error) { toast('Create failed: ' + error.message, 'error'); return; }
                toast('Product created', 'success');
            }

            close();
            await loadAllData();
        });
    }

    // ============ ORDERS PANEL ============
    function renderOrders(el) {
        const data = panelData.orders || [];

        el.innerHTML = `
            <div class="pp-toolbar">
                <button class="btn btn-secondary btn-sm" id="pp-export-orders" ${!data.length ? 'disabled' : ''}>Export CSV</button>
            </div>
            ${!data.length ? '<div class="pp-empty">No orders yet.</div>' : `
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Total</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((o, i) => `
                            <tr class="pp-row-clickable" data-idx="${i}">
                                <td class="pp-nowrap">${fmtDate(o.created_at)}</td>
                                <td>${esc(o.customer_name || '-')}</td>
                                <td>${esc(o.customer_email || '-')}</td>
                                <td>${fmtEur(o.total)}</td>
                                <td><span class="pp-status pp-status-${esc(o.status || 'pending')}">${esc(o.status || 'pending')}</span></td>
                            </tr>
                            <tr class="pp-detail-row" id="pp-order-detail-${i}" style="display:none;">
                                <td colspan="5">
                                    <div class="pp-detail-box">
                                        <div class="pp-order-meta">
                                            <p><strong>Customer:</strong> ${esc(o.customer_name || '-')} &lt;${esc(o.customer_email || '-')}&gt;</p>
                                            ${o.customer_phone ? '<p><strong>Phone:</strong> ' + esc(o.customer_phone) + '</p>' : ''}
                                            ${o.shipping_address ? '<p><strong>Address:</strong> ' + esc(o.shipping_address) + '</p>' : ''}
                                        </div>
                                        ${o.items && o.items.length ? `
                                            <table class="pp-items-table">
                                                <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
                                                <tbody>
                                                    ${(typeof o.items === 'string' ? JSON.parse(o.items) : o.items).map(item => `
                                                        <tr>
                                                            <td>${esc(item.name)}</td>
                                                            <td>${item.quantity || 1}</td>
                                                            <td>${fmtEur(item.price)}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        ` : ''}
                                        <div class="pp-order-actions">
                                            <label>Status:
                                                <select class="pp-status-select" data-order-id="${esc(o.id)}">
                                                    ${['pending','paid','fulfilled','cancelled'].map(s =>
                                                        '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>'
                                                    ).join('')}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        `;

        // Expand rows
        el.querySelectorAll('.pp-row-clickable').forEach(row => {
            row.addEventListener('click', () => {
                const detail = document.getElementById('pp-order-detail-' + row.dataset.idx);
                if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
            });
        });

        // Status selects
        el.querySelectorAll('.pp-status-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                e.stopPropagation();
                const supa = getSupa();
                if (!supa) return;
                const { error } = await supa.from('orders').update({ status: sel.value }).eq('id', sel.dataset.orderId);
                if (error) { toast('Status update failed', 'error'); return; }
                toast('Order status updated', 'success');
                await loadAllData();
            });
            sel.addEventListener('click', (e) => e.stopPropagation());
        });

        // Export CSV
        const exportBtn = el.querySelector('#pp-export-orders');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const rows = data.map(o => ({
                    date: fmtDateTime(o.created_at),
                    customer: o.customer_name || '',
                    email: o.customer_email || '',
                    total: o.total || 0,
                    status: o.status || 'pending'
                }));
                downloadCsv(SITE_KEY + '-orders.csv', rows);
                toast('CSV downloaded', 'success');
            });
        }
    }

    // ============ BOOKINGS PANEL ============
    function renderBookings(el) {
        const data = panelData.bookings || [];
        const now = new Date();

        el.innerHTML = `
            <div class="pp-toolbar">
                <div class="pp-filter-group">
                    <button class="btn btn-sm pp-filter active" data-filter="upcoming">Upcoming</button>
                    <button class="btn btn-sm pp-filter" data-filter="past">Past</button>
                    <button class="btn btn-sm pp-filter" data-filter="all">All</button>
                </div>
            </div>
            <div id="pp-bookings-list"></div>
        `;

        let currentFilter = 'upcoming';

        function renderFiltered() {
            const filtered = data.filter(b => {
                if (currentFilter === 'all') return true;
                const bDate = new Date(b.booking_date);
                return currentFilter === 'upcoming' ? bDate >= now : bDate < now;
            });

            const listEl = document.getElementById('pp-bookings-list');
            if (!filtered.length) {
                listEl.innerHTML = '<div class="pp-empty">No ' + currentFilter + ' bookings.</div>';
                return;
            }

            listEl.innerHTML = `
                <div class="pp-table-wrap">
                    <table class="pp-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Customer</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(b => `
                                <tr>
                                    <td class="pp-nowrap">${fmtDate(b.booking_date)}</td>
                                    <td>${esc(b.booking_time || '-')}</td>
                                    <td>${esc(b.customer_name || '-')}</td>
                                    <td>${esc(b.customer_email || '-')}</td>
                                    <td>${esc(b.customer_phone || '-')}</td>
                                    <td><span class="pp-status pp-status-${esc(b.status || 'confirmed')}">${esc(b.status || 'confirmed')}</span></td>
                                    <td class="pp-actions-cell">
                                        ${b.status !== 'cancelled' && b.status !== 'completed' ? `
                                            <button class="btn btn-sm btn-ghost pp-booking-action" data-id="${esc(b.id)}" data-action="completed" title="Complete">Done</button>
                                            <button class="btn btn-sm btn-ghost pp-booking-action pp-text-error" data-id="${esc(b.id)}" data-action="cancelled" title="Cancel">Cancel</button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            listEl.querySelectorAll('.pp-booking-action').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const supa = getSupa();
                    if (!supa) return;
                    const { error } = await supa.from('bookings').update({ status: btn.dataset.action }).eq('id', btn.dataset.id);
                    if (error) { toast('Update failed', 'error'); return; }
                    toast('Booking ' + btn.dataset.action, 'success');
                    await loadAllData();
                });
            });
        }

        el.querySelectorAll('.pp-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilter = btn.dataset.filter;
                el.querySelectorAll('.pp-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderFiltered();
            });
        });

        renderFiltered();
    }

    // ============ SUBSCRIBERS PANEL ============
    function renderSubscribers(el) {
        const data = panelData.subscribers || [];

        el.innerHTML = `
            <div class="pp-toolbar">
                <button class="btn btn-secondary btn-sm" id="pp-export-subs" ${!data.length ? 'disabled' : ''}>Export CSV</button>
            </div>
            ${!data.length ? '<div class="pp-empty">No subscribers yet.</div>' : `
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Date</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(s => `
                            <tr>
                                <td>${esc(s.email)}</td>
                                <td>${fmtDate(s.created_at)}</td>
                                <td>
                                    <button class="btn btn-sm btn-ghost pp-text-error pp-remove-sub" data-id="${esc(s.id)}" title="Remove">Remove</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        `;

        // Export
        const exportBtn = el.querySelector('#pp-export-subs');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const rows = data.map(s => ({ email: s.email, subscribed: fmtDate(s.created_at) }));
                downloadCsv(SITE_KEY + '-subscribers.csv', rows);
                toast('CSV downloaded', 'success');
            });
        }

        // Remove
        el.querySelectorAll('.pp-remove-sub').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remove this subscriber?')) return;
                const supa = getSupa();
                if (!supa) return;
                await supa.from('subscribers').delete().eq('id', btn.dataset.id);
                toast('Subscriber removed', 'success');
                await loadAllData();
            });
        });
    }

    // ============ QUOTES PANEL ============

    // Relative time helper
    function timeAgo(iso) {
        if (!iso) return '-';
        const now = Date.now();
        const then = new Date(iso).getTime();
        const diff = now - then;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return days + ' days ago';
        if (days < 30) return Math.floor(days / 7) + (Math.floor(days / 7) === 1 ? ' week ago' : ' weeks ago');
        return fmtDate(iso);
    }

    // Format EUR from direct value (not cents)
    function fmtEurDirect(val) {
        const num = parseFloat(val) || 0;
        return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(num);
    }

    // Quote status config
    const QUOTE_STATUSES = {
        new:       { label: 'New',       color: 'blue' },
        contacted: { label: 'Contacted', color: 'yellow' },
        quoted:    { label: 'Quoted',    color: 'orange' },
        won:       { label: 'Won',       color: 'green' },
        lost:      { label: 'Lost',      color: 'grey' }
    };

    let quotesSubTab = 'inbox'; // 'inbox' or 'builder'

    function renderQuotes(el) {
        el.innerHTML = `
            <div class="qq-subtabs">
                <button class="qq-subtab ${quotesSubTab === 'inbox' ? 'active' : ''}" data-subtab="inbox">Inbox</button>
                <button class="qq-subtab ${quotesSubTab === 'builder' ? 'active' : ''}" data-subtab="builder">Edit Calculator</button>
            </div>
            <div id="qq-subtab-content"></div>
        `;

        el.querySelectorAll('.qq-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                quotesSubTab = btn.dataset.subtab;
                el.querySelectorAll('.qq-subtab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderQuotesSubTab();
            });
        });

        renderQuotesSubTab();

        function renderQuotesSubTab() {
            const target = document.getElementById('qq-subtab-content');
            if (!target) return;
            if (quotesSubTab === 'inbox') renderQuotesInbox(target);
            else renderQuoteBuilder(target);
        }
    }

    // ---- Quotes Inbox ----
    var quotesSortCol = 'created_at';
    var quotesSortAsc = false;
    var quotesFilterStatus = 'all';
    var quotesFilterSearch = '';
    var quotesFilterDateFrom = '';
    var quotesFilterDateTo = '';

    function renderQuotesInbox(el) {
        var data = (panelData.quotes || []).slice();

        // Filter by status
        if (quotesFilterStatus !== 'all') {
            data = data.filter(function(q) { return q.status === quotesFilterStatus; });
        }

        // Filter by date range
        if (quotesFilterDateFrom) {
            var from = new Date(quotesFilterDateFrom);
            from.setHours(0, 0, 0, 0);
            data = data.filter(function(q) { return new Date(q.created_at) >= from; });
        }
        if (quotesFilterDateTo) {
            var to = new Date(quotesFilterDateTo);
            to.setHours(23, 59, 59, 999);
            data = data.filter(function(q) { return new Date(q.created_at) <= to; });
        }

        // Filter by search (name, phone, email)
        if (quotesFilterSearch) {
            var s = quotesFilterSearch.toLowerCase();
            data = data.filter(function(q) {
                return (q.customer_name || '').toLowerCase().indexOf(s) !== -1 ||
                       (q.customer_phone || '').indexOf(s) !== -1 ||
                       (q.customer_email || '').toLowerCase().indexOf(s) !== -1;
            });
        }

        // Sort
        data.sort(function(a, b) {
            var av, bv;
            if (quotesSortCol === 'customer_name') {
                av = (a.customer_name || '').toLowerCase();
                bv = (b.customer_name || '').toLowerCase();
            } else if (quotesSortCol === 'estimated_total') {
                av = parseFloat(a.estimated_total) || 0;
                bv = parseFloat(b.estimated_total) || 0;
            } else if (quotesSortCol === 'status') {
                var statusOrder = { new: 0, contacted: 1, quoted: 2, won: 3, lost: 4 };
                av = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 5;
                bv = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 5;
            } else {
                av = a.created_at || '';
                bv = b.created_at || '';
            }
            if (av < bv) return quotesSortAsc ? -1 : 1;
            if (av > bv) return quotesSortAsc ? 1 : -1;
            return 0;
        });

        function sortIcon(col) {
            if (quotesSortCol !== col) return '<span class="qq-sort-icon">&#8597;</span>';
            return quotesSortAsc ? '<span class="qq-sort-icon qq-sort-active">&#8593;</span>' : '<span class="qq-sort-icon qq-sort-active">&#8595;</span>';
        }

        // Stats for this month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = data.filter(q => new Date(q.created_at) >= monthStart);
        const totalValue = thisMonth.reduce((sum, q) => sum + (parseFloat(q.estimated_total) || 0), 0);
        const wonCount = thisMonth.filter(q => q.status === 'won').length;
        const convRate = thisMonth.length > 0 ? Math.round((wonCount / thisMonth.length) * 100) : 0;

        el.innerHTML = `
            <div class="qq-stats-bar">
                <div class="qq-stat">
                    <span class="qq-stat-value">${thisMonth.length}</span>
                    <span class="qq-stat-label">This month</span>
                </div>
                <div class="qq-stat">
                    <span class="qq-stat-value">${fmtEurDirect(totalValue)}</span>
                    <span class="qq-stat-label">Est. value</span>
                </div>
                <div class="qq-stat">
                    <span class="qq-stat-value">${convRate}%</span>
                    <span class="qq-stat-label">Conversion</span>
                </div>
            </div>
            <div class="qq-filters">
                <input type="text" class="qq-search" id="qq-search" placeholder="Search name, phone, email..." value="${esc(quotesFilterSearch)}">
                <div class="qq-date-range">
                    <input type="date" class="qq-date-input" id="qq-date-from" value="${quotesFilterDateFrom}" title="From date" min="2026-01-01" max="${new Date().toISOString().slice(0,10)}">
                    <span class="qq-date-sep">to</span>
                    <input type="date" class="qq-date-input" id="qq-date-to" value="${quotesFilterDateTo}" title="To date" min="2026-01-01" max="${new Date().toISOString().slice(0,10)}">
                </div>
                <select class="pp-status-select qq-filter-status" id="qq-filter-status">
                    <option value="all"${quotesFilterStatus === 'all' ? ' selected' : ''}>All statuses</option>
                    ${Object.keys(QUOTE_STATUSES).map(function(s) {
                        return '<option value="' + s + '"' + (quotesFilterStatus === s ? ' selected' : '') + '>' + QUOTE_STATUSES[s].label + '</option>';
                    }).join('')}
                </select>
            </div>
            ${!data.length ? '<div class="pp-empty">' + (quotesFilterStatus !== 'all' || quotesFilterSearch ? 'No quotes match your filters.' : 'No quote requests yet.') + '</div>' : `
            <div class="pp-toolbar">
                <span class="qq-result-count">${data.length} quote${data.length !== 1 ? 's' : ''}</span>
                <button class="btn btn-secondary btn-sm" id="qq-export-quotes">Export CSV</button>
            </div>
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th class="qq-sortable" data-sort="customer_name">Customer ${sortIcon('customer_name')}</th>
                            <th>Phone</th>
                            <th class="qq-sortable" data-sort="estimated_total">Est. Total ${sortIcon('estimated_total')}</th>
                            <th class="qq-sortable" data-sort="status">Status ${sortIcon('status')}</th>
                            <th class="qq-sortable" data-sort="created_at">Received ${sortIcon('created_at')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((q, i) => `
                            <tr class="pp-row-clickable" data-idx="${i}">
                                <td>${esc(q.customer_name || '-')}</td>
                                <td class="pp-nowrap">${esc(q.customer_phone || '-')}</td>
                                <td class="pp-nowrap">${fmtEurDirect(q.estimated_total)}</td>
                                <td><span class="pp-status qq-status-${esc(q.status || 'new')}">${esc((QUOTE_STATUSES[q.status] || QUOTE_STATUSES.new).label)}</span></td>
                                <td class="pp-nowrap">${timeAgo(q.created_at)}</td>
                            </tr>
                            <tr class="pp-detail-row" id="qq-detail-${i}" style="display:none;">
                                <td colspan="5">
                                    <div class="pp-detail-box qq-detail">
                                        <div class="qq-detail-header">
                                            <div>
                                                <p><strong>Name:</strong> ${esc(q.customer_name || '-')}</p>
                                                <p><strong>Phone:</strong> ${esc(q.customer_phone || '-')}</p>
                                                <p><strong>Email:</strong> ${esc(q.customer_email || '-')}</p>
                                            </div>
                                            <div class="qq-contact-btns">
                                                ${q.customer_phone ? `<a class="btn btn-sm btn-secondary qq-contact-btn" href="tel:${esc(q.customer_phone)}" onclick="event.stopPropagation()">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                                    Call
                                                </a>` : ''}
                                                ${q.customer_phone ? `<a class="btn btn-sm btn-secondary qq-contact-btn" href="https://wa.me/${esc((q.customer_phone || '').replace(/[^0-9+]/g, ''))}" target="_blank" onclick="event.stopPropagation()">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.121.553 4.116 1.52 5.853L0 24l6.335-1.652A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.97 0-3.837-.53-5.445-1.476l-.39-.232-3.758.98.998-3.648-.254-.404A9.697 9.697 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                                                    WhatsApp
                                                </a>` : ''}
                                            </div>
                                        </div>
                                        ${renderSelectionsBreakdown(q)}
                                        ${q.notes ? `<div class="qq-notes"><strong>Notes:</strong><div class="pp-detail-message">${esc(q.notes)}</div></div>` : ''}
                                        <div class="qq-status-update" onclick="event.stopPropagation()">
                                            <label><strong>Status:</strong></label>
                                            <select class="pp-status-select qq-status-sel" data-quote-id="${esc(q.id)}">
                                                ${Object.keys(QUOTE_STATUSES).map(s =>
                                                    '<option value="' + s + '"' + (q.status === s ? ' selected' : '') + '>' + QUOTE_STATUSES[s].label + '</option>'
                                                ).join('')}
                                            </select>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        `;

        // Expand rows
        el.querySelectorAll('.pp-row-clickable').forEach(row => {
            row.addEventListener('click', () => {
                const detail = document.getElementById('qq-detail-' + row.dataset.idx);
                if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
            });
        });

        // Status selects
        el.querySelectorAll('.qq-status-sel').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                e.stopPropagation();
                const supa = getSupa();
                if (!supa) return;
                const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
                const { error } = await supa.from('quote_requests')
                    .update({ status: sel.value })
                    .eq('id', sel.dataset.quoteId);
                if (error) { toast('Status update failed', 'error'); return; }
                toast('Quote status updated', 'success');
                await loadAllData();
            });
            sel.addEventListener('click', (e) => e.stopPropagation());
        });

        // Filters
        var searchInput = el.querySelector('#qq-search');
        if (searchInput) {
            var searchTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function() {
                    quotesFilterSearch = searchInput.value.trim();
                    renderQuotesInbox(el);
                }, 250);
            });
        }
        var dateFrom = el.querySelector('#qq-date-from');
        if (dateFrom) {
            dateFrom.addEventListener('change', function() {
                quotesFilterDateFrom = dateFrom.value;
                renderQuotesInbox(el);
            });
        }
        var dateTo = el.querySelector('#qq-date-to');
        if (dateTo) {
            dateTo.addEventListener('change', function() {
                quotesFilterDateTo = dateTo.value;
                renderQuotesInbox(el);
            });
        }
        var statusFilter = el.querySelector('#qq-filter-status');
        if (statusFilter) {
            statusFilter.addEventListener('change', function() {
                quotesFilterStatus = statusFilter.value;
                renderQuotesInbox(el);
            });
        }

        // Sort headers
        el.querySelectorAll('.qq-sortable').forEach(function(th) {
            th.addEventListener('click', function() {
                var col = th.dataset.sort;
                if (quotesSortCol === col) {
                    quotesSortAsc = !quotesSortAsc;
                } else {
                    quotesSortCol = col;
                    quotesSortAsc = col === 'customer_name'; // alpha defaults ascending, rest descending
                }
                renderQuotesInbox(el);
            });
        });

        // Export CSV
        const exportBtn = el.querySelector('#qq-export-quotes');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const rows = data.map(q => ({
                    date: fmtDateTime(q.created_at),
                    customer: q.customer_name || '',
                    phone: q.customer_phone || '',
                    email: q.customer_email || '',
                    estimated_total: q.estimated_total || 0,
                    status: q.status || 'new',
                    notes: q.notes || ''
                }));
                downloadCsv(SITE_KEY + '-quotes.csv', rows);
                toast('CSV downloaded', 'success');
            });
        }
    }

    function renderSelectionsBreakdown(q) {
        let selections = q.selections;
        if (!selections) return '';
        if (typeof selections === 'string') {
            try { selections = JSON.parse(selections); } catch(e) { return ''; }
        }
        if (!Array.isArray(selections) || !selections.length) return '';

        return `
            <table class="pp-items-table qq-selections-table">
                <thead><tr><th>Selection</th><th>Value</th><th>Price</th></tr></thead>
                <tbody>
                    ${selections.map(s => `
                        <tr>
                            <td>${esc(s.label || s.field || '-')}</td>
                            <td>${esc(s.value || '-')}</td>
                            <td class="pp-nowrap">${fmtEurDirect(s.price || 0)}</td>
                        </tr>
                    `).join('')}
                    <tr class="qq-total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td class="pp-nowrap"><strong>${fmtEurDirect(q.estimated_total)}</strong></td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    // ---- Quote Builder ----
    function getBuilderFields() {
        // Saved fields override config defaults
        if (panelData.quoteBuilderFields && Array.isArray(panelData.quoteBuilderFields)) {
            return JSON.parse(JSON.stringify(panelData.quoteBuilderFields));
        }
        if (QUOTE_PLUGIN && QUOTE_PLUGIN.fields && Array.isArray(QUOTE_PLUGIN.fields)) {
            return JSON.parse(JSON.stringify(QUOTE_PLUGIN.fields));
        }
        return [];
    }

    let builderFields = [];
    let editingFieldIdx = -1;

    function renderQuoteBuilder(el) {
        builderFields = getBuilderFields();
        editingFieldIdx = -1;
        renderBuilderUI(el);
    }

    function renderBuilderUI(el) {
        const typeIcons = {
            dropdown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
            radio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
            slider: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/><circle cx="14" cy="12" r="3"/></svg>',
            checkboxes: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 16 10"/></svg>',
            toggle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="4"/></svg>'
        };

        function fieldSummary(f) {
            if (f.type === 'slider') return 'Range: ' + (f.min || 0) + '-' + (f.max || 100) + (f.unit ? ' ' + f.unit : '');
            if (f.type === 'toggle') return fmtEurDirect(f.price || 0);
            if (f.options && f.options.length) return f.options.length + ' option' + (f.options.length !== 1 ? 's' : '');
            return '';
        }

        el.innerHTML = `
            <div class="qq-builder">
                <div class="qq-builder-header">
                    <h4>Calculator Fields</h4>
                    <div class="qq-builder-actions">
                        <div class="qq-add-field-wrap">
                            <select id="qq-add-type" class="pp-status-select">
                                <option value="">Add field...</option>
                                <option value="dropdown">Dropdown</option>
                                <option value="radio">Radio</option>
                                <option value="slider">Slider</option>
                                <option value="checkboxes">Checkboxes</option>
                                <option value="toggle">Toggle</option>
                            </select>
                        </div>
                        <button class="btn btn-primary btn-sm" id="qq-save-calc">Save Calculator</button>
                    </div>
                </div>
                ${!builderFields.length ? '<div class="pp-empty">No fields yet. Add your first field above.</div>' : ''}
                <div class="qq-field-list" id="qq-field-list">
                    ${builderFields.map((f, i) => `
                        <div class="qq-field-card ${editingFieldIdx === i ? 'editing' : ''}" data-idx="${i}">
                            <div class="qq-field-card-header" data-toggle-idx="${i}">
                                <div class="qq-field-card-info">
                                    <span class="qq-field-icon">${typeIcons[f.type] || ''}</span>
                                    <span class="qq-field-label">${esc(f.label || 'Untitled')}</span>
                                    <span class="qq-field-summary">${esc(fieldSummary(f))}</span>
                                </div>
                                <div class="qq-field-card-controls" onclick="event.stopPropagation()">
                                    <button class="btn btn-ghost btn-sm qq-move-up" data-move="${i}" data-dir="up" ${i === 0 ? 'disabled' : ''} title="Move up">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
                                    </button>
                                    <button class="btn btn-ghost btn-sm qq-move-down" data-move="${i}" data-dir="down" ${i === builderFields.length - 1 ? 'disabled' : ''} title="Move down">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    <button class="btn btn-ghost btn-sm pp-text-error qq-delete-field" data-del="${i}" title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </div>
                            </div>
                            ${editingFieldIdx === i ? renderFieldEditor(f, i) : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Toggle editing
        el.querySelectorAll('[data-toggle-idx]').forEach(header => {
            header.addEventListener('click', () => {
                const idx = parseInt(header.dataset.toggleIdx, 10);
                editingFieldIdx = editingFieldIdx === idx ? -1 : idx;
                renderBuilderUI(el);
            });
        });

        // Move up/down
        el.querySelectorAll('.qq-move-up, .qq-move-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.move, 10);
                const dir = btn.dataset.dir;
                const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                if (swapIdx < 0 || swapIdx >= builderFields.length) return;
                const tmp = builderFields[idx];
                builderFields[idx] = builderFields[swapIdx];
                builderFields[swapIdx] = tmp;
                if (editingFieldIdx === idx) editingFieldIdx = swapIdx;
                else if (editingFieldIdx === swapIdx) editingFieldIdx = idx;
                renderBuilderUI(el);
            });
        });

        // Delete
        el.querySelectorAll('.qq-delete-field').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('Delete this field?')) return;
                const idx = parseInt(btn.dataset.del, 10);
                builderFields.splice(idx, 1);
                editingFieldIdx = -1;
                renderBuilderUI(el);
            });
        });

        // Add field
        const addSel = el.querySelector('#qq-add-type');
        if (addSel) {
            addSel.addEventListener('change', () => {
                const type = addSel.value;
                if (!type) return;
                const newField = { type, label: '', id: '' };
                if (type === 'dropdown' || type === 'radio' || type === 'checkboxes') {
                    newField.options = [{ label: '', price: 0 }];
                }
                if (type === 'slider') {
                    newField.min = 1; newField.max = 10; newField.step = 1;
                    newField.default = 1; newField.unit = ''; newField.pricePerUnit = 0;
                }
                if (type === 'toggle') {
                    newField.description = ''; newField.price = 0;
                }
                builderFields.push(newField);
                editingFieldIdx = builderFields.length - 1;
                addSel.value = '';
                renderBuilderUI(el);
            });
        }

        // Save
        const saveBtn = el.querySelector('#qq-save-calc');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                // Collect current edits if any editor is open
                applyOpenEditorValues(el);
                const supa = getSupa();
                if (!supa) { toast('Not connected to database', 'error'); return; }
                const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
                const { error } = await supa.from('site_content').upsert({
                    site_key: SITE_KEY,
                    section: 'plugins',
                    field_name: 'quote_calculator_fields',
                    content: JSON.stringify(builderFields)
                }, { onConflict: 'site_key,section,field_name' });
                if (error) { toast('Save failed: ' + error.message, 'error'); return; }
                panelData.quoteBuilderFields = JSON.parse(JSON.stringify(builderFields));
                toast('Calculator saved', 'success');
            });
        }

        // Wire up inline editors
        wireFieldEditors(el);
    }

    function autoId(label) {
        return (label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
    }

    function renderFieldEditor(f, idx) {
        let html = '<div class="qq-field-editor">';

        // Common: label + id
        html += `
            <div class="qq-editor-row">
                <div class="form-group">
                    <label>Label</label>
                    <input type="text" class="qq-ed-input" data-prop="label" value="${esc(f.label || '')}" placeholder="e.g. Room Size">
                </div>
                <div class="form-group">
                    <label>ID</label>
                    <input type="text" class="qq-ed-input" data-prop="id" value="${esc(f.id || '')}" placeholder="auto-generated">
                </div>
            </div>
        `;

        if (f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkboxes') {
            const opts = f.options || [];
            html += '<div class="qq-options-list" data-idx="' + idx + '">';
            html += '<label class="qq-options-label">Options</label>';
            opts.forEach((opt, oi) => {
                html += `
                    <div class="qq-option-row" data-opt-idx="${oi}">
                        <input type="text" class="qq-ed-input qq-opt-label" value="${esc(opt.label || '')}" placeholder="Option label">
                        <input type="number" class="qq-ed-input qq-opt-price" value="${opt.price || 0}" placeholder="Price" step="any">
                        <button class="btn btn-ghost btn-sm pp-text-error qq-remove-opt" data-opt-del="${oi}" title="Remove">&times;</button>
                    </div>
                `;
            });
            html += '<button class="btn btn-ghost btn-sm qq-add-opt" data-field-idx="' + idx + '">+ Add option</button>';
            html += '</div>';
        }

        if (f.type === 'slider') {
            html += `
                <div class="qq-editor-row qq-editor-row-4">
                    <div class="form-group">
                        <label>Min</label>
                        <input type="number" class="qq-ed-input" data-prop="min" value="${f.min || 0}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Max</label>
                        <input type="number" class="qq-ed-input" data-prop="max" value="${f.max || 100}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Step</label>
                        <input type="number" class="qq-ed-input" data-prop="step" value="${f.step || 1}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Default</label>
                        <input type="number" class="qq-ed-input" data-prop="default" value="${f.default || f.min || 0}" step="any">
                    </div>
                </div>
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>Unit (e.g. m2, hours)</label>
                        <input type="text" class="qq-ed-input" data-prop="unit" value="${esc(f.unit || '')}">
                    </div>
                    <div class="form-group">
                        <label>Price per unit</label>
                        <input type="number" class="qq-ed-input" data-prop="pricePerUnit" value="${f.pricePerUnit || 0}" step="any">
                    </div>
                </div>
            `;
        }

        if (f.type === 'toggle') {
            html += `
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>Description</label>
                        <input type="text" class="qq-ed-input" data-prop="description" value="${esc(f.description || '')}" placeholder="What this toggle enables">
                    </div>
                    <div class="form-group">
                        <label>Price</label>
                        <input type="number" class="qq-ed-input" data-prop="price" value="${f.price || 0}" step="any">
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    function wireFieldEditors(el) {
        // Label auto-generates ID
        el.querySelectorAll('.qq-field-editor').forEach(editor => {
            const labelInput = editor.querySelector('[data-prop="label"]');
            const idInput = editor.querySelector('[data-prop="id"]');
            if (labelInput && idInput) {
                labelInput.addEventListener('input', () => {
                    if (!idInput.dataset.manualEdit) {
                        idInput.value = autoId(labelInput.value);
                    }
                });
                idInput.addEventListener('input', () => {
                    idInput.dataset.manualEdit = 'true';
                });
            }
        });

        // Add option
        el.querySelectorAll('.qq-add-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                applyOpenEditorValues(el);
                const idx = parseInt(btn.dataset.fieldIdx, 10);
                if (!builderFields[idx].options) builderFields[idx].options = [];
                builderFields[idx].options.push({ label: '', price: 0 });
                renderBuilderUI(el);
            });
        });

        // Remove option
        el.querySelectorAll('.qq-remove-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                if (editingFieldIdx < 0) return;
                applyOpenEditorValues(el);
                const optIdx = parseInt(btn.dataset.optDel, 10);
                builderFields[editingFieldIdx].options.splice(optIdx, 1);
                renderBuilderUI(el);
            });
        });
    }

    function applyOpenEditorValues(el) {
        if (editingFieldIdx < 0 || !builderFields[editingFieldIdx]) return;
        const f = builderFields[editingFieldIdx];
        const editor = el.querySelector('.qq-field-editor');
        if (!editor) return;

        // Common props
        editor.querySelectorAll('.qq-ed-input[data-prop]').forEach(input => {
            const prop = input.dataset.prop;
            const val = input.value;
            if (prop === 'min' || prop === 'max' || prop === 'step' || prop === 'default' || prop === 'pricePerUnit' || prop === 'price') {
                f[prop] = parseFloat(val) || 0;
            } else {
                f[prop] = val;
            }
        });

        // Options
        if (f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkboxes') {
            const optRows = editor.querySelectorAll('.qq-option-row');
            f.options = [];
            optRows.forEach(row => {
                const label = row.querySelector('.qq-opt-label').value;
                const price = parseFloat(row.querySelector('.qq-opt-price').value) || 0;
                f.options.push({ label, price });
            });
        }

        // Auto-generate ID from label if empty
        if (!f.id && f.label) f.id = autoId(f.label);
    }

    // ============ QUIZ PANEL ============

    let quizSubView = 'builder'; // 'builder' or 'responses'
    let selectedQuizId = null;
    let quizExpandedQuestions = {}; // { questionId: true }

    function renderQuiz(el) {
        el.innerHTML = `
            <div class="qq-subtabs">
                <button class="qq-subtab ${quizSubView === 'builder' ? 'active' : ''}" data-subtab="builder">Quiz Builder</button>
                <button class="qq-subtab ${quizSubView === 'responses' ? 'active' : ''}" data-subtab="responses">
                    Responses
                    <span class="pp-tab-badge" style="${(panelData.quizResponses || []).length ? '' : 'display:none;'}">${(panelData.quizResponses || []).length}</span>
                </button>
            </div>
            <div id="qz-subtab-content"></div>
        `;

        el.querySelectorAll('.qq-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                quizSubView = btn.dataset.subtab;
                el.querySelectorAll('.qq-subtab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderQuizSubView();
            });
        });

        renderQuizSubView();

        function renderQuizSubView() {
            const target = document.getElementById('qz-subtab-content');
            if (!target) return;
            if (quizSubView === 'builder') renderQuizBuilder(target);
            else renderQuizResponses(target);
        }
    }

    // ---- Quiz Builder ----
    function renderQuizBuilder(el) {
        const quizzes = panelData.quizzes || [];

        // If no quiz selected and quizzes exist, select first
        if (!selectedQuizId && quizzes.length) {
            selectedQuizId = quizzes[0].id;
        }

        const quiz = quizzes.find(q => q.id === selectedQuizId);

        if (!quizzes.length) {
            el.innerHTML = `
                <div class="pp-empty">
                    <p>No quizzes yet. Create one manually or let AI build one for you.</p>
                    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm" id="qz-create-first">Create Blank Quiz</button>
                        <button class="btn btn-secondary btn-sm" id="qz-ai-generate" style="gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            Generate with AI
                        </button>
                    </div>
                </div>
            `;
            el.querySelector('#qz-create-first').addEventListener('click', () => createQuiz(el));
            el.querySelector('#qz-ai-generate').addEventListener('click', () => showAiGenerateModal(el));
            return;
        }

        const questions = (panelData.quizQuestions || []).filter(q => q.quiz_id === selectedQuizId);
        const options = panelData.quizOptions || [];
        const tiers = (panelData.quizTiers || []).filter(t => t.quiz_id === selectedQuizId);

        el.innerHTML = `
            <div class="qz-builder">
                <div class="pp-toolbar" style="margin-bottom:16px;">
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <select class="pp-status-select" id="qz-quiz-select" style="min-width:200px;">
                            ${quizzes.map(q => `<option value="${esc(q.id)}" ${q.id === selectedQuizId ? 'selected' : ''}>${esc(q.title || 'Untitled Quiz')}</option>`).join('')}
                        </select>
                        <span class="pp-badge ${quiz && quiz.active ? 'pp-status-confirmed' : 'pp-status-cancelled'}">${quiz && quiz.active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary btn-sm" id="qz-ai-generate-toolbar" style="gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            Generate with AI
                        </button>
                        <button class="btn btn-primary btn-sm" id="qz-create-new">+ New Quiz</button>
                    </div>
                </div>

                ${quiz ? renderQuizEditor(quiz, questions, options, tiers) : ''}
            </div>
        `;

        // Quiz selector
        el.querySelector('#qz-quiz-select').addEventListener('change', (e) => {
            selectedQuizId = e.target.value;
            quizExpandedQuestions = {};
            renderQuizBuilder(el);
        });

        // Create new quiz
        el.querySelector('#qz-create-new').addEventListener('click', () => createQuiz(el));

        // AI generate from toolbar
        el.querySelector('#qz-ai-generate-toolbar').addEventListener('click', () => showAiGenerateModal(el));

        if (quiz) wireQuizEditorEvents(el, quiz, questions, options, tiers);
    }

    function renderQuizEditor(quiz, questions, options, tiers) {
        return `
            <!-- Settings -->
            <div class="qz-section">
                <h4 class="qz-section-title">Settings</h4>
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" class="qq-ed-input" id="qz-title" value="${esc(quiz.title || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea class="qq-ed-input" id="qz-description" rows="2">${esc(quiz.description || '')}</textarea>
                </div>
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>Display Mode</label>
                        <select class="pp-status-select" id="qz-display-mode">
                            <option value="stepped" ${quiz.display_mode === 'stepped' ? 'selected' : ''}>Stepped (one at a time)</option>
                            <option value="all" ${quiz.display_mode === 'all' ? 'selected' : ''}>All at Once</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="pp-checkbox-label" style="margin-top:24px;">
                            <input type="checkbox" id="qz-email-gate" ${quiz.email_gate ? 'checked' : ''}>
                            Require email before showing results
                        </label>
                    </div>
                </div>
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>CTA Text</label>
                        <input type="text" class="qq-ed-input" id="qz-cta-text" value="${esc(quiz.cta_text || '')}" placeholder="e.g. Book a consultation">
                    </div>
                    <div class="form-group">
                        <label>CTA URL</label>
                        <input type="text" class="qq-ed-input" id="qz-cta-url" value="${esc(quiz.cta_url || '')}" placeholder="e.g. /contact">
                    </div>
                </div>
                <div class="form-group">
                    <label class="pp-checkbox-label">
                        <input type="checkbox" id="qz-active" ${quiz.active ? 'checked' : ''}>
                        Active (visible on site)
                    </label>
                </div>
                <button class="btn btn-primary btn-sm" id="qz-save-settings">Save Settings</button>
            </div>

            <!-- Questions -->
            <div class="qz-section">
                <div class="qz-section-header">
                    <h4 class="qz-section-title">Questions (${questions.length})</h4>
                    <button class="btn btn-primary btn-sm" id="qz-add-question">+ Add Question</button>
                </div>
                ${!questions.length ? '<div class="pp-empty">No questions yet. Add your first question above.</div>' : ''}
                <div class="qz-question-list" id="qz-question-list">
                    ${questions.map((q, qi) => {
                        const qOpts = options.filter(o => o.question_id === q.id);
                        const expanded = !!quizExpandedQuestions[q.id];
                        return `
                            <div class="qq-field-card ${expanded ? 'editing' : ''}" data-question-id="${esc(q.id)}">
                                <div class="qq-field-card-header" data-toggle-question="${esc(q.id)}">
                                    <div class="qq-field-card-info">
                                        <span class="qq-field-label">${esc(truncate(q.question_text || 'Untitled', 60))}</span>
                                        ${q.category ? '<span class="pp-badge" style="font-size:11px;margin-left:8px;">' + esc(q.category) + '</span>' : ''}
                                        <span class="qq-field-summary">${qOpts.length} option${qOpts.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div class="qq-field-card-controls" onclick="event.stopPropagation()">
                                        <button class="btn btn-ghost btn-sm qz-move-q" data-move-q="${esc(q.id)}" data-dir="up" ${qi === 0 ? 'disabled' : ''} title="Move up">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
                                        </button>
                                        <button class="btn btn-ghost btn-sm qz-move-q" data-move-q="${esc(q.id)}" data-dir="down" ${qi === questions.length - 1 ? 'disabled' : ''} title="Move down">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
                                        </button>
                                        <button class="btn btn-ghost btn-sm pp-text-error qz-delete-q" data-del-q="${esc(q.id)}" title="Delete">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </div>
                                ${expanded ? renderQuestionEditor(q, qOpts) : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Tiers -->
            <div class="qz-section">
                <div class="qz-section-header">
                    <h4 class="qz-section-title">Score Tiers (${tiers.length})</h4>
                    <button class="btn btn-primary btn-sm" id="qz-add-tier">+ Add Tier</button>
                </div>
                ${!tiers.length ? '<div class="pp-empty">No tiers defined. Add tiers to show scored results.</div>' : ''}
                <div class="qz-tier-list" id="qz-tier-list">
                    ${tiers.map(t => `
                        <div class="qz-tier-card" data-tier-id="${esc(t.id)}">
                            <div class="qq-editor-row">
                                <div class="form-group">
                                    <label>Tier Name</label>
                                    <input type="text" class="qq-ed-input qz-tier-input" data-tier="${esc(t.id)}" data-prop="tier_name" value="${esc(t.tier_name || '')}">
                                </div>
                                <div class="form-group" style="max-width:80px;">
                                    <label>Min %</label>
                                    <input type="number" class="qq-ed-input qz-tier-input" data-tier="${esc(t.id)}" data-prop="min_percent" value="${t.min_percent || 0}" min="0" max="100">
                                </div>
                                <div class="form-group" style="max-width:80px;">
                                    <label>Max %</label>
                                    <input type="number" class="qq-ed-input qz-tier-input" data-tier="${esc(t.id)}" data-prop="max_percent" value="${t.max_percent || 100}" min="0" max="100">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Result Headline</label>
                                <input type="text" class="qq-ed-input qz-tier-input" data-tier="${esc(t.id)}" data-prop="result_headline" value="${esc(t.result_headline || '')}">
                            </div>
                            <div class="form-group">
                                <label>Result Body</label>
                                <textarea class="qq-ed-input qz-tier-input" data-tier="${esc(t.id)}" data-prop="result_body" rows="2">${esc(t.result_body || '')}</textarea>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                                <button class="btn btn-primary btn-sm qz-save-tier" data-tier-id="${esc(t.id)}">Save Tier</button>
                                <button class="btn btn-ghost btn-sm pp-text-error qz-delete-tier" data-tier-id="${esc(t.id)}">Delete Tier</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Delete Quiz -->
            <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
                <button class="btn btn-ghost btn-sm pp-text-error" id="qz-delete-quiz">Delete This Quiz</button>
            </div>
        `;
    }

    function renderQuestionEditor(q, qOpts) {
        return `
            <div class="qq-field-editor">
                <div class="form-group">
                    <label>Question Text</label>
                    <textarea class="qq-ed-input qz-q-input" data-q="${esc(q.id)}" data-prop="question_text" rows="2">${esc(q.question_text || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Category (optional)</label>
                    <input type="text" class="qq-ed-input qz-q-input" data-q="${esc(q.id)}" data-prop="category" value="${esc(q.category || '')}" placeholder="e.g. Leadership, Technical">
                </div>
                <div class="qq-options-list">
                    <label class="qq-options-label">Options</label>
                    ${qOpts.map((opt, oi) => `
                        <div class="qq-option-row" data-opt-id="${esc(opt.id)}">
                            <input type="text" class="qq-ed-input qz-opt-text" data-opt="${esc(opt.id)}" value="${esc(opt.option_text || '')}" placeholder="Option text">
                            <input type="number" class="qq-ed-input qz-opt-points" data-opt="${esc(opt.id)}" value="${opt.points || 0}" placeholder="Points" style="max-width:80px;">
                            <button class="btn btn-ghost btn-sm pp-text-error qz-delete-opt" data-opt-id="${esc(opt.id)}" title="Remove">&times;</button>
                        </div>
                    `).join('')}
                    <button class="btn btn-ghost btn-sm qz-add-opt" data-q-id="${esc(q.id)}">+ Add Option</button>
                </div>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button class="btn btn-primary btn-sm qz-save-question" data-q-id="${esc(q.id)}">Save Question</button>
                </div>
            </div>
        `;
    }

    function wireQuizEditorEvents(el, quiz, questions, options, tiers) {
        // Save settings
        el.querySelector('#qz-save-settings').addEventListener('click', async () => {
            const supa = getSupa();
            if (!supa) return;
            const updates = {
                title: el.querySelector('#qz-title').value.trim(),
                description: el.querySelector('#qz-description').value.trim(),
                display_mode: el.querySelector('#qz-display-mode').value,
                email_gate: el.querySelector('#qz-email-gate').checked,
                cta_text: el.querySelector('#qz-cta-text').value.trim(),
                cta_url: el.querySelector('#qz-cta-url').value.trim(),
                active: el.querySelector('#qz-active').checked
            };
            const { error } = await supa.from('quizzes').update(updates).eq('id', quiz.id);
            if (error) { toast('Save failed: ' + error.message, 'error'); return; }
            toast('Quiz settings saved', 'success');
            await loadAllData();
        });

        // Toggle question expand
        el.querySelectorAll('[data-toggle-question]').forEach(header => {
            header.addEventListener('click', () => {
                const qId = header.dataset.toggleQuestion;
                quizExpandedQuestions[qId] = !quizExpandedQuestions[qId];
                renderQuizBuilder(el);
            });
        });

        // Move question up/down
        el.querySelectorAll('.qz-move-q').forEach(btn => {
            btn.addEventListener('click', async () => {
                const qId = btn.dataset.moveQ;
                const dir = btn.dataset.dir;
                const idx = questions.findIndex(q => String(q.id) === qId);
                if (idx < 0) return;
                const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                if (swapIdx < 0 || swapIdx >= questions.length) return;
                const supa = getSupa();
                if (!supa) return;
                const a = questions[idx];
                const b = questions[swapIdx];
                await Promise.all([
                    supa.from('quiz_questions').update({ sort_order: swapIdx }).eq('id', a.id),
                    supa.from('quiz_questions').update({ sort_order: idx }).eq('id', b.id)
                ]);
                toast('Question reordered', 'success');
                await loadAllData();
            });
        });

        // Delete question
        el.querySelectorAll('.qz-delete-q').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this question and all its options?')) return;
                const supa = getSupa();
                if (!supa) return;
                const qId = btn.dataset.delQ;
                // Delete options first, then question
                await supa.from('quiz_options').delete().eq('question_id', qId);
                await supa.from('quiz_questions').delete().eq('id', qId);
                toast('Question deleted', 'success');
                delete quizExpandedQuestions[qId];
                await loadAllData();
            });
        });

        // Add question
        el.querySelector('#qz-add-question').addEventListener('click', async () => {
            const supa = getSupa();
            if (!supa) return;
            const sortOrder = questions.length;
            const { data, error } = await supa.from('quiz_questions')
                .insert({ quiz_id: quiz.id, site_key: SITE_KEY, question_text: 'New Question', sort_order: sortOrder })
                .select().single();
            if (error) { toast('Failed to add question: ' + error.message, 'error'); return; }
            if (data) quizExpandedQuestions[data.id] = true;
            toast('Question added', 'success');
            await loadAllData();
        });

        // Save question (text + category)
        el.querySelectorAll('.qz-save-question').forEach(btn => {
            btn.addEventListener('click', async () => {
                const qId = btn.dataset.qId;
                const supa = getSupa();
                if (!supa) return;
                const textEl = el.querySelector('.qz-q-input[data-q="' + qId + '"][data-prop="question_text"]');
                const catEl = el.querySelector('.qz-q-input[data-q="' + qId + '"][data-prop="category"]');
                const updates = {
                    question_text: textEl ? textEl.value.trim() : '',
                    category: catEl ? catEl.value.trim() : ''
                };
                const { error } = await supa.from('quiz_questions').update(updates).eq('id', qId);
                if (error) { toast('Save failed: ' + error.message, 'error'); return; }

                // Also save all option values
                const optRows = el.querySelectorAll('.qq-option-row');
                const optPromises = [];
                optRows.forEach(row => {
                    const optId = row.dataset.optId;
                    if (!optId) return;
                    const textInput = row.querySelector('.qz-opt-text[data-opt="' + optId + '"]');
                    const pointsInput = row.querySelector('.qz-opt-points[data-opt="' + optId + '"]');
                    if (!textInput || !pointsInput) return;
                    // Only save options belonging to this question
                    const opt = (panelData.quizOptions || []).find(o => String(o.id) === optId);
                    if (!opt || String(opt.question_id) !== qId) return;
                    optPromises.push(
                        supa.from('quiz_options').update({
                            option_text: textInput.value.trim(),
                            points: parseInt(pointsInput.value, 10) || 0
                        }).eq('id', optId)
                    );
                });
                await Promise.all(optPromises);

                toast('Question saved', 'success');
                await loadAllData();
            });
        });

        // Add option
        el.querySelectorAll('.qz-add-opt').forEach(btn => {
            btn.addEventListener('click', async () => {
                const qId = btn.dataset.qId;
                const supa = getSupa();
                if (!supa) return;
                const existingOpts = (panelData.quizOptions || []).filter(o => String(o.question_id) === qId);
                const { error } = await supa.from('quiz_options')
                    .insert({ question_id: qId, site_key: SITE_KEY, option_text: '', points: 0, sort_order: existingOpts.length });
                if (error) { toast('Failed to add option: ' + error.message, 'error'); return; }
                toast('Option added', 'success');
                await loadAllData();
            });
        });

        // Delete option
        el.querySelectorAll('.qz-delete-opt').forEach(btn => {
            btn.addEventListener('click', async () => {
                const supa = getSupa();
                if (!supa) return;
                await supa.from('quiz_options').delete().eq('id', btn.dataset.optId);
                toast('Option removed', 'success');
                await loadAllData();
            });
        });

        // Add tier
        el.querySelector('#qz-add-tier').addEventListener('click', async () => {
            const supa = getSupa();
            if (!supa) return;
            const sortOrder = tiers.length;
            // Default tiers if none exist
            let defaultTiers = [];
            if (!tiers.length) {
                defaultTiers = [
                    { quiz_id: quiz.id, site_key: SITE_KEY, tier_name: 'Beginner', min_percent: 0, max_percent: 33, result_headline: 'Getting Started', result_body: 'You are just beginning your journey.', sort_order: 0 },
                    { quiz_id: quiz.id, site_key: SITE_KEY, tier_name: 'Intermediate', min_percent: 34, max_percent: 66, result_headline: 'Making Progress', result_body: 'You have a solid foundation.', sort_order: 1 },
                    { quiz_id: quiz.id, site_key: SITE_KEY, tier_name: 'Expert', min_percent: 67, max_percent: 100, result_headline: 'Well Done!', result_body: 'You demonstrate strong expertise.', sort_order: 2 }
                ];
                const { error } = await supa.from('quiz_tiers').insert(defaultTiers);
                if (error) { toast('Failed to add tiers: ' + error.message, 'error'); return; }
                toast('Default tiers created', 'success');
            } else {
                const { error } = await supa.from('quiz_tiers')
                    .insert({ quiz_id: quiz.id, site_key: SITE_KEY, tier_name: 'New Tier', min_percent: 0, max_percent: 100, result_headline: '', result_body: '', sort_order: sortOrder });
                if (error) { toast('Failed to add tier: ' + error.message, 'error'); return; }
                toast('Tier added', 'success');
            }
            await loadAllData();
        });

        // Save tier
        el.querySelectorAll('.qz-save-tier').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tierId = btn.dataset.tierId;
                const supa = getSupa();
                if (!supa) return;
                const card = el.querySelector('.qz-tier-card[data-tier-id="' + tierId + '"]');
                if (!card) return;
                const updates = {};
                card.querySelectorAll('.qz-tier-input[data-tier="' + tierId + '"]').forEach(input => {
                    const prop = input.dataset.prop;
                    if (prop === 'min_percent' || prop === 'max_percent') {
                        updates[prop] = parseInt(input.value, 10) || 0;
                    } else if (input.tagName === 'TEXTAREA') {
                        updates[prop] = input.value.trim();
                    } else {
                        updates[prop] = input.value.trim();
                    }
                });
                const { error } = await supa.from('quiz_tiers').update(updates).eq('id', tierId);
                if (error) { toast('Save failed: ' + error.message, 'error'); return; }
                toast('Tier saved', 'success');
                await loadAllData();
            });
        });

        // Delete tier
        el.querySelectorAll('.qz-delete-tier').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this tier?')) return;
                const supa = getSupa();
                if (!supa) return;
                await supa.from('quiz_tiers').delete().eq('id', btn.dataset.tierId);
                toast('Tier deleted', 'success');
                await loadAllData();
            });
        });

        // Delete quiz
        el.querySelector('#qz-delete-quiz').addEventListener('click', async () => {
            if (!confirm('Delete this quiz? This will also delete all questions, options, tiers, and responses.')) return;
            const supa = getSupa();
            if (!supa) return;
            await supa.from('quizzes').delete().eq('id', quiz.id);
            selectedQuizId = null;
            quizExpandedQuestions = {};
            toast('Quiz deleted', 'success');
            await loadAllData();
        });
    }

    async function createQuiz(el) {
        const supa = getSupa();
        if (!supa) { toast('Not connected to database', 'error'); return; }
        const { data, error } = await supa.from('quizzes')
            .insert({ site_key: SITE_KEY, title: 'My Quiz', active: false })
            .select().single();
        if (error) { toast('Failed to create quiz: ' + error.message, 'error'); return; }
        selectedQuizId = data.id;
        quizExpandedQuestions = {};
        toast('Quiz created', 'success');
        await loadAllData();
    }

    // ---- AI Quiz Generation ----
    function showAiGenerateModal(parentEl) {
        const target = document.getElementById('qz-subtab-content') || parentEl;
        target.innerHTML = `
            <div class="qz-section" style="max-width:540px;margin:0 auto;">
                <h4 class="qz-section-title" style="text-align:center;">Generate Quiz with AI</h4>
                <p style="color:var(--color-text-muted);text-align:center;margin-bottom:20px;font-size:13px;">
                    Describe your business and we'll create a lead-generating quiz tailored to your audience.
                </p>
                <div class="form-group">
                    <label>Business Description (optional)</label>
                    <textarea class="qq-ed-input" id="qz-ai-description" rows="3" placeholder="e.g. We're a personal training studio specializing in strength training and weight loss for busy professionals..."></textarea>
                </div>
                <div class="form-group">
                    <label>What should the quiz lead to?</label>
                    <textarea class="qq-ed-input" id="qz-ai-outcome" rows="2" placeholder="e.g. Book a free consultation, Sign up for our 6-week program, Schedule a home energy audit..."></textarea>
                    <p style="color:var(--color-text-light);font-size:11px;margin-top:4px;">The quiz results will guide visitors toward this action based on their score.</p>
                </div>
                <div class="qq-editor-row">
                    <div class="form-group">
                        <label>Number of Questions</label>
                        <select class="pp-status-select" id="qz-ai-num-questions" style="width:100%;">
                            <option value="5">5 questions</option>
                            <option value="7" selected>7 questions</option>
                            <option value="10">10 questions</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Categories (optional)</label>
                        <input type="text" class="qq-ed-input" id="qz-ai-categories" placeholder="e.g. Fitness, Nutrition, Lifestyle">
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">
                    <button class="btn btn-ghost btn-sm" id="qz-ai-cancel">Cancel</button>
                    <button class="btn btn-primary btn-sm" id="qz-ai-submit" style="gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        Generate Quiz
                    </button>
                </div>
                <div id="qz-ai-status" style="text-align:center;margin-top:16px;display:none;"></div>
            </div>
        `;

        // Cancel — go back to builder
        target.querySelector('#qz-ai-cancel').addEventListener('click', () => {
            renderQuizBuilder(target);
        });

        // Submit — call the generate-quiz Edge Function
        target.querySelector('#qz-ai-submit').addEventListener('click', async () => {
            const descriptionEl = target.querySelector('#qz-ai-description');
            const outcomeEl = target.querySelector('#qz-ai-outcome');
            const numQuestionsEl = target.querySelector('#qz-ai-num-questions');
            const categoriesEl = target.querySelector('#qz-ai-categories');
            const submitBtn = target.querySelector('#qz-ai-submit');
            const statusEl = target.querySelector('#qz-ai-status');

            const description = descriptionEl.value.trim();
            const desiredOutcome = outcomeEl.value.trim();
            const numQuestions = parseInt(numQuestionsEl.value, 10);
            const categoriesRaw = categoriesEl.value.trim();
            const categories = categoriesRaw ? categoriesRaw.split(',').map(c => c.trim()).filter(Boolean) : undefined;

            // Show loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Generating...';
            statusEl.style.display = 'block';
            statusEl.innerHTML = '<div class="quiz-spinner" style="width:24px;height:24px;border:3px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;margin:0 auto 8px;animation:quizSpin 0.8s linear infinite;"></div><p style="color:var(--color-text-muted);font-size:13px;">AI is creating your quiz... This takes about 15 seconds.</p>';

            // Add spinner animation if not already present
            if (!document.getElementById('qz-ai-spin-style')) {
                const style = document.createElement('style');
                style.id = 'qz-ai-spin-style';
                style.textContent = '@keyframes quizSpin { to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            try {
                const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};

                const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/generate-quiz', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                        ...authHeaders
                    },
                    body: JSON.stringify({
                        site_key: SITE_KEY,
                        business_description: description || undefined,
                        desired_outcome: desiredOutcome || undefined,
                        num_questions: numQuestions,
                        categories: categories
                    })
                });

                const result = await resp.json();

                if (!resp.ok || result.error) {
                    throw new Error(result.error || 'Generation failed');
                }

                // Success — select the new quiz and reload
                selectedQuizId = result.quiz_id;
                quizExpandedQuestions = {};
                toast('Quiz generated! ' + result.questions_count + ' questions created. Review and activate when ready.', 'success');
                await loadAllData();
            } catch (err) {
                statusEl.innerHTML = '<p style="color:var(--color-error);font-size:13px;">' + esc(err.message || 'Something went wrong. Please try again.') + '</p>';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Try Again';
            }
        });
    }

    // ---- Quiz Responses ----
    function renderQuizResponses(el) {
        const responses = panelData.quizResponses || [];
        const tiers = panelData.quizTiers || [];
        const questions = panelData.quizQuestions || [];
        const options = panelData.quizOptions || [];

        if (!responses.length) {
            el.innerHTML = '<div class="pp-empty">No quiz responses yet.</div>';
            return;
        }

        function getTierName(scorePercent, quizId) {
            const qTiers = tiers.filter(t => t.quiz_id === quizId);
            for (const t of qTiers) {
                if (scorePercent >= (t.min_percent || 0) && scorePercent <= (t.max_percent || 100)) {
                    return t.tier_name || '-';
                }
            }
            return '-';
        }

        el.innerHTML = `
            <div class="pp-toolbar">
                <span class="qq-result-count">${responses.length} response${responses.length !== 1 ? 's' : ''}</span>
                <button class="btn btn-secondary btn-sm" id="qz-export-responses">Export CSV</button>
            </div>
            <div class="pp-table-wrap">
                <table class="pp-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Score %</th>
                            <th>Tier</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${responses.map((r, i) => {
                            const scorePercent = r.score_percent != null ? r.score_percent : (r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 100) : 0);
                            const tierName = getTierName(scorePercent, r.quiz_id);
                            return `
                                <tr class="pp-row-clickable" data-idx="${i}">
                                    <td class="pp-nowrap">${fmtDate(r.created_at)}</td>
                                    <td>${esc(r.respondent_name || '-')}</td>
                                    <td>${esc(r.respondent_email || '-')}</td>
                                    <td><strong>${scorePercent}%</strong></td>
                                    <td><span class="pp-badge">${esc(tierName)}</span></td>
                                </tr>
                                <tr class="pp-detail-row" id="qz-resp-detail-${i}" style="display:none;">
                                    <td colspan="5">
                                        <div class="pp-detail-box">
                                            <p><strong>Total Score:</strong> ${r.total_score || 0} / ${r.max_score || 0} (${scorePercent}%)</p>
                                            ${renderResponseAnswers(r, questions, options)}
                                            ${renderCategoryBreakdown(r, questions, options)}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Expand rows
        el.querySelectorAll('.pp-row-clickable').forEach(row => {
            row.addEventListener('click', () => {
                const detail = document.getElementById('qz-resp-detail-' + row.dataset.idx);
                if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
            });
        });

        // Export CSV
        el.querySelector('#qz-export-responses').addEventListener('click', () => {
            const rows = responses.map(r => {
                const scorePercent = r.score_percent != null ? r.score_percent : (r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 100) : 0);
                return {
                    date: fmtDateTime(r.created_at),
                    name: r.respondent_name || '',
                    email: r.respondent_email || '',
                    total_score: r.total_score || 0,
                    max_score: r.max_score || 0,
                    score_percent: scorePercent,
                    tier: getTierName(scorePercent, r.quiz_id)
                };
            });
            downloadCsv(SITE_KEY + '-quiz-responses.csv', rows);
            toast('CSV downloaded', 'success');
        });
    }

    function renderResponseAnswers(response, questions, options) {
        let answers = response.answers;
        if (!answers) return '';
        if (typeof answers === 'string') {
            try { answers = JSON.parse(answers); } catch(e) { return ''; }
        }
        if (!Array.isArray(answers) || !answers.length) return '';

        return `
            <div style="margin-top:12px;">
                <strong>Answers:</strong>
                <table class="pp-items-table" style="margin-top:4px;">
                    <thead><tr><th>Question</th><th>Answer</th><th style="width:60px;">Points</th></tr></thead>
                    <tbody>
                        ${answers.map(a => {
                            const q = questions.find(q => String(q.id) === String(a.question_id));
                            const opt = options.find(o => String(o.id) === String(a.option_id));
                            return `
                                <tr>
                                    <td>${esc(q ? truncate(q.question_text, 50) : '-')}</td>
                                    <td>${esc(opt ? opt.option_text : (a.answer_text || '-'))}</td>
                                    <td>${a.points || 0}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderCategoryBreakdown(response, questions, options) {
        let answers = response.answers;
        if (!answers) return '';
        if (typeof answers === 'string') {
            try { answers = JSON.parse(answers); } catch(e) { return ''; }
        }
        if (!Array.isArray(answers) || !answers.length) return '';

        // Group by category
        const cats = {};
        answers.forEach(a => {
            const q = questions.find(q => String(q.id) === String(a.question_id));
            const cat = (q && q.category) ? q.category : 'General';
            if (!cats[cat]) cats[cat] = { score: 0, max: 0 };
            cats[cat].score += (a.points || 0);
            // Find max points for this question's options
            const qOpts = options.filter(o => String(o.question_id) === String(a.question_id));
            const maxPts = qOpts.length ? Math.max(...qOpts.map(o => o.points || 0)) : 0;
            cats[cat].max += maxPts;
        });

        const catKeys = Object.keys(cats);
        if (catKeys.length <= 1 && catKeys[0] === 'General') return '';

        return `
            <div style="margin-top:12px;">
                <strong>Category Breakdown:</strong>
                <table class="pp-items-table" style="margin-top:4px;">
                    <thead><tr><th>Category</th><th>Score</th><th style="width:60px;">%</th></tr></thead>
                    <tbody>
                        ${catKeys.map(cat => {
                            const c = cats[cat];
                            const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
                            return `
                                <tr>
                                    <td>${esc(cat)}</td>
                                    <td>${c.score} / ${c.max}</td>
                                    <td>${pct}%</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ============ PAYMENTS (STRIPE CONNECT) PANEL ============

    async function fetchStripeStatus() {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY })
            });
            if (!resp.ok) throw new Error('Status check failed');
            stripeStatus = await resp.json();
        } catch (e) {
            stripeStatus = { connected: false };
        }
    }

    async function triggerStripeOAuth() {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-oauth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY, action: 'get_oauth_url' })
            });
            if (!resp.ok) throw new Error('Failed to start OAuth');
            const data = await resp.json();
            if (data.oauth_url) {
                window.location.href = data.oauth_url;
            } else {
                toast('Failed to get OAuth URL', 'error');
            }
        } catch (e) {
            toast('Could not start Stripe connection: ' + e.message, 'error');
        }
    }

    async function exchangeOAuthCode(code, state) {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-oauth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY, action: 'exchange_code', code, state })
            });
            if (!resp.ok) throw new Error('Code exchange failed');
            const data = await resp.json();
            if (data.success) {
                stripeStatus = null;
                toast('Stripe account connected successfully!', 'success');
                // Switch to payments tab
                const paymentsTab = container.querySelector('[data-tab="payments"]');
                if (paymentsTab) {
                    activeTab = 'payments';
                    container.querySelectorAll('.pp-tab').forEach(b => b.classList.remove('active'));
                    paymentsTab.classList.add('active');
                }
                renderActivePanel();
            } else {
                toast(data.error || 'Failed to connect Stripe account', 'error');
            }
        } catch (e) {
            toast('Error connecting Stripe: ' + e.message, 'error');
        }
    }

    async function triggerStripeOnboard() {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-onboard', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY })
            });
            if (!resp.ok) throw new Error('Onboarding request failed');
            const data = await resp.json();
            if (data.onboarding_url) {
                window.location.href = data.onboarding_url;
            } else {
                toast('Failed to get onboarding URL', 'error');
            }
        } catch (e) {
            toast('Could not start Stripe onboarding: ' + e.message, 'error');
        }
    }

    async function createStripeDashboardLink() {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY, action: 'create_login_link' })
            });
            if (!resp.ok) throw new Error('Failed to create dashboard link');
            const data = await resp.json();
            if (data.login_url) {
                window.open(data.login_url, '_blank');
            } else {
                toast('Could not open Stripe Dashboard', 'error');
            }
        } catch (e) {
            toast('Error: ' + e.message, 'error');
        }
    }

    async function disconnectStripe() {
        try {
            const authHeaders = window.getAuthHeaders ? window.getAuthHeaders() : {};
            const resp = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/stripe-connect-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
                    ...authHeaders
                },
                body: JSON.stringify({ site_key: SITE_KEY, action: 'disconnect' })
            });
            if (!resp.ok) throw new Error('Disconnect failed');
            stripeStatus = { connected: false };
            toast('Stripe account disconnected', 'success');
            renderActivePanel();
        } catch (e) {
            toast('Error disconnecting: ' + e.message, 'error');
        }
    }

    function renderPayments(el) {
        if (!stripeStatus) {
            el.innerHTML = '<div class="pp-loading">Loading payment status...</div>';
            fetchStripeStatus().then(() => renderPayments(el));
            return;
        }

        const s = stripeStatus;

        // State 3: Connected & active
        if (s.connected && s.charges_enabled) {
            const isStandard = s.connect_type === 'standard';
            el.innerHTML = `
                <div class="sc-card">
                    <div class="sc-badge sc-badge-success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        Stripe Connected
                    </div>
                    <p class="sc-connect-type">${isStandard ? 'Connected via OAuth (existing account)' : 'Connected via Express'}</p>
                    <h3 class="sc-title">Payment Processing Active</h3>
                    <div class="sc-status-list">
                        <div class="sc-status-item">
                            <span class="sc-dot sc-dot-green"></span>
                            Payments enabled
                        </div>
                        ${s.payouts_enabled ? `
                        <div class="sc-status-item">
                            <span class="sc-dot sc-dot-green"></span>
                            Payouts enabled
                        </div>` : `
                        <div class="sc-status-item">
                            <span class="sc-dot sc-dot-yellow"></span>
                            Payouts pending verification
                        </div>`}
                    </div>
                    <div class="sc-actions">
                        <button class="btn sc-dashboard-btn" id="sc-view-dashboard">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            View Stripe Dashboard
                        </button>
                    </div>
                    <button class="sc-disconnect-link" id="sc-disconnect">Disconnect Stripe account</button>
                </div>
            `;
            if (isStandard) {
                el.querySelector('#sc-view-dashboard').addEventListener('click', () => {
                    window.open('https://dashboard.stripe.com', '_blank');
                });
            } else {
                el.querySelector('#sc-view-dashboard').addEventListener('click', createStripeDashboardLink);
            }
            el.querySelector('#sc-disconnect').addEventListener('click', () => {
                if (confirm('Disconnect your Stripe account? This will disable checkout on your shop until you reconnect.')) {
                    disconnectStripe();
                }
            });
            return;
        }

        // State 2: Onboarding incomplete
        if (s.connected && !s.charges_enabled) {
            el.innerHTML = `
                <div class="sc-card">
                    <div class="sc-badge sc-badge-warning">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Setup Incomplete
                    </div>
                    <h3 class="sc-title">Your Stripe account needs additional information</h3>
                    <p class="sc-desc">Stripe requires a few more details before you can accept payments. Complete the setup to start receiving money from customers.</p>
                    <div class="sc-actions">
                        <button class="btn sc-connect-btn" id="sc-complete-setup">Complete Setup</button>
                    </div>
                    <p class="sc-note">Once verified by Stripe, you'll be able to accept payments.</p>
                </div>
            `;
            el.querySelector('#sc-complete-setup').addEventListener('click', () => {
                el.querySelector('#sc-complete-setup').disabled = true;
                el.querySelector('#sc-complete-setup').textContent = 'Redirecting...';
                triggerStripeOnboard();
            });
            return;
        }

        // State 1: Not connected — choice screen
        el.innerHTML = `
            <div class="sc-card">
                <div class="sc-logo">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="8" fill="#635BFF"/>
                        <path d="M18.42 16.95c0-.9.74-1.24 1.97-1.24 1.76 0 3.98.53 5.74 1.49V12.1a14.82 14.82 0 0 0-5.74-1.05c-4.69 0-7.81 2.45-7.81 6.55 0 6.39 8.8 5.37 8.8 8.12 0 1.06-.92 1.41-2.21 1.41-1.91 0-4.35-.79-6.29-1.85v5.17c2.14.92 4.31 1.31 6.29 1.31 4.81 0 8.11-2.38 8.11-6.54-.01-6.9-8.86-5.67-8.86-8.27z" fill="white"/>
                    </svg>
                </div>
                <h3 class="sc-title">Connect Stripe to Accept Payments</h3>
                <p class="sc-desc">Choose how you'd like to connect. No platform fees &mdash; you keep 100% of sales.</p>
                <div class="sc-choice-grid">
                    <div class="sc-choice-card" id="sc-choice-existing">
                        <div class="sc-choice-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </div>
                        <h4>I already have Stripe</h4>
                        <p>Connect your existing Stripe account securely via OAuth. You'll authorize access on Stripe's website.</p>
                        <button class="btn sc-connect-btn" id="sc-start-oauth">Link Existing Account</button>
                    </div>
                    <div class="sc-choice-card" id="sc-choice-new">
                        <div class="sc-choice-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        </div>
                        <h4>I'm new to Stripe</h4>
                        <p>We'll create a new Stripe account for you. Quick guided setup &mdash; takes about 5 minutes.</p>
                        <button class="btn sc-connect-btn sc-connect-btn-secondary" id="sc-start-onboard">Create New Account</button>
                    </div>
                </div>
            </div>
        `;
        el.querySelector('#sc-start-oauth').addEventListener('click', () => {
            el.querySelector('#sc-start-oauth').disabled = true;
            el.querySelector('#sc-start-oauth').textContent = 'Redirecting...';
            triggerStripeOAuth();
        });
        el.querySelector('#sc-start-onboard').addEventListener('click', () => {
            el.querySelector('#sc-start-onboard').disabled = true;
            el.querySelector('#sc-start-onboard').textContent = 'Redirecting...';
            triggerStripeOnboard();
        });
    }

    // Handle Stripe return URL parameters
    function handleStripeReturnParams() {
        const params = new URLSearchParams(window.location.search);

        // Handle OAuth callback (code + state from Stripe OAuth redirect)
        const oauthCode = params.get('code');
        const oauthState = params.get('state');
        if (oauthCode && oauthState) {
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
            exchangeOAuthCode(oauthCode, oauthState);
            return;
        }

        const stripeParam = params.get('stripe');
        if (!stripeParam) return;

        // Clean URL
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);

        if (stripeParam === 'complete') {
            toast('Stripe account setup updated successfully!', 'success');
            // Force refresh status
            stripeStatus = null;
            // Switch to payments tab if it exists
            const paymentsTab = container.querySelector('[data-tab="payments"]');
            if (paymentsTab) {
                activeTab = 'payments';
                container.querySelectorAll('.pp-tab').forEach(b => b.classList.remove('active'));
                paymentsTab.classList.add('active');
                renderActivePanel();
            }
        } else if (stripeParam === 'refresh') {
            toast('Stripe link expired. Starting new onboarding...', 'warning');
            triggerStripeOnboard();
        }
    }

    // ============ INIT ============
    // Wait for showDashboard to finish (admin.js sets dashboard visible)
    function waitForDashboard() {
        const dash = document.getElementById('dashboard');
        if (dash && dash.style.display !== 'none') {
            renderShell();
            handleStripeReturnParams();
        } else {
            // Observe for dashboard becoming visible
            const observer = new MutationObserver(() => {
                if (dash && dash.style.display !== 'none') {
                    observer.disconnect();
                    renderShell();
                    handleStripeReturnParams();
                }
            });
            observer.observe(dash || document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
        }
    }

    waitForDashboard();

})();
