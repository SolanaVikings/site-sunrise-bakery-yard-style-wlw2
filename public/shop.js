// ============================================
// GetMeOnlineFast — Shop / Product Catalog + Cart
// Only active when CONFIG.PLUGINS.ecommerce.shop.enabled
// This file is IDENTICAL across all client sites.
// ============================================

(function () {
    'use strict';

    if (typeof CONFIG === 'undefined' || !CONFIG.PLUGINS) return;
    var ecom = CONFIG.PLUGINS.ecommerce;
    if (!ecom || !ecom.enabled || !ecom.shop || !ecom.shop.enabled) return;

    var SITE_KEY = CONFIG.SITE_KEY || 'site';
    var CURRENCY = ecom.shop.currency || 'EUR';
    var CART_KEY = 'cart-' + SITE_KEY;
    var stripeConnected = !!(ecom.shop.stripeConnected);

    // ---- Supabase client ----
    var sb = null;
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }

    // ---- Currency formatter ----
    function formatPrice(amount) {
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY }).format(amount);
        } catch (e) {
            return CURRENCY + ' ' + Number(amount).toFixed(2);
        }
    }

    // ---- Cart state ----
    function getCart() {
        try {
            var raw = localStorage.getItem(CART_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveCart(cart) {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }

    function addToCart(product) {
        var cart = getCart();
        var existing = null;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === product.id) { existing = cart[i]; break; }
        }
        if (existing) {
            existing.qty += 1;
        } else {
            cart.push({ id: product.id, name: product.name, price: product.price, image: product.image_url, qty: 1 });
        }
        saveCart(cart);
        renderCart();
        updateBadge();
    }

    function removeFromCart(productId) {
        var cart = getCart().filter(function (item) { return item.id !== productId; });
        saveCart(cart);
        renderCart();
        updateBadge();
    }

    function updateQty(productId, delta) {
        var cart = getCart();
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === productId) {
                cart[i].qty = Math.max(0, cart[i].qty + delta);
                if (cart[i].qty === 0) {
                    cart.splice(i, 1);
                }
                break;
            }
        }
        saveCart(cart);
        renderCart();
        updateBadge();
    }

    function cartTotal() {
        var cart = getCart();
        var total = 0;
        for (var i = 0; i < cart.length; i++) total += cart[i].price * cart[i].qty;
        return total;
    }

    function cartCount() {
        var cart = getCart();
        var count = 0;
        for (var i = 0; i < cart.length; i++) count += cart[i].qty;
        return count;
    }

    // ---- Badge ----
    function updateBadge() {
        var count = cartCount();
        var badge = document.getElementById('cart-badge');
        var fab = document.getElementById('cart-fab');
        if (badge) badge.textContent = count;
        if (fab) fab.style.display = count > 0 ? '' : 'none';
    }

    // ---- Cart drawer ----
    function openCart() {
        var drawer = document.getElementById('cart-drawer');
        if (drawer) {
            drawer.classList.add('cart-drawer--open');
            drawer.setAttribute('aria-hidden', 'false');
        }
        renderCart();
    }

    function closeCart() {
        var drawer = document.getElementById('cart-drawer');
        if (drawer) {
            drawer.classList.remove('cart-drawer--open');
            drawer.setAttribute('aria-hidden', 'true');
        }
    }

    function renderCart() {
        var container = document.getElementById('cart-items');
        var totalEl = document.getElementById('cart-total-amount');
        var checkoutBtn = document.getElementById('cart-checkout-btn');
        if (!container) return;

        var cart = getCart();
        if (cart.length === 0) {
            container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
            if (checkoutBtn) checkoutBtn.disabled = true;
        } else {
            var html = '';
            for (var i = 0; i < cart.length; i++) {
                var item = cart[i];
                html += '<div class="cart-item" data-id="' + item.id + '">';
                if (item.image) html += '<img class="cart-item-img" src="' + escapeHtml(item.image) + '" alt="" width="56" height="56" loading="lazy">';
                html += '<div class="cart-item-info">';
                html += '<span class="cart-item-name">' + escapeHtml(item.name) + '</span>';
                html += '<span class="cart-item-price">' + formatPrice(item.price) + '</span>';
                html += '</div>';
                html += '<div class="cart-item-qty">';
                html += '<button class="qty-btn qty-minus" data-id="' + item.id + '" aria-label="Decrease">&#8722;</button>';
                html += '<span>' + item.qty + '</span>';
                html += '<button class="qty-btn qty-plus" data-id="' + item.id + '" aria-label="Increase">&#43;</button>';
                html += '</div>';
                html += '<button class="cart-item-remove" data-id="' + item.id + '" aria-label="Remove">&times;</button>';
                html += '</div>';
            }
            container.innerHTML = html;
            if (checkoutBtn) checkoutBtn.disabled = !stripeConnected;
        }
        if (totalEl) totalEl.textContent = formatPrice(cartTotal());

        // Show/hide Stripe-not-ready message
        var drawer = document.getElementById('cart-drawer');
        if (drawer) {
            var msgId = 'cart-stripe-msg';
            var existing = document.getElementById(msgId);
            if (!stripeConnected && cart.length > 0) {
                if (!existing) {
                    var msg = document.createElement('p');
                    msg.id = msgId;
                    msg.className = 'cart-stripe-msg';
                    msg.textContent = 'Checkout is being set up. Please check back soon.';
                    var btn = document.getElementById('cart-checkout-btn');
                    if (btn && btn.parentNode) {
                        btn.parentNode.insertBefore(msg, btn);
                    }
                }
            } else if (existing) {
                existing.parentNode.removeChild(existing);
            }
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ---- Render products ----
    function renderProducts(products) {
        var grid = document.getElementById('products-grid');
        if (!grid) return;

        if (!products || products.length === 0) {
            grid.innerHTML = '<p class="shop-empty">No products available yet. Check back soon!</p>';
            return;
        }

        var html = '';
        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            html += '<article class="shop-product-card">';
            if (p.image_url) {
                html += '<div class="shop-product-image"><img src="' + escapeHtml(p.image_url) + '" alt="' + escapeHtml(p.name) + '" width="400" height="300" loading="lazy" decoding="async"></div>';
            }
            html += '<div class="shop-product-body">';
            html += '<h3 class="shop-product-name">' + escapeHtml(p.name) + '</h3>';
            if (p.description) html += '<p class="shop-product-desc">' + escapeHtml(p.description) + '</p>';
            html += '<div class="shop-product-footer">';
            html += '<span class="shop-product-price">' + formatPrice(p.price) + '</span>';
            html += '<button class="btn btn-primary shop-add-btn" data-product-id="' + p.id + '">Add to Cart</button>';
            html += '</div></div></article>';
        }
        grid.innerHTML = html;

        // Inject Product JSON-LD for SEO
        var existingProductSchema = document.getElementById('product-schema-ld');
        if (existingProductSchema) existingProductSchema.parentNode.removeChild(existingProductSchema);

        var productSchemas = [];
        for (var pi = 0; pi < products.length; pi++) {
            var prod = products[pi];
            var schema = {
                '@type': 'Product',
                name: prod.name,
                offers: {
                    '@type': 'Offer',
                    price: String(prod.price),
                    priceCurrency: CURRENCY,
                    availability: prod.active !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
                }
            };
            if (prod.description) schema.description = prod.description;
            if (prod.image_url) schema.image = prod.image_url;
            productSchemas.push(schema);
        }
        if (productSchemas.length > 0) {
            var schemaScript = document.createElement('script');
            schemaScript.type = 'application/ld+json';
            schemaScript.id = 'product-schema-ld';
            schemaScript.textContent = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: 'Products',
                itemListElement: productSchemas.map(function(s, idx) {
                    return { '@type': 'ListItem', position: idx + 1, item: s };
                })
            }, null, 2);
            document.head.appendChild(schemaScript);
        }

        // Bind add-to-cart buttons
        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('.shop-add-btn');
            if (!btn) return;
            var pid = btn.getAttribute('data-product-id');
            var product = null;
            for (var j = 0; j < products.length; j++) {
                if (String(products[j].id) === pid) { product = products[j]; break; }
            }
            if (product) {
                addToCart(product);
                btn.textContent = 'Added!';
                setTimeout(function () { btn.textContent = 'Add to Cart'; }, 1200);
            }
        });
    }

    // ---- Fetch products ----
    async function loadProducts() {
        if (!sb) {
            renderProducts([]);
            return;
        }
        try {
            var resp = await sb.from('products').select('*').eq('site_key', SITE_KEY).eq('active', true).order('sort_order');
            if (resp.error) throw resp.error;
            renderProducts(resp.data || []);
        } catch (err) {
            console.error('Shop: error loading products', err);
            renderProducts([]);
        }
    }

    // ---- Checkout ----
    async function checkout() {
        var cart = getCart();
        if (cart.length === 0) return;
        if (!stripeConnected) return;

        // Prompt for customer email
        var emailInput = document.getElementById('cart-customer-email');
        var customerEmail = emailInput ? emailInput.value.trim() : '';
        if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
            if (emailInput) {
                emailInput.focus();
                emailInput.classList.add('cart-email-error');
            }
            return;
        }

        var checkoutBtn = document.getElementById('cart-checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.textContent = 'Processing...';
        }

        try {
            var res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    site_key: SITE_KEY,
                    customer_email: customerEmail,
                    items: cart.map(function (item) {
                        return { product_id: item.id, quantity: item.qty };
                    })
                })
            });

            if (!res.ok) throw new Error('Order failed');
            var data = await res.json();

            if (data.checkout_url) {
                // Redirect first, clear cart only after navigation starts
                var cartBackup = JSON.stringify(cart);
                saveCart([]);
                updateBadge();
                window.location.href = data.checkout_url;
            }
        } catch (err) {
            console.error('Shop: checkout error', err);
            alert('Checkout failed. Please try again.');
            if (checkoutBtn) {
                checkoutBtn.disabled = false;
                checkoutBtn.textContent = 'Checkout';
            }
        }
    }

    // ---- Event delegation for cart drawer ----
    function initCartEvents() {
        var fab = document.getElementById('cart-fab');
        if (fab) fab.addEventListener('click', openCart);

        var closeBtn = document.querySelector('.cart-drawer-close');
        if (closeBtn) closeBtn.addEventListener('click', closeCart);

        var overlay = document.querySelector('.cart-drawer-overlay');
        if (overlay) overlay.addEventListener('click', closeCart);

        var checkoutBtn = document.getElementById('cart-checkout-btn');
        if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);

        var cartItems = document.getElementById('cart-items');
        if (cartItems) {
            cartItems.addEventListener('click', function (e) {
                var target = e.target;
                if (target.classList.contains('qty-minus')) {
                    updateQty(target.getAttribute('data-id'), -1);
                } else if (target.classList.contains('qty-plus')) {
                    updateQty(target.getAttribute('data-id'), 1);
                } else if (target.classList.contains('cart-item-remove')) {
                    removeFromCart(target.getAttribute('data-id'));
                }
            });
        }
    }

    // ---- Init ----
    function init() {
        updateBadge();
        initCartEvents();
        loadProducts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
