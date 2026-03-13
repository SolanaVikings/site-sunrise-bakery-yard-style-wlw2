// ============================================
// AI Crawler & Referral Tracking
// Detects AI crawlers and AI-referred visitors,
// sends a beacon to /api/ai-visit for analytics.
// No cookies, no localStorage, no external deps.
// ============================================

(function () {
    'use strict';

    // AI crawler user-agent signatures
    var AI_CRAWLERS = [
        'GPTBot',
        'ChatGPT-User',
        'ClaudeBot',
        'Claude-Web',
        'PerplexityBot',
        'Amazonbot',
        'Bytespider',
        'Meta-ExternalAgent',
        'Applebot',
        'Google-Extended',
        'Googlebot', // not strictly AI-only but often used by AI features
        'cohere-ai',
        'YouBot',
        'Baiduspider-render',
    ];

    // AI referral domains
    var AI_REFERRERS = [
        'chat.openai.com',
        'chatgpt.com',
        'claude.ai',
        'perplexity.ai',
        'copilot.microsoft.com',
        'gemini.google.com',
        'poe.com',
        'you.com',
        'bard.google.com',
        'meta.ai',
    ];

    var ua = navigator.userAgent || '';
    var referrer = document.referrer || '';

    // Check for AI crawler
    var crawlerMatch = null;
    for (var i = 0; i < AI_CRAWLERS.length; i++) {
        if (ua.indexOf(AI_CRAWLERS[i]) !== -1) {
            crawlerMatch = AI_CRAWLERS[i];
            break;
        }
    }

    // Check for AI referral
    var referralMatch = null;
    if (referrer) {
        try {
            var refHost = new URL(referrer).hostname;
            for (var j = 0; j < AI_REFERRERS.length; j++) {
                if (refHost === AI_REFERRERS[j] || refHost.endsWith('.' + AI_REFERRERS[j])) {
                    referralMatch = AI_REFERRERS[j];
                    break;
                }
            }
        } catch (e) {
            // Invalid referrer URL — ignore
        }
    }

    // Send beacon if any AI activity detected
    if (crawlerMatch || referralMatch) {
        var payload = {
            visit_type: crawlerMatch ? 'crawler' : 'referral',
            source: crawlerMatch || referralMatch,
            path: location.pathname || '/',
            user_agent: ua.substring(0, 500),
        };

        // Use sendBeacon for non-blocking delivery
        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                '/api/ai-visit',
                new Blob([JSON.stringify(payload)], { type: 'application/json' })
            );
        } else {
            // Fallback for older browsers
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/ai-visit', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(payload));
        }
    }
})();
