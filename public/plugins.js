// ============================================
// GetMeOnlineFast — Tier 1 Plugins (Shared)
// Reads CONFIG.PLUGINS and injects DOM elements.
// This file is IDENTICAL across all client sites.
// ============================================

(function () {
    'use strict';

    // Graceful exit if CONFIG or PLUGINS not defined (old sites)
    if (typeof CONFIG === 'undefined' || !CONFIG.PLUGINS) return;

    var PLUGINS = CONFIG.PLUGINS;
    var SITE_KEY = CONFIG.SITE_KEY || 'site';

    // Sanitize embed code: strip inline scripts, event handlers, javascript: URIs
    function sanitizeEmbedCode(code) {
        // Remove inline <script> tags (keep external ones that pass allowlist)
        code = code.replace(/<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/gi, '');
        // Remove event handlers
        code = code.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
        code = code.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
        // Remove javascript: URIs
        code = code.replace(/javascript\s*:/gi, '');
        return code;
    }

    // ------------------------------------------
    // Utility: strip phone number to digits and +
    // ------------------------------------------
    function cleanPhone(num) {
        if (!num) return '';
        return num.replace(/[\s\-\(\)\.]/g, '');
    }

    // ------------------------------------------
    // Inject shared plugin styles (single <style> tag)
    // ------------------------------------------
    function injectStyles() {
        var css = '';

        // ---- Contact Button Styles ----
        css += '\n/* Plugin: Floating Contact Button */\n';
        css += '.gmof-contact-wrap{position:fixed;bottom:24px;right:24px;z-index:9990;display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;}';
        css += '.gmof-contact-btn{pointer-events:auto;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);transition:transform 0.2s ease,box-shadow 0.2s ease;text-decoration:none;position:relative;}';
        css += '@media(min-width:768px){.gmof-contact-btn{width:60px;height:60px;}}';
        css += '.gmof-contact-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,0.3);}';
        css += '.gmof-contact-btn:active{transform:scale(0.96);}';
        css += '.gmof-contact-btn svg{width:28px;height:28px;fill:#fff;}';
        css += '.gmof-contact-btn--whatsapp{background:#25D366;}';
        css += '.gmof-contact-btn--phone{background:#0d9488;}';
        css += '.gmof-contact-btn--sms{background:#7C3AED;}';
        css += '.gmof-contact-btn--secondary{width:48px;height:48px;}';
        css += '@media(min-width:768px){.gmof-contact-btn--secondary{width:52px;height:52px;}}';
        css += '.gmof-contact-btn--secondary svg{width:24px;height:24px;}';

        // Pulse animation
        css += '@keyframes gmof-pulse{0%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(37,211,102,0.4);}70%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 12px rgba(37,211,102,0);}100%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(37,211,102,0);}}';
        css += '@keyframes gmof-pulse-blue{0%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(37,99,235,0.4);}70%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 12px rgba(37,99,235,0);}100%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(37,99,235,0);}}';
        css += '@keyframes gmof-pulse-purple{0%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(124,58,237,0.4);}70%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 12px rgba(124,58,237,0);}100%{box-shadow:0 4px 14px rgba(0,0,0,0.25),0 0 0 0 rgba(124,58,237,0);}}';
        css += '.gmof-contact-btn--whatsapp{animation:gmof-pulse 2.5s ease-in-out infinite;}';
        css += '.gmof-contact-btn--phone{animation:gmof-pulse-blue 2.5s ease-in-out infinite;}';
        css += '.gmof-contact-btn--sms{animation:gmof-pulse-purple 2.5s ease-in-out infinite;}';
        css += '@media(prefers-reduced-motion:reduce){.gmof-contact-btn{animation:none!important;}}';

        // Tooltip
        css += '.gmof-contact-btn::after{content:attr(data-tooltip);position:absolute;right:calc(100% + 10px);top:50%;transform:translateY(-50%);background:#1a1a1a;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:500;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.2s ease;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}';
        css += '.gmof-contact-btn:hover::after{opacity:1;}';

        // Shift up when cookie banner is visible
        css += '.gmof-contact-wrap--shifted{bottom:100px;}';
        css += '@media(min-width:768px){.gmof-contact-wrap--shifted{bottom:88px;}}';

        // ---- Cookie Consent Styles ----
        css += '\n/* Plugin: Cookie Consent Banner */\n';
        css += '.gmof-cookie-bar{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(17,17,17,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#f0f0f0;padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px 20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5;transform:translateY(100%);transition:transform 0.4s cubic-bezier(0.22,1,0.36,1);border-top:1px solid rgba(255,255,255,0.08);}';
        css += '.gmof-cookie-bar--visible{transform:translateY(0);}';
        css += '.gmof-cookie-bar--hiding{transform:translateY(100%);}';
        css += '.gmof-cookie-text{flex:1 1 300px;text-align:center;color:rgba(240,240,240,0.85);}';
        css += '.gmof-cookie-text a{color:#fff;text-decoration:underline;text-underline-offset:2px;margin-left:6px;}';
        css += '.gmof-cookie-text a:hover{color:#a5b4fc;}';
        css += '.gmof-cookie-btns{display:flex;gap:8px;flex-shrink:0;}';
        css += '.gmof-cookie-btn{border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease,color 0.15s ease,transform 0.1s ease;font-family:inherit;}';
        css += '.gmof-cookie-btn:active{transform:scale(0.96);}';
        css += '.gmof-cookie-btn--accept{background:#fff;color:#111;}';
        css += '.gmof-cookie-btn--accept:hover{background:#e0e0e0;}';
        css += '.gmof-cookie-btn--decline{background:transparent;color:rgba(240,240,240,0.7);border:1px solid rgba(255,255,255,0.2);}';
        css += '.gmof-cookie-btn--decline:hover{color:#fff;border-color:rgba(255,255,255,0.4);}';

        // Mobile stacking
        css += '@media(max-width:480px){.gmof-cookie-bar{flex-direction:column;padding:16px;gap:12px;}.gmof-cookie-text{text-align:center;flex-basis:auto;}.gmof-cookie-btns{width:100%;justify-content:center;}}';

        // ---- Footer Legal Links Styles ----
        css += '\n/* Plugin: Footer Legal Links */\n';
        css += '.footer-legal-links{margin-bottom:0.5rem;text-align:center;}';
        css += '.footer-legal-links a{color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.8rem;transition:color 0.3s;}';
        css += '.footer-legal-links a:hover{color:#fff;}';
        css += '.footer-legal-sep{color:rgba(255,255,255,0.3);margin:0 0.5rem;font-size:0.8rem;}';

        // ---- Legal Page Styles ----
        css += '\n/* Plugin: Legal Page Layout */\n';
        css += '.legal-page{max-width:800px;margin:0 auto;padding:6rem 2rem 4rem;}';
        css += '.legal-page h1{font-family:var(--font-display,inherit);font-size:2rem;font-weight:700;margin-bottom:0.5rem;color:var(--color-dark,#1A1A2E);}';
        css += '.legal-updated{color:var(--color-text-muted,#6B7280);margin-bottom:2.5rem;font-size:0.9rem;}';
        css += '.legal-section{margin-bottom:2rem;}';
        css += '.legal-section h2{font-size:1.25rem;font-weight:600;margin-bottom:0.75rem;color:var(--color-dark,#1A1A2E);}';
        css += '.legal-section div,.legal-section p{line-height:1.8;color:var(--color-text,#374151);white-space:pre-line;font-size:0.95rem;}';
        css += '@media(max-width:640px){.legal-page{padding:5rem 1.25rem 3rem;}.legal-page h1{font-size:1.5rem;}.legal-section h2{font-size:1.1rem;}}';

        var styleEl = document.createElement('style');
        styleEl.id = 'gmof-plugins-css';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    // ------------------------------------------
    // SVG Icons
    // ------------------------------------------
    var ICONS = {
        whatsapp: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.01a9.65 9.65 0 01-4.92-1.348l-.353-.21-3.66.96.977-3.57-.23-.367A9.647 9.647 0 012.34 12.05c.002-5.334 4.342-9.674 9.679-9.674a9.62 9.62 0 016.84 2.834 9.62 9.62 0 012.83 6.842c-.003 5.335-4.343 9.675-9.68 9.675l.04.058zm8.22-17.89A11.57 11.57 0 0012.05.46C5.495.46.16 5.794.157 12.05c-.001 2.046.534 4.041 1.55 5.803L.05 24l6.305-1.654a11.56 11.56 0 005.694 1.45h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413l-.197.005z"/></svg>',
        phone: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>',
        sms: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>'
    };

    // ------------------------------------------
    // Plugin 1: Floating Contact Button
    // ------------------------------------------
    function initContactButton() {
        var cfg = PLUGINS.contactButton;
        if (!cfg || !cfg.enabled || cfg.type === 'none') return null;

        var wrap = document.createElement('div');
        wrap.className = 'gmof-contact-wrap';
        wrap.setAttribute('role', 'complementary');
        wrap.setAttribute('aria-label', 'Contact options');

        var type = cfg.type || 'whatsapp';
        var whatsappNum = cleanPhone(cfg.whatsapp);
        var phoneNum = cleanPhone(cfg.phone);

        if (type === 'both') {
            // Secondary (phone) button on top
            if (phoneNum) {
                var phoneBtn = document.createElement('a');
                phoneBtn.href = 'tel:' + phoneNum;
                phoneBtn.className = 'gmof-contact-btn gmof-contact-btn--phone gmof-contact-btn--secondary';
                phoneBtn.setAttribute('data-tooltip', 'Call us');
                phoneBtn.setAttribute('aria-label', 'Call us');
                phoneBtn.innerHTML = ICONS.phone;
                wrap.appendChild(phoneBtn);
            }
            // Primary (WhatsApp) button on bottom
            if (whatsappNum) {
                var waUrl = 'https://wa.me/' + whatsappNum;
                if (cfg.message) waUrl += '?text=' + encodeURIComponent(cfg.message);
                var waBtn = document.createElement('a');
                waBtn.href = waUrl;
                waBtn.target = '_blank';
                waBtn.rel = 'noopener noreferrer';
                waBtn.className = 'gmof-contact-btn gmof-contact-btn--whatsapp';
                waBtn.setAttribute('data-tooltip', 'Chat on WhatsApp');
                waBtn.setAttribute('aria-label', 'Chat on WhatsApp');
                waBtn.innerHTML = ICONS.whatsapp;
                wrap.appendChild(waBtn);
            }
        } else if (type === 'whatsapp') {
            if (!whatsappNum) return null;
            var waUrl2 = 'https://wa.me/' + whatsappNum;
            if (cfg.message) waUrl2 += '?text=' + encodeURIComponent(cfg.message);
            var btn = document.createElement('a');
            btn.href = waUrl2;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.className = 'gmof-contact-btn gmof-contact-btn--whatsapp';
            btn.setAttribute('data-tooltip', 'Chat on WhatsApp');
            btn.setAttribute('aria-label', 'Chat on WhatsApp');
            btn.innerHTML = ICONS.whatsapp;
            wrap.appendChild(btn);
        } else if (type === 'phone') {
            if (!phoneNum) return null;
            var pBtn = document.createElement('a');
            pBtn.href = 'tel:' + phoneNum;
            pBtn.className = 'gmof-contact-btn gmof-contact-btn--phone';
            pBtn.setAttribute('data-tooltip', 'Call us');
            pBtn.setAttribute('aria-label', 'Call us');
            pBtn.innerHTML = ICONS.phone;
            wrap.appendChild(pBtn);
        } else if (type === 'sms') {
            if (!phoneNum) return null;
            var sBtn = document.createElement('a');
            sBtn.href = 'sms:' + phoneNum;
            sBtn.className = 'gmof-contact-btn gmof-contact-btn--sms';
            sBtn.setAttribute('data-tooltip', 'Text us');
            sBtn.setAttribute('aria-label', 'Text us');
            sBtn.innerHTML = ICONS.sms;
            wrap.appendChild(sBtn);
        }

        if (wrap.children.length === 0) return null;

        document.body.appendChild(wrap);
        return wrap;
    }

    // ------------------------------------------
    // Plugin 2: Cookie Consent Banner
    // ------------------------------------------
    function initCookieConsent(contactWrap) {
        var cfg = PLUGINS.cookieConsent;
        if (!cfg || !cfg.enabled) return;

        var storageKey = 'cookie-consent-' + SITE_KEY;

        // Already responded — don't show
        if (localStorage.getItem(storageKey)) return;

        // Build banner
        var bar = document.createElement('div');
        bar.className = 'gmof-cookie-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Cookie consent');

        var textSpan = document.createElement('span');
        textSpan.className = 'gmof-cookie-text';
        var textContent = 'We use cookies to improve your experience.';
        if (cfg.policyUrl) {
            textContent += '<a href="' + cfg.policyUrl + '" target="_blank" rel="noopener noreferrer">Privacy Policy</a>';
        }
        textSpan.innerHTML = textContent;

        var btnWrap = document.createElement('div');
        btnWrap.className = 'gmof-cookie-btns';

        var acceptBtn = document.createElement('button');
        acceptBtn.className = 'gmof-cookie-btn gmof-cookie-btn--accept';
        acceptBtn.textContent = 'Accept';
        acceptBtn.type = 'button';

        var declineBtn = document.createElement('button');
        declineBtn.className = 'gmof-cookie-btn gmof-cookie-btn--decline';
        declineBtn.textContent = 'Decline';
        declineBtn.type = 'button';

        btnWrap.appendChild(acceptBtn);
        btnWrap.appendChild(declineBtn);
        bar.appendChild(textSpan);
        bar.appendChild(btnWrap);
        document.body.appendChild(bar);

        // Shift contact button up while banner is visible
        if (contactWrap) {
            contactWrap.classList.add('gmof-contact-wrap--shifted');
        }

        // Slide in after 1 second
        setTimeout(function () {
            bar.classList.add('gmof-cookie-bar--visible');
        }, 1000);

        // Dismiss handler
        function dismiss(choice) {
            localStorage.setItem(storageKey, choice);
            bar.classList.remove('gmof-cookie-bar--visible');
            bar.classList.add('gmof-cookie-bar--hiding');
            // Un-shift contact button
            if (contactWrap) {
                contactWrap.classList.remove('gmof-contact-wrap--shifted');
            }
            setTimeout(function () {
                if (bar.parentNode) bar.parentNode.removeChild(bar);
            }, 500);
        }

        acceptBtn.addEventListener('click', function () { dismiss('accepted'); });
        declineBtn.addEventListener('click', function () { dismiss('declined'); });
    }

    // ------------------------------------------
    // Plugin 3: JSON-LD Schema Markup
    // ------------------------------------------
    function initSchemaPlugin() {
        if (!PLUGINS.schema || !PLUGINS.schema.enabled) return;

        var cfg = PLUGINS.schema;

        function getContent(key) {
            var el = document.querySelector('[data-content="' + key + '"]');
            if (!el) return '';
            if (el.tagName === 'IMG') return el.src || '';
            return el.textContent.trim();
        }

        function setIfPresent(obj, key, value) {
            if (value !== '' && value !== null && value !== undefined) {
                obj[key] = value;
            }
        }

        var VALID_TYPES = [
            'LocalBusiness', 'Restaurant', 'CafeOrCoffeeShop', 'BeautySalon',
            'HairSalon', 'BarberShop', 'Plumber', 'Electrician',
            'HomeAndConstructionBusiness', 'FoodEstablishment', 'Bakery',
            'Dentist', 'LegalService', 'RealEstateAgent'
        ];

        function resolveType(raw) {
            if (!raw) return 'LocalBusiness';
            for (var i = 0; i < VALID_TYPES.length; i++) {
                if (VALID_TYPES[i].toLowerCase() === raw.toLowerCase()) return VALID_TYPES[i];
            }
            return 'LocalBusiness';
        }

        // Hours parsing
        var DAY_MAP = {
            'mon':'Monday','tue':'Tuesday','wed':'Wednesday','thu':'Thursday',
            'fri':'Friday','sat':'Saturday','sun':'Sunday',
            'monday':'Monday','tuesday':'Tuesday','wednesday':'Wednesday',
            'thursday':'Thursday','friday':'Friday','saturday':'Saturday','sunday':'Sunday'
        };
        var DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

        function expandDayRange(str) {
            str = str.trim().toLowerCase();
            if (DAY_MAP[str]) return [DAY_MAP[str]];
            var parts = str.split('-');
            if (parts.length !== 2) return null;
            var startFull = DAY_MAP[parts[0].trim().toLowerCase()];
            var endFull = DAY_MAP[parts[1].trim().toLowerCase()];
            if (!startFull || !endFull) return null;
            var startIdx = DAY_ORDER.indexOf(startFull.toLowerCase());
            var endIdx = DAY_ORDER.indexOf(endFull.toLowerCase());
            if (startIdx === -1 || endIdx === -1) return null;
            var days = [];
            var i = startIdx;
            do {
                days.push(DAY_ORDER[i].charAt(0).toUpperCase() + DAY_ORDER[i].slice(1));
                i = (i + 1) % 7;
            } while (i !== (endIdx + 1) % 7 && days.length < 8);
            return days.length > 0 ? days : null;
        }

        function parseTime(str) {
            str = str.trim().toLowerCase().replace(/\s+/g, '');
            var m24 = str.match(/^(\d{1,2}):(\d{2})$/);
            if (m24) {
                var h = parseInt(m24[1], 10), m = parseInt(m24[2], 10);
                if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
                    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
            }
            var m12 = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
            if (!m12) return null;
            var hour = parseInt(m12[1], 10), min = m12[2] ? parseInt(m12[2], 10) : 0, period = m12[3];
            if (hour < 1 || hour > 12 || min < 0 || min > 59) return null;
            if (period === 'am' && hour === 12) hour = 0;
            if (period === 'pm' && hour !== 12) hour += 12;
            return (hour < 10 ? '0' : '') + hour + ':' + (min < 10 ? '0' : '') + min;
        }

        function parseOpeningHours(raw) {
            if (!raw) return null;
            var lines = raw.replace(/<br\s*\/?>/gi, '\n').replace(/;/g, '\n')
                .split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
            if (lines.length === 0) return null;
            var specs = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (/closed/i.test(line) && !/\d/.test(line)) continue;
                var dayPart = '', timePart = '';
                var colonSpaceIdx = line.indexOf(': ');
                if (colonSpaceIdx !== -1) {
                    dayPart = line.substring(0, colonSpaceIdx);
                    timePart = line.substring(colonSpaceIdx + 2);
                } else {
                    var colonIdx = line.indexOf(':');
                    if (colonIdx === -1) continue;
                    dayPart = line.substring(0, colonIdx);
                    timePart = line.substring(colonIdx + 1);
                }
                var days = expandDayRange(dayPart);
                if (!days || days.length === 0) continue;
                var timeParts = timePart.trim().split(/\s*[-\u2013]\s*/);
                if (timeParts.length !== 2) continue;
                var opens = parseTime(timeParts[0]), closes = parseTime(timeParts[1]);
                if (!opens || !closes) continue;
                specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: opens, closes: closes });
            }
            return specs.length > 0 ? specs : null;
        }

        // Build LocalBusiness JSON-LD
        var name = getContent('site.name');
        var description = getContent('hero.tagline') || getContent('about.description');
        var image = getContent('hero.image');
        var phone = getContent('contact.phone');
        var email = getContent('contact.email');
        var address = getContent('contact.address');
        var hoursRaw = getContent('contact.hours');
        var businessType = resolveType(cfg.businessType);

        var ld = { '@context': 'https://schema.org', '@type': businessType };
        setIfPresent(ld, 'name', name);
        setIfPresent(ld, 'description', description);
        setIfPresent(ld, 'image', image);
        setIfPresent(ld, 'telephone', phone);
        setIfPresent(ld, 'email', email);
        ld.url = window.location.origin;

        if (address) {
            var addrClean = address.replace(/<br\s*\/?>/gi, '\n');
            var addrParts = addrClean.split(/[\n,]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
            var addrObj = { '@type': 'PostalAddress', streetAddress: addrParts[0] || addrClean };
            // Try to extract locality (city), postal code, country from address parts
            if (addrParts.length >= 2) {
                // Look for postal/zip code pattern in any part
                for (var ai = 1; ai < addrParts.length; ai++) {
                    var part = addrParts[ai];
                    if (/^\d{4,10}$/.test(part) || /^[A-Z]{1,2}\d/.test(part) || /\b\d{5}(-\d{4})?\b/.test(part) || /^D\d{1,2}$/i.test(part)) {
                        addrObj.postalCode = part;
                    } else if (/^(Ireland|UK|United Kingdom|United States|USA|US|Germany|France|Spain|Italy|Netherlands|Australia|Canada)$/i.test(part)) {
                        addrObj.addressCountry = part;
                    } else if (!addrObj.addressLocality) {
                        addrObj.addressLocality = part;
                    }
                }
            }
            ld.address = addrObj;
        }
        if (cfg.geo && cfg.geo.lat && cfg.geo.lng) {
            ld.geo = { '@type': 'GeoCoordinates', latitude: String(cfg.geo.lat), longitude: String(cfg.geo.lng) };
        }
        var hoursSpec = parseOpeningHours(hoursRaw);
        if (hoursSpec) ld.openingHoursSpecification = hoursSpec;

        // AggregateRating from testimonials
        var ratings = [];
        for (var r = 1; r <= 10; r++) {
            var ratingStr = getContent('testimonials.review' + r + '_rating');
            if (ratingStr) {
                var stars = (ratingStr.match(/\u2605/g) || []).length;
                if (stars > 0) ratings.push(stars);
            }
        }
        if (ratings.length > 0) {
            var sum = 0;
            for (var ri = 0; ri < ratings.length; ri++) sum += ratings[ri];
            ld.aggregateRating = {
                '@type': 'AggregateRating',
                ratingValue: (sum / ratings.length).toFixed(1),
                bestRating: '5',
                ratingCount: String(ratings.length)
            };
        }

        // priceRange from service prices
        var prices = [];
        for (var pi = 1; pi <= 10; pi++) {
            var priceStr = getContent('services.service' + pi + '_price');
            if (priceStr) {
                var priceNum = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
                if (priceNum > 0) prices.push(priceNum);
            }
        }
        if (prices.length > 0) {
            var minP = Math.min.apply(null, prices);
            var maxP = Math.max.apply(null, prices);
            ld.priceRange = minP === maxP ? '\u20AC' + minP : '\u20AC' + minP + ' - \u20AC' + maxP;
        }

        // sameAs social links
        if (cfg.sameAs && Array.isArray(cfg.sameAs) && cfg.sameAs.length > 0) {
            ld.sameAs = cfg.sameAs;
        }

        var scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.textContent = JSON.stringify(ld, null, 2);
        document.head.appendChild(scriptEl);

        // WebSite schema
        var siteLd = { '@context': 'https://schema.org', '@type': 'WebSite' };
        setIfPresent(siteLd, 'name', name);
        siteLd.url = window.location.origin;
        var siteScriptEl = document.createElement('script');
        siteScriptEl.type = 'application/ld+json';
        siteScriptEl.textContent = JSON.stringify(siteLd, null, 2);
        document.head.appendChild(siteScriptEl);
    }

    // ------------------------------------------
    // Plugin 3b: FAQPage Schema Markup
    // ------------------------------------------
    function initFaqSchema() {
        function getContent(key) {
            var el = document.querySelector('[data-content="' + key + '"]');
            if (!el) return '';
            return el.textContent.trim();
        }

        var faqs = [];
        for (var i = 1; i <= 10; i++) {
            var q = getContent('faq.q' + i);
            var a = getContent('faq.a' + i);
            if (q && a) {
                faqs.push({
                    '@type': 'Question',
                    name: q,
                    acceptedAnswer: { '@type': 'Answer', text: a }
                });
            }
        }
        if (faqs.length === 0) return;

        var faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs };
        var scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.textContent = JSON.stringify(faqLd, null, 2);
        document.head.appendChild(scriptEl);
    }

    // ------------------------------------------
    // Plugin 3c: Service ItemList Schema Markup
    // ------------------------------------------
    function initServiceSchema() {
        function getContent(key) {
            var el = document.querySelector('[data-content="' + key + '"]');
            if (!el) return '';
            return el.textContent.trim();
        }

        var services = [];
        for (var s = 1; s <= 10; s++) {
            var sName = getContent('services.service' + s + '_name');
            if (!sName) continue;
            var item = { '@type': 'ListItem', position: s, item: { '@type': 'Service', name: sName } };
            var sDesc = getContent('services.service' + s + '_desc');
            var sPrice = getContent('services.service' + s + '_price');
            if (sDesc) item.item.description = sDesc;
            if (sPrice) {
                var priceNum = sPrice.replace(/[^0-9.]/g, '');
                if (priceNum) {
                    item.item.offers = { '@type': 'Offer', price: priceNum, priceCurrency: 'EUR' };
                }
            }
            services.push(item);
        }
        if (services.length === 0) return;

        var listLd = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Services',
            itemListElement: services
        };
        var scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.textContent = JSON.stringify(listLd, null, 2);
        document.head.appendChild(scriptEl);
    }

    // ------------------------------------------
    // Plugin 3d: BreadcrumbList Schema (multi-page)
    // ------------------------------------------
    function initBreadcrumbSchema() {
        if (!CONFIG.PAGES || CONFIG.PAGES.length <= 1) return;

        var path = window.location.pathname;
        var pageName = 'Home';
        var pageNames = { '/index.html': 'Home', '/about.html': 'About', '/services.html': 'Services', '/contact.html': 'Contact' };
        for (var p in pageNames) {
            if (path.indexOf(p) !== -1) { pageName = pageNames[p]; break; }
        }
        if (path === '/' || path.indexOf('/index') !== -1) pageName = 'Home';

        var items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin + '/' }];
        if (pageName !== 'Home') {
            items.push({ '@type': 'ListItem', position: 2, name: pageName, item: window.location.href });
        }

        var bcLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
        var scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.textContent = JSON.stringify(bcLd, null, 2);
        document.head.appendChild(scriptEl);
    }

    // ------------------------------------------
    // Plugin 4: Google Reviews Widget
    // ------------------------------------------
    function initReviewsPlugin() {
        var cfg = PLUGINS.reviews;
        if (!cfg || !cfg.enabled) return;

        var provider = (cfg.provider || 'none').toLowerCase();
        if (provider === 'none') return;

        var insertBefore = document.getElementById('contact');
        if (!insertBefore) insertBefore = document.querySelector('footer');
        if (!insertBefore) return;

        function escapeHTML(str) {
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        }

        function buildStarString(rating) {
            var full = Math.floor(rating), half = (rating - full) >= 0.25 && (rating - full) < 0.75;
            var result = '';
            for (var s = 0; s < 5; s++) {
                if (s < full) result += '\u2605';
                else if (s === full && half) result += '\u2605';
                else result += '\u2606';
            }
            return result;
        }

        function formatReviewDate(dateStr) {
            try {
                var d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
            } catch (e) { return dateStr; }
        }

        function injectReviewStyles() {
            if (document.getElementById('plugin-reviews-css')) return;
            var style = document.createElement('style');
            style.id = 'plugin-reviews-css';
            style.textContent =
                '.plugin-reviews{padding:5rem 2rem;max-width:1300px;margin:0 auto;}' +
                '.reviews-summary{display:flex;align-items:baseline;justify-content:center;gap:0.75rem;margin-bottom:3rem;flex-wrap:wrap;}' +
                '.reviews-avg{font-size:3rem;font-weight:700;line-height:1;color:var(--color-dark,#1A1A2E);}' +
                '.reviews-stars{font-size:1.5rem;color:#f59e0b;letter-spacing:2px;line-height:1;}' +
                '.reviews-count{font-size:0.9rem;color:var(--color-text-muted,#6B7280);}' +
                '.reviews-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;}' +
                '.review-card{background:var(--color-bg-alt,#F8F9FA);border:1px solid var(--color-border,#E5E7EB);border-radius:12px;padding:2rem;display:flex;flex-direction:column;gap:1rem;transition:transform 0.3s ease,box-shadow 0.3s ease;}' +
                '.review-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.06);}' +
                '.review-card-header{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;}' +
                '.review-stars{color:#f59e0b;font-size:1.1rem;letter-spacing:2px;line-height:1;}' +
                '.review-date{font-size:0.75rem;color:var(--color-text-muted,#6B7280);white-space:nowrap;}' +
                '.review-text-wrap{position:relative;flex:1;}' +
                '.review-text{font-size:0.95rem;line-height:1.7;color:var(--color-text,#2D2D3A);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;margin:0;}' +
                '.review-text-wrap.expanded .review-text{-webkit-line-clamp:unset;overflow:visible;}' +
                '.review-read-more{background:none;border:none;cursor:pointer;font-size:0.8rem;font-weight:600;color:var(--color-accent,#3B5BDB);padding:0.25rem 0 0;display:inline-block;}' +
                '.review-read-more:hover{color:var(--color-accent-light,#5C7CFA);}' +
                '.review-author{display:flex;align-items:center;gap:0.75rem;padding-top:0.75rem;border-top:1px solid var(--color-border,#E5E7EB);}' +
                '.review-author-avatar{width:36px;height:36px;border-radius:50%;background:var(--color-accent,#3B5BDB);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:600;flex-shrink:0;}' +
                '.review-author-name{font-size:0.9rem;font-weight:600;color:var(--color-dark,#1A1A2E);}' +
                '.plugin-reviews-embed{max-width:900px;margin:0 auto;}' +
                '@media(max-width:1024px){.reviews-grid{grid-template-columns:repeat(2,1fr);}}' +
                '@media(max-width:768px){.plugin-reviews{padding:3rem 1rem;}.reviews-grid{grid-template-columns:none;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;gap:1rem;padding-bottom:1rem;}.review-card{min-width:280px;max-width:320px;flex-shrink:0;scroll-snap-align:start;}.reviews-avg{font-size:2.25rem;}.reviews-stars{font-size:1.25rem;}}' +
                '.reviews-grid::-webkit-scrollbar{height:4px;}.reviews-grid::-webkit-scrollbar-track{background:var(--color-border,#E5E7EB);border-radius:2px;}.reviews-grid::-webkit-scrollbar-thumb{background:var(--color-text-muted,#6B7280);border-radius:2px;}';
            document.head.appendChild(style);
        }

        // Embed mode (elfsight/trustindex)
        if (provider === 'elfsight' || provider === 'trustindex') {
            var embedCode = (cfg.embedCode || '').trim();
            if (!embedCode) return;

            var allowedDomains = ['elfsight.com','cdn.elfsight.com','static.elfsight.com','trustindex.io','cdn.trustindex.io'];
            var srcPattern = /<script[^>]+src\s*=\s*["']([^"']+)["']/gi;
            var m;
            while ((m = srcPattern.exec(embedCode)) !== null) {
                var isAllowed = false;
                try {
                    var urlObj = new URL(m[1]);
                    for (var i = 0; i < allowedDomains.length; i++) {
                        if (urlObj.hostname === allowedDomains[i] || urlObj.hostname.endsWith('.' + allowedDomains[i])) { isAllowed = true; break; }
                    }
                } catch (e) { isAllowed = false; }
                if (!isAllowed) { console.warn('Reviews plugin: blocked script from untrusted domain:', m[1]); return; }
            }

            var section = document.createElement('section');
            section.id = 'reviews';
            section.className = 'plugin-reviews';
            section.innerHTML =
                '<div class="section-header centered"><span class="section-number">\u2605</span><div class="section-title-group"><span class="section-label">Testimonials</span><h2>What Our Customers Say</h2></div></div>' +
                '<div class="plugin-reviews-embed"></div>';
            insertBefore.parentNode.insertBefore(section, insertBefore);

            var embedContainer = section.querySelector('.plugin-reviews-embed');
            var range = document.createRange();
            range.selectNode(embedContainer);
            embedContainer.appendChild(range.createContextualFragment(sanitizeEmbedCode(embedCode)));
            injectReviewStyles();
            return;
        }

        // Native mode
        if (provider === 'native') {
            var reviews = cfg.reviews;
            if (!Array.isArray(reviews) || reviews.length === 0) return;

            var totalRating = 0, ratedCount = 0;
            for (var r = 0; r < reviews.length; r++) {
                var rating = parseFloat(reviews[r].rating);
                if (!isNaN(rating)) { totalRating += rating; ratedCount++; }
            }
            var avgRating = ratedCount > 0 ? (totalRating / ratedCount) : 0;

            var cardsHTML = '';
            for (var c = 0; c < reviews.length; c++) {
                var rev = reviews[c];
                var author = escapeHTML(rev.author || 'Anonymous');
                var text = escapeHTML(rev.text || '');
                var date = rev.date ? '<time class="review-date">' + formatReviewDate(rev.date) + '</time>' : '';
                cardsHTML +=
                    '<article class="review-card">' +
                        '<div class="review-card-header"><div class="review-stars">' + buildStarString(parseFloat(rev.rating) || 0) + '</div>' + date + '</div>' +
                        '<div class="review-text-wrap"><p class="review-text">' + text + '</p></div>' +
                        '<div class="review-author"><div class="review-author-avatar">' + author.charAt(0).toUpperCase() + '</div><span class="review-author-name">' + author + '</span></div>' +
                    '</article>';
            }

            var section = document.createElement('section');
            section.id = 'reviews';
            section.className = 'plugin-reviews';
            section.innerHTML =
                '<div class="section-header centered"><span class="section-number">\u2605</span><div class="section-title-group"><span class="section-label">Testimonials</span><h2>What Our Customers Say</h2></div></div>' +
                '<div class="reviews-summary"><span class="reviews-avg">' + avgRating.toFixed(1) + '</span><span class="reviews-stars">' + buildStarString(avgRating) + '</span><span class="reviews-count">from ' + reviews.length + ' review' + (reviews.length !== 1 ? 's' : '') + '</span></div>' +
                '<div class="reviews-grid">' + cardsHTML + '</div>';
            insertBefore.parentNode.insertBefore(section, insertBefore);
            injectReviewStyles();

            // Read more toggle
            requestAnimationFrame(function() {
                var textWraps = document.querySelectorAll('.review-text-wrap');
                textWraps.forEach(function(wrap) {
                    var textEl = wrap.querySelector('.review-text');
                    if (textEl && textEl.scrollHeight > textEl.offsetHeight + 2) {
                        var btn = document.createElement('button');
                        btn.className = 'review-read-more';
                        btn.textContent = 'Read more';
                        btn.setAttribute('aria-expanded', 'false');
                        btn.addEventListener('click', function() {
                            var expanded = wrap.classList.toggle('expanded');
                            btn.textContent = expanded ? 'Show less' : 'Read more';
                            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                        });
                        wrap.appendChild(btn);
                    }
                });
            });
        }
    }

    // ------------------------------------------
    // Plugin 5: Contact Form (FREE — always active)
    // ------------------------------------------
    function initContactForm() {
        var form = document.getElementById('contact-form');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            // Honeypot check
            var honeypot = form.querySelector('input[name="website"]');
            if (honeypot && honeypot.value) return;

            var name = form.querySelector('#cf-name').value.trim();
            var email = form.querySelector('#cf-email').value.trim();
            var phone = form.querySelector('#cf-phone').value.trim();
            var message = form.querySelector('#cf-message').value.trim();
            var statusEl = document.getElementById('contactform-status');
            var submitBtn = form.querySelector('.contactform-submit');

            // Validation
            if (!email || !message) {
                statusEl.textContent = 'Please fill in email and message.';
                statusEl.className = 'contactform-status contactform-status--error';
                return;
            }
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                statusEl.textContent = 'Please enter a valid email address.';
                statusEl.className = 'contactform-status contactform-status--error';
                return;
            }

            // Loading state
            var originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            statusEl.textContent = '';
            statusEl.className = 'contactform-status';

            fetch(CONFIG.SUPABASE_URL + '/functions/v1/contact-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
                body: JSON.stringify({ site_key: SITE_KEY, name: name, email: email, phone: phone, message: message })
            })
            .then(function (res) {
                if (!res.ok) throw new Error('Server error');
                return res.json();
            })
            .then(function () {
                statusEl.textContent = 'Message sent! We will get back to you soon.';
                statusEl.className = 'contactform-status contactform-status--success';
                form.reset();
            })
            .catch(function () {
                statusEl.textContent = 'Something went wrong. Please try again or call us directly.';
                statusEl.className = 'contactform-status contactform-status--error';
            })
            .finally(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            });
        });
    }

    // ------------------------------------------
    // Plugin 6: Newsletter Signup (ECOMMERCE)
    // ------------------------------------------
    function initNewsletter() {
        var cfg = PLUGINS.ecommerce;
        if (!cfg || !cfg.enabled || !cfg.newsletter || !cfg.newsletter.enabled) return;

        // Show section
        var section = document.getElementById('newsletter');
        if (section) section.style.display = '';

        var form = document.getElementById('newsletter-form');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            // Honeypot check
            var honeypot = form.querySelector('input[name="company"]');
            if (honeypot && honeypot.value) return;

            var email = form.querySelector('#nl-email').value.trim();
            var statusEl = document.getElementById('newsletter-status');
            var submitBtn = form.querySelector('button[type="submit"]');

            if (!email) {
                statusEl.textContent = 'Please enter your email.';
                statusEl.className = 'newsletter-status newsletter-status--error';
                return;
            }
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                statusEl.textContent = 'Please enter a valid email address.';
                statusEl.className = 'newsletter-status newsletter-status--error';
                return;
            }

            var originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Subscribing...';
            statusEl.textContent = '';
            statusEl.className = 'newsletter-status';

            fetch(CONFIG.SUPABASE_URL + '/functions/v1/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
                body: JSON.stringify({ site_key: SITE_KEY, email: email })
            })
            .then(function (res) {
                if (!res.ok) throw new Error('Server error');
                return res.json();
            })
            .then(function () {
                statusEl.textContent = 'You are subscribed! Check your inbox.';
                statusEl.className = 'newsletter-status newsletter-status--success';
                form.reset();
            })
            .catch(function () {
                statusEl.textContent = 'Something went wrong. Please try again.';
                statusEl.className = 'newsletter-status newsletter-status--error';
            })
            .finally(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            });
        });
    }

    // ------------------------------------------
    // Ecommerce: Show nav links + sections
    // ------------------------------------------
    function initEcommerceVisibility() {
        var cfg = PLUGINS.ecommerce;
        if (!cfg || !cfg.enabled) return;

        // Show ecommerce nav links for enabled features
        if (cfg.shop && cfg.shop.enabled) {
            var shopNav = document.querySelector('a.ecom-nav-link[href="#shop"]');
            if (shopNav) shopNav.style.display = '';
            var shopSection = document.getElementById('shop');
            if (shopSection) shopSection.style.display = '';
        }
        if (cfg.booking && cfg.booking.enabled) {
            var bookNav = document.querySelector('a.ecom-nav-link[href="#booking"]');
            if (bookNav) bookNav.style.display = '';
            var bookSection = document.getElementById('booking');
            if (bookSection) bookSection.style.display = '';
        }
    }

    // ------------------------------------------
    // Quiz Add-on: Show quiz section + nav links
    // Separate from ecommerce — quiz is its own add-on
    // ------------------------------------------
    function initQuizVisibility() {
        if (!PLUGINS.quiz || !PLUGINS.quiz.enabled) return;

        var quizSection = document.getElementById('quiz');
        if (quizSection) quizSection.style.display = '';

        document.querySelectorAll('.quiz-nav-link').forEach(function(el) {
            el.style.display = '';
        });
    }

    // ------------------------------------------
    // Plugin 7: Quote Calculator (v2 — rich field types)
    // Supports: dropdown, radio, slider, checkboxes, toggle
    // Backward-compatible with old items[] config format
    // ------------------------------------------
    function initQuoteCalculator() {
        var cfg = PLUGINS.quoteCalculator;
        if (!cfg || !cfg.enabled) return;

        // Check for saved fields from admin builder (stored in site_content by admin-plugins.js)
        // window._siteContentMap is set by script.js after fetching all site_content
        var savedFields = null;
        if (window._siteContentMap && window._siteContentMap['plugins.quote_calculator_fields']) {
            try {
                savedFields = JSON.parse(window._siteContentMap['plugins.quote_calculator_fields']);
            } catch (e) { /* ignore parse errors, fall back to config */ }
        }

        // Priority: saved DB fields > config.js fields > legacy items[]
        var fields = (Array.isArray(savedFields) && savedFields.length > 0) ? savedFields : cfg.fields;
        if (!fields && Array.isArray(cfg.items) && cfg.items.length > 0) {
            fields = [{
                type: 'checkboxes',
                id: 'services',
                label: 'Select services',
                options: cfg.items.map(function(item) {
                    return { label: item.name, price: item.price, description: item.description, unit: item.unit, qty: item.qty };
                })
            }];
        }
        if (!fields || fields.length === 0) return;

        var insertBefore = document.getElementById('contact');
        if (!insertBefore) insertBefore = document.querySelector('footer');
        if (!insertBefore) return;

        var sym = cfg.currencySymbol || '\u20ac';

        function esc(s) {
            var d = document.createElement('div');
            d.appendChild(document.createTextNode(s));
            return d.innerHTML;
        }

        function fmtPrice(n) {
            return sym + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }

        // ---- Render individual field types ----
        function renderField(field, idx) {
            var html = '<div class="qc-field" data-field-id="' + esc(field.id) + '" data-field-type="' + esc(field.type) + '">';
            html += '<div class="qc-field-header"><label class="qc-field-label">' + esc(field.label) + '</label>';
            if (field.description) html += '<p class="qc-field-desc">' + esc(field.description) + '</p>';
            html += '</div>';

            switch (field.type) {

                case 'dropdown':
                    html += '<div class="qc-select-wrap">';
                    html += '<select class="qc-select" data-field-idx="' + idx + '" aria-label="' + esc(field.label) + '">';
                    html += '<option value="" data-price="0">Select...</option>';
                    for (var i = 0; i < field.options.length; i++) {
                        var o = field.options[i];
                        var pTag = o.price ? ' (' + fmtPrice(o.price) + ')' : '';
                        html += '<option value="' + esc(o.value || o.label) + '" data-price="' + (o.price || 0) + '">' + esc(o.label) + pTag + '</option>';
                    }
                    html += '</select>';
                    html += '<span class="qc-select-arrow" aria-hidden="true"></span>';
                    html += '</div>';
                    break;

                case 'radio':
                    html += '<div class="qc-radio-group" role="radiogroup" aria-label="' + esc(field.label) + '">';
                    for (var i = 0; i < field.options.length; i++) {
                        var o = field.options[i];
                        var val = o.value || o.label;
                        var checked = i === 0 ? ' checked' : '';
                        html += '<label class="qc-radio-pill' + (i === 0 ? ' qc-radio-pill--active' : '') + '">';
                        html += '<input type="radio" name="qc_radio_' + esc(field.id) + '" value="' + esc(val) + '" data-price="' + (o.price || 0) + '" data-field-idx="' + idx + '"' + checked + '>';
                        html += '<span class="qc-radio-pill-inner">';
                        html += '<span class="qc-radio-pill-label">' + esc(o.label) + '</span>';
                        if (o.price) html += '<span class="qc-radio-pill-price">+' + fmtPrice(o.price) + '</span>';
                        html += '</span></label>';
                    }
                    html += '</div>';
                    break;

                case 'slider':
                    var def = field.default || field.min || 1;
                    var subtotal = def * (field.pricePerUnit || 0);
                    html += '<div class="qc-slider-wrap">';
                    html += '<input type="range" class="qc-slider" min="' + (field.min || 0) + '" max="' + (field.max || 100) + '" step="' + (field.step || 1) + '" value="' + def + '" data-field-idx="' + idx + '" aria-label="' + esc(field.label) + '">';
                    html += '<div class="qc-slider-info">';
                    html += '<span class="qc-slider-val"><strong class="qc-slider-num">' + def + '</strong> ' + esc(field.unit || '') + '</span>';
                    if (field.pricePerUnit) {
                        html += '<span class="qc-slider-calc">' + def + ' &times; ' + fmtPrice(field.pricePerUnit) + ' = <strong>' + fmtPrice(subtotal) + '</strong></span>';
                    }
                    html += '</div></div>';
                    break;

                case 'checkboxes':
                    html += '<div class="qc-checks-group">';
                    for (var i = 0; i < field.options.length; i++) {
                        var o = field.options[i];
                        html += '<label class="qc-check-card">';
                        html += '<input type="checkbox" class="qc-check-input" data-price="' + (o.price || 0) + '" data-field-idx="' + idx + '" data-opt-idx="' + i + '">';
                        html += '<span class="qc-check-card-inner">';
                        html += '<span class="qc-check-indicator"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
                        html += '<span class="qc-check-label">' + esc(o.label) + '</span>';
                        if (o.price) html += '<span class="qc-check-price">+' + fmtPrice(o.price) + '</span>';
                        html += '</span></label>';
                    }
                    html += '</div>';
                    break;

                case 'toggle':
                    html += '<div class="qc-toggle-wrap">';
                    html += '<label class="qc-toggle-row">';
                    html += '<span class="qc-toggle-text">';
                    if (field.price) html += '<span class="qc-toggle-price">+' + fmtPrice(field.price) + '</span>';
                    html += '</span>';
                    html += '<span class="qc-toggle-switch">';
                    html += '<input type="checkbox" class="qc-toggle-input" data-price="' + (field.price || 0) + '" data-field-idx="' + idx + '" aria-label="' + esc(field.label) + '">';
                    html += '<span class="qc-toggle-track"><span class="qc-toggle-thumb"></span></span>';
                    html += '</span></label></div>';
                    break;
            }

            html += '</div>';
            return html;
        }

        // ---- Build all field HTML ----
        var fieldsHTML = '';
        for (var f = 0; f < fields.length; f++) {
            fieldsHTML += renderField(fields[f], f);
        }

        // ---- Lead capture form ----
        var leadHTML = '';
        if (cfg.showLeadCapture) {
            leadHTML =
                '<div class="qc-lead" id="qc-lead">' +
                    '<div class="qc-lead-header">' +
                        '<h3 class="qc-lead-title">Get your personalised quote</h3>' +
                        '<p class="qc-lead-desc">Leave your details and we\'ll confirm your estimate.</p>' +
                    '</div>' +
                    '<div class="qc-lead-fields">' +
                        '<input type="text" id="qc-name" class="qc-input" placeholder="Your name *" required aria-label="Your name">' +
                        '<input type="tel" id="qc-phone" class="qc-input" placeholder="Phone number *" required aria-label="Phone number">' +
                        '<input type="email" id="qc-email" class="qc-input" placeholder="Email (optional)" aria-label="Email">' +
                        '<textarea id="qc-notes" class="qc-input qc-textarea" placeholder="Any details about the job? (optional)" rows="3" aria-label="Notes"></textarea>' +
                    '</div>' +
                    '<input type="text" name="website" style="display:none;" tabindex="-1" autocomplete="off">' +
                    '<button type="button" class="qc-submit-btn" id="qc-submit-btn">Request Quote</button>' +
                    '<div id="qc-status" class="qc-status" role="alert"></div>' +
                '</div>';
        }

        var disclaimer = cfg.disclaimer ? '<p class="qc-disclaimer">' + esc(cfg.disclaimer) + '</p>' : '';

        // ---- Assemble section ----
        var section = document.createElement('section');
        section.id = 'quote';
        section.className = 'plugin-quote-calc';
        section.innerHTML =
            '<div class="section-header centered">' +
                '<span class="section-number" aria-hidden="true">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/><line x1="15" y1="14" x2="15" y2="18"/><line x1="13" y1="16" x2="17" y2="16"/></svg>' +
                '</span>' +
                '<div class="section-title-group">' +
                    '<span class="section-label">Pricing</span>' +
                    '<h2>' + esc(cfg.title || 'Get an Instant Estimate') + '</h2>' +
                '</div>' +
            '</div>' +
            (cfg.subtitle ? '<p class="qc-subtitle">' + esc(cfg.subtitle) + '</p>' : '') +
            '<div class="qc-body">' +
                '<div class="qc-fields">' + fieldsHTML + '</div>' +
                '<div class="qc-sidebar">' +
                    '<div class="qc-total-bar" id="qc-total-bar">' +
                        '<div class="qc-total-top">' +
                            '<span class="qc-total-label">Estimated Total</span>' +
                            '<span class="qc-total-value" id="qc-total">' + sym + '0</span>' +
                        '</div>' +
                        '<div class="qc-breakdown" id="qc-breakdown"></div>' +
                    '</div>' +
                    disclaimer +
                    leadHTML +
                '</div>' +
            '</div>';

        insertBefore.parentNode.insertBefore(section, insertBefore);

        // ---- Add nav link ----
        var navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            var contactLink = navLinks.querySelector('a[href="#contact"]');
            if (contactLink) {
                var quoteLink = document.createElement('a');
                quoteLink.href = '#quote';
                quoteLink.textContent = 'Get Quote';
                navLinks.insertBefore(quoteLink, contactLink);
            }
        }

        // ---- Recalculation engine ----
        var totalEl = document.getElementById('qc-total');
        var breakdownEl = document.getElementById('qc-breakdown');
        var leadEl = document.getElementById('qc-lead');
        var prevTotal = 0;

        function recalc() {
            var total = 0;
            var lines = [];

            for (var f = 0; f < fields.length; f++) {
                var field = fields[f];
                var node = section.querySelector('[data-field-id="' + field.id + '"]');
                if (!node) continue;

                switch (field.type) {
                    case 'dropdown':
                        var sel = node.querySelector('.qc-select');
                        if (sel && sel.value) {
                            var opt = sel.options[sel.selectedIndex];
                            var p = parseFloat(opt.getAttribute('data-price')) || 0;
                            if (p > 0) {
                                total += p;
                                lines.push({ label: opt.textContent.split(' (')[0], price: p });
                            }
                        }
                        break;

                    case 'radio':
                        var checked = node.querySelector('input[type="radio"]:checked');
                        if (checked) {
                            var p = parseFloat(checked.getAttribute('data-price')) || 0;
                            if (p > 0) {
                                total += p;
                                var lbl = checked.closest('.qc-radio-pill').querySelector('.qc-radio-pill-label');
                                lines.push({ label: lbl ? lbl.textContent : field.label, price: p });
                            }
                        }
                        break;

                    case 'slider':
                        var slider = node.querySelector('.qc-slider');
                        if (slider && field.pricePerUnit) {
                            var val = parseFloat(slider.value) || 0;
                            var p = val * field.pricePerUnit;
                            total += p;
                            if (p > 0) lines.push({ label: val + ' ' + (field.unit || ''), price: p });
                        }
                        break;

                    case 'checkboxes':
                        var checks = node.querySelectorAll('.qc-check-input:checked');
                        for (var c = 0; c < checks.length; c++) {
                            var p = parseFloat(checks[c].getAttribute('data-price')) || 0;
                            total += p;
                            var lbl = checks[c].closest('.qc-check-card').querySelector('.qc-check-label');
                            if (p > 0) lines.push({ label: lbl ? lbl.textContent : 'Item', price: p });
                        }
                        break;

                    case 'toggle':
                        var tog = node.querySelector('.qc-toggle-input');
                        if (tog && tog.checked) {
                            var p = parseFloat(tog.getAttribute('data-price')) || 0;
                            total += p;
                            if (p > 0) lines.push({ label: field.label, price: p });
                        }
                        break;
                }
            }

            // Animate total on change
            totalEl.textContent = fmtPrice(total);
            if (total !== prevTotal) {
                totalEl.classList.remove('qc-pulse');
                void totalEl.offsetWidth; // force reflow for re-trigger
                totalEl.classList.add('qc-pulse');
            }
            prevTotal = total;

            // Render breakdown
            if (breakdownEl) {
                if (lines.length > 0) {
                    var bhtml = '';
                    for (var l = 0; l < lines.length; l++) {
                        bhtml += '<div class="qc-breakdown-line"><span>' + esc(lines[l].label) + '</span><span>' + fmtPrice(lines[l].price) + '</span></div>';
                    }
                    breakdownEl.innerHTML = bhtml;
                    breakdownEl.style.display = 'block';
                } else {
                    breakdownEl.innerHTML = '';
                    breakdownEl.style.display = 'none';
                }
            }

            // Show/hide lead capture
            if (leadEl) {
                leadEl.style.display = total > 0 ? 'block' : 'none';
            }
        }

        // ---- Event delegation: change ----
        section.addEventListener('change', function(e) {
            var t = e.target;

            // Radio pills: update active class
            if (t.type === 'radio' && t.closest('.qc-radio-group')) {
                var pills = t.closest('.qc-radio-group').querySelectorAll('.qc-radio-pill');
                for (var i = 0; i < pills.length; i++) pills[i].classList.remove('qc-radio-pill--active');
                t.closest('.qc-radio-pill').classList.add('qc-radio-pill--active');
            }

            // Checkbox cards: toggle active class
            if (t.classList.contains('qc-check-input')) {
                t.closest('.qc-check-card').classList.toggle('qc-check-card--active', t.checked);
            }

            // Toggle switch: toggle active class
            if (t.classList.contains('qc-toggle-input')) {
                t.closest('.qc-toggle-row').classList.toggle('qc-toggle-row--active', t.checked);
            }

            recalc();
        });

        // ---- Slider: live update on input ----
        section.addEventListener('input', function(e) {
            if (!e.target.classList.contains('qc-slider')) return;
            var slider = e.target;
            var idx = parseInt(slider.getAttribute('data-field-idx'), 10);
            var field = fields[idx];
            var val = parseFloat(slider.value) || 0;
            var wrap = slider.closest('.qc-slider-wrap');

            // Update value display
            var numEl = wrap.querySelector('.qc-slider-num');
            if (numEl) numEl.textContent = val;

            // Update subtotal calculation display
            if (field.pricePerUnit) {
                var calcEl = wrap.querySelector('.qc-slider-calc');
                if (calcEl) calcEl.innerHTML = val + ' &times; ' + fmtPrice(field.pricePerUnit) + ' = <strong>' + fmtPrice(val * field.pricePerUnit) + '</strong>';
            }

            // Update track fill via CSS custom property
            var pct = ((val - (field.min || 0)) / ((field.max || 100) - (field.min || 0))) * 100;
            slider.style.setProperty('--qc-slider-pct', pct + '%');

            recalc();
        });

        // Set initial slider fill percentages
        var sliders = section.querySelectorAll('.qc-slider');
        for (var s = 0; s < sliders.length; s++) {
            var sl = sliders[s];
            var mn = parseFloat(sl.min) || 0;
            var mx = parseFloat(sl.max) || 100;
            var vl = parseFloat(sl.value) || 0;
            sl.style.setProperty('--qc-slider-pct', (((vl - mn) / (mx - mn)) * 100) + '%');
        }

        // ---- Submit lead capture ----
        var submitBtn = document.getElementById('qc-submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                var honeypot = section.querySelector('input[name="website"]');
                if (honeypot && honeypot.value) return;

                var name = document.getElementById('qc-name').value.trim();
                var phone = document.getElementById('qc-phone').value.trim();
                var email = document.getElementById('qc-email').value.trim();
                var notes = document.getElementById('qc-notes').value.trim();
                var statusEl = document.getElementById('qc-status');

                if (!name || !phone) {
                    statusEl.textContent = 'Please enter your name and phone number.';
                    statusEl.className = 'qc-status qc-status--error';
                    return;
                }

                // Build summary message from all field selections
                var summary = [];
                for (var f = 0; f < fields.length; f++) {
                    var field = fields[f];
                    var node = section.querySelector('[data-field-id="' + field.id + '"]');
                    if (!node) continue;

                    switch (field.type) {
                        case 'dropdown':
                            var sel = node.querySelector('.qc-select');
                            if (sel && sel.value) {
                                var opt = sel.options[sel.selectedIndex];
                                var p = parseFloat(opt.getAttribute('data-price')) || 0;
                                summary.push(field.label + ': ' + opt.textContent.split(' (')[0] + (p ? ' (' + fmtPrice(p) + ')' : ''));
                            }
                            break;
                        case 'radio':
                            var checked = node.querySelector('input[type="radio"]:checked');
                            if (checked) {
                                var lbl = checked.closest('.qc-radio-pill').querySelector('.qc-radio-pill-label');
                                var p = parseFloat(checked.getAttribute('data-price')) || 0;
                                summary.push(field.label + ': ' + (lbl ? lbl.textContent : checked.value) + (p ? ' (' + fmtPrice(p) + ')' : ''));
                            }
                            break;
                        case 'slider':
                            var slider = node.querySelector('.qc-slider');
                            if (slider) {
                                var val = parseFloat(slider.value) || 0;
                                summary.push(field.label + ': ' + val + ' ' + (field.unit || '') + (field.pricePerUnit ? ' (' + fmtPrice(val * field.pricePerUnit) + ')' : ''));
                            }
                            break;
                        case 'checkboxes':
                            var checks = node.querySelectorAll('.qc-check-input:checked');
                            for (var c = 0; c < checks.length; c++) {
                                var lbl = checks[c].closest('.qc-check-card').querySelector('.qc-check-label');
                                var p = parseFloat(checks[c].getAttribute('data-price')) || 0;
                                summary.push((lbl ? lbl.textContent : 'Item') + (p ? ' (' + fmtPrice(p) + ')' : ''));
                            }
                            break;
                        case 'toggle':
                            var tog = node.querySelector('.qc-toggle-input');
                            if (tog && tog.checked) {
                                summary.push(field.label + ' (' + fmtPrice(field.price || 0) + ')');
                            }
                            break;
                    }
                }

                var message = 'QUOTE REQUEST\n\nSelections:\n- ' + summary.join('\n- ') +
                    '\n\nEstimate: ' + totalEl.textContent +
                    (notes ? '\n\nNotes: ' + notes : '');

                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';
                statusEl.textContent = '';
                statusEl.className = 'qc-status';

                // Reuse contact-form Edge Function
                fetch(CONFIG.SUPABASE_URL + '/functions/v1/contact-form', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
                    body: JSON.stringify({ site_key: SITE_KEY, name: name, email: email, phone: phone, message: message })
                })
                .then(function(res) {
                    if (!res.ok) throw new Error('Server error');
                    return res.json();
                })
                .then(function() {
                    statusEl.textContent = 'Quote request sent! We\'ll get back to you shortly.';
                    statusEl.className = 'qc-status qc-status--success';
                    document.getElementById('qc-name').value = '';
                    document.getElementById('qc-phone').value = '';
                    document.getElementById('qc-email').value = '';
                    document.getElementById('qc-notes').value = '';
                })
                .catch(function() {
                    statusEl.textContent = 'Something went wrong. Please call us directly.';
                    statusEl.className = 'qc-status qc-status--error';
                })
                .finally(function() {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Request Quote';
                });
            });
        }

        // Run initial calculation (radio defaults may produce a total)
        recalc();

        // ---- Inject styles ----
        if (!document.getElementById('plugin-quote-css')) {
            var style = document.createElement('style');
            style.id = 'plugin-quote-css';
            style.textContent = [
                /* Layout */
                '.plugin-quote-calc{padding:5rem 2rem;max-width:960px;margin:0 auto;}',
                '.plugin-quote-calc .section-number{display:flex;align-items:center;justify-content:center;}',
                '.plugin-quote-calc .section-number svg{width:24px;height:24px;}',
                '.qc-subtitle{text-align:center;color:var(--color-text-muted,#6B7280);font-size:1.05rem;margin-bottom:2.5rem;max-width:540px;margin-left:auto;margin-right:auto;}',
                '.qc-body{display:grid;grid-template-columns:1fr 340px;gap:2rem;align-items:start;}',

                /* Field cards */
                '.qc-fields{display:flex;flex-direction:column;gap:1.25rem;}',
                '.qc-field{background:var(--color-bg-alt,#F8F9FA);border:1px solid var(--color-border,#E5E7EB);border-radius:14px;padding:1.5rem;transition:border-color 0.25s ease;}',
                '.qc-field:hover{border-color:color-mix(in srgb, var(--color-accent,#14B8A6) 40%, var(--color-border,#E5E7EB));}',
                '.qc-field-header{margin-bottom:1rem;}',
                '.qc-field-label{font-weight:600;font-size:1rem;color:var(--color-dark,#1A1A2E);display:block;margin-bottom:2px;}',
                '.qc-field-desc{font-size:0.84rem;color:var(--color-text-muted,#6B7280);margin:4px 0 0;line-height:1.4;}',

                /* Dropdown */
                '.qc-select-wrap{position:relative;}',
                '.qc-select{width:100%;padding:11px 40px 11px 14px;font-size:0.92rem;font-family:inherit;border:1.5px solid var(--color-border,#D1D5DB);border-radius:10px;background:var(--color-bg,#fff);color:var(--color-dark,#1A1A2E);appearance:none;-webkit-appearance:none;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;}',
                '.qc-select:focus{outline:none;border-color:var(--color-accent,#14B8A6);box-shadow:0 0 0 3px rgba(20,184,166,0.12);}',
                '.qc-select-arrow{position:absolute;right:14px;top:50%;transform:translateY(-50%);pointer-events:none;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--color-text-muted,#9CA3AF);}',

                /* Radio pills */
                '.qc-radio-group{display:flex;flex-wrap:wrap;gap:0.6rem;}',
                '.qc-radio-pill{cursor:pointer;flex:1 1 auto;min-width:0;}',
                '.qc-radio-pill input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}',
                '.qc-radio-pill-inner{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 18px;border:1.5px solid var(--color-border,#D1D5DB);border-radius:10px;background:var(--color-bg,#fff);text-align:center;transition:all 0.2s ease;user-select:none;}',
                '.qc-radio-pill:hover .qc-radio-pill-inner{border-color:var(--color-accent,#14B8A6);background:rgba(20,184,166,0.03);}',
                '.qc-radio-pill--active .qc-radio-pill-inner{border-color:var(--color-accent,#14B8A6);background:rgba(20,184,166,0.06);box-shadow:0 0 0 3px rgba(20,184,166,0.1);}',
                '.qc-radio-pill-label{font-weight:600;font-size:0.9rem;color:var(--color-dark,#1A1A2E);white-space:nowrap;}',
                '.qc-radio-pill-price{font-size:0.78rem;color:var(--color-text-muted,#6B7280);font-weight:500;}',
                '.qc-radio-pill input:focus-visible~.qc-radio-pill-inner{box-shadow:0 0 0 3px rgba(20,184,166,0.35);}',

                /* Slider */
                '.qc-slider-wrap{padding:4px 0;}',
                '.qc-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--color-accent,#14B8A6) var(--qc-slider-pct,50%),var(--color-border,#E5E7EB) var(--qc-slider-pct,50%));}',
                '.qc-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:50%;background:var(--color-accent,#14B8A6);border:3px solid var(--color-bg,#fff);box-shadow:0 1px 4px rgba(0,0,0,0.2);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;}',
                '.qc-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--color-accent,#14B8A6);border:3px solid var(--color-bg,#fff);box-shadow:0 1px 4px rgba(0,0,0,0.2);cursor:pointer;}',
                '.qc-slider::-moz-range-track{height:6px;border-radius:3px;background:var(--color-border,#E5E7EB);}',
                '.qc-slider:hover::-webkit-slider-thumb{transform:scale(1.15);box-shadow:0 2px 8px rgba(20,184,166,0.35);}',
                '.qc-slider:focus-visible{box-shadow:0 0 0 3px rgba(20,184,166,0.25);border-radius:3px;}',
                '.qc-slider-info{display:flex;align-items:baseline;justify-content:space-between;margin-top:10px;gap:0.75rem;flex-wrap:wrap;}',
                '.qc-slider-val{font-size:0.92rem;color:var(--color-dark,#1A1A2E);}',
                '.qc-slider-num{font-weight:700;font-size:1.1rem;}',
                '.qc-slider-calc{font-size:0.84rem;color:var(--color-text-muted,#6B7280);}',
                '.qc-slider-calc strong{color:var(--color-dark,#1A1A2E);}',

                /* Checkbox cards */
                '.qc-checks-group{display:flex;flex-wrap:wrap;gap:0.6rem;}',
                '.qc-check-card{cursor:pointer;flex:1 1 auto;min-width:140px;}',
                '.qc-check-input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}',
                '.qc-check-card-inner{display:flex;align-items:center;gap:10px;padding:12px 16px;border:1.5px solid var(--color-border,#D1D5DB);border-radius:10px;background:var(--color-bg,#fff);transition:all 0.2s ease;user-select:none;}',
                '.qc-check-card:hover .qc-check-card-inner{border-color:var(--color-accent,#14B8A6);background:rgba(20,184,166,0.03);}',
                '.qc-check-card--active .qc-check-card-inner{border-color:var(--color-accent,#14B8A6);background:rgba(20,184,166,0.06);box-shadow:0 0 0 3px rgba(20,184,166,0.1);}',
                '.qc-check-indicator{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:2px solid var(--color-border,#D1D5DB);display:flex;align-items:center;justify-content:center;transition:all 0.2s;color:transparent;background:var(--color-bg,#fff);}',
                '.qc-check-card--active .qc-check-indicator{background:var(--color-accent,#14B8A6);border-color:var(--color-accent,#14B8A6);color:#fff;}',
                '.qc-check-input:focus-visible~.qc-check-card-inner{box-shadow:0 0 0 3px rgba(20,184,166,0.35);}',
                '.qc-check-label{font-weight:600;font-size:0.9rem;color:var(--color-dark,#1A1A2E);flex:1;}',
                '.qc-check-price{font-size:0.82rem;color:var(--color-text-muted,#6B7280);font-weight:500;white-space:nowrap;}',

                /* Toggle switch */
                '.qc-toggle-wrap{padding:2px 0;}',
                '.qc-toggle-row{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;gap:1rem;}',
                '.qc-toggle-text{display:flex;align-items:center;gap:0.5rem;}',
                '.qc-toggle-price{font-size:0.88rem;color:var(--color-text-muted,#6B7280);font-weight:500;transition:color 0.2s;}',
                '.qc-toggle-switch{position:relative;flex-shrink:0;}',
                '.qc-toggle-input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}',
                '.qc-toggle-track{display:block;width:48px;height:26px;background:var(--color-border,#D1D5DB);border-radius:13px;position:relative;transition:background 0.25s ease;}',
                '.qc-toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);}',
                '.qc-toggle-input:checked~.qc-toggle-track{background:var(--color-accent,#14B8A6);}',
                '.qc-toggle-input:checked~.qc-toggle-track .qc-toggle-thumb{transform:translateX(22px);}',
                '.qc-toggle-input:focus-visible~.qc-toggle-track{box-shadow:0 0 0 3px rgba(20,184,166,0.3);}',
                '.qc-toggle-row--active .qc-toggle-price{color:var(--color-accent,#14B8A6);}',

                /* Sidebar / Total bar */
                '.qc-sidebar{position:sticky;top:2rem;}',
                '.qc-total-bar{background:var(--color-dark,#1A1A2E);color:#fff;border-radius:14px;padding:1.5rem;overflow:hidden;}',
                '.qc-total-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;}',
                '.qc-total-label{font-size:0.92rem;font-weight:500;opacity:0.75;}',
                '.qc-total-value{font-size:2rem;font-weight:800;letter-spacing:-0.03em;transition:transform 0.2s;}',

                /* Pulse animation on total change */
                '@keyframes qcPulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}',
                '.qc-pulse{animation:qcPulse 0.3s ease;}',

                /* Breakdown list */
                '.qc-breakdown{display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.12);}',
                '.qc-breakdown-line{display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;padding:3px 0;opacity:0.8;}',
                '.qc-breakdown-line span:first-child{margin-right:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
                '.qc-breakdown-line span:last-child{white-space:nowrap;font-weight:600;}',

                /* Disclaimer */
                '.qc-disclaimer{font-size:0.78rem;color:var(--color-text-muted,#9CA3AF);text-align:center;padding:0.75rem 0;margin:0;font-style:italic;}',

                /* Lead capture */
                '.qc-lead{display:none;background:var(--color-bg-alt,#F8F9FA);border:1px solid var(--color-border,#E5E7EB);border-radius:14px;padding:1.5rem;margin-top:1rem;}',
                '.qc-lead-header{margin-bottom:1rem;}',
                '.qc-lead-title{font-size:1.05rem;font-weight:700;color:var(--color-dark,#1A1A2E);margin:0 0 4px;}',
                '.qc-lead-desc{font-size:0.84rem;color:var(--color-text-muted,#6B7280);margin:0;line-height:1.4;}',
                '.qc-lead-fields{display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;}',
                '.qc-input{width:100%;padding:10px 14px;font-size:0.9rem;font-family:inherit;border:1.5px solid var(--color-border,#D1D5DB);border-radius:10px;background:var(--color-bg,#fff);color:var(--color-dark,#1A1A2E);transition:border-color 0.2s,box-shadow 0.2s;box-sizing:border-box;}',
                '.qc-input:focus{outline:none;border-color:var(--color-accent,#14B8A6);box-shadow:0 0 0 3px rgba(20,184,166,0.12);}',
                '.qc-input::placeholder{color:var(--color-text-muted,#9CA3AF);}',
                '.qc-textarea{grid-column:1/-1;resize:vertical;min-height:56px;}',
                '.qc-submit-btn{width:100%;margin-top:0.75rem;padding:12px 20px;font-size:0.95rem;font-weight:600;font-family:inherit;border:none;border-radius:10px;background:var(--color-accent,#14B8A6);color:#fff;cursor:pointer;transition:background 0.2s,transform 0.15s;}',
                '.qc-submit-btn:hover{background:var(--color-accent-dark,#0d9488);transform:translateY(-1px);}',
                '.qc-submit-btn:active{transform:scale(0.98) translateY(0);}',
                '.qc-submit-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none;}',

                /* Status messages */
                '.qc-status{font-size:0.85rem;text-align:center;margin-top:0.6rem;min-height:1.2em;}',
                '.qc-status--error{color:var(--color-error,#DC2626);}',
                '.qc-status--success{color:var(--color-success,#16A34A);}',

                /* Responsive: tablet — stack to single column */
                '@media(max-width:820px){' +
                    '.qc-body{grid-template-columns:1fr;gap:1.5rem;}' +
                    '.qc-sidebar{position:static;}' +
                '}',

                /* Responsive: mobile — stack pills/cards vertically */
                '@media(max-width:640px){' +
                    '.plugin-quote-calc{padding:3rem 1rem;}' +
                    '.qc-field{padding:1.15rem;}' +
                    '.qc-radio-group{flex-direction:column;}' +
                    '.qc-radio-pill{min-width:0;}' +
                    '.qc-checks-group{flex-direction:column;}' +
                    '.qc-check-card{min-width:0;}' +
                    '.qc-lead-fields{grid-template-columns:1fr;}' +
                    '.qc-total-value{font-size:1.5rem;}' +
                    '.qc-total-bar{padding:1.25rem;}' +
                '}'
            ].join('\n');
            document.head.appendChild(style);
        }
    }

    // ------------------------------------------
    // Footer Legal Links (always-on, not gated)
    // ------------------------------------------
    function injectFooterLegalLinks() {
        // Only inject if site has legal pages configured
        if (!CONFIG.PAGES || CONFIG.PAGES.indexOf('terms') === -1) return;
        var footerBottom = document.querySelector('.footer-bottom');
        if (!footerBottom) return;

        var linksDiv = document.createElement('div');
        linksDiv.className = 'footer-legal-links';

        var termsLink = document.createElement('a');
        termsLink.href = 'terms.html';
        termsLink.textContent = 'Terms & Conditions';

        var sep = document.createElement('span');
        sep.className = 'footer-legal-sep';
        sep.textContent = '|';

        var privacyLink = document.createElement('a');
        privacyLink.href = 'privacy.html';
        privacyLink.textContent = 'Privacy Policy';

        linksDiv.appendChild(termsLink);
        linksDiv.appendChild(sep);
        linksDiv.appendChild(privacyLink);

        var copyright = footerBottom.querySelector('p');
        if (copyright) {
            footerBottom.insertBefore(linksDiv, copyright);
        } else {
            footerBottom.appendChild(linksDiv);
        }
    }

    // ------------------------------------------
    // Initialize all plugins
    // ------------------------------------------
    injectStyles();
    injectFooterLegalLinks();
    var contactWrap = initContactButton();
    initCookieConsent(contactWrap);
    initContactForm();
    initEcommerceVisibility();
    initQuizVisibility();
    initNewsletter();

    // Schema + Reviews run after content is loaded (script.js dispatches siteContentLoaded)
    function runContentPlugins() { initSchemaPlugin(); initFaqSchema(); initServiceSchema(); initBreadcrumbSchema(); initReviewsPlugin(); initQuoteCalculator(); }
    if (window._siteContentLoaded) {
        runContentPlugins();
    } else {
        window.addEventListener('siteContentLoaded', runContentPlugins);
        // Fallback: if script.js is old version without event, run after timeout
        setTimeout(function() {
            if (!window._siteContentLoaded) runContentPlugins();
        }, 2000);
    }

})();
