/**
 * ACTV TRKR — heartbeat ping.
 *
 * SAFETY CONTRACT:
 *   - Fires once, 2s after page load.
 *   - sendBeacon-first; fetch+keepalive fallback. Never sync XHR.
 *   - Wrapped in outer try/catch so a failure cannot break the host page.
 *   - Never throws, never blocks, never mutates the DOM.
 */
(function () {
  'use strict';
  try {
    if (typeof window === 'undefined' || !window.mmHeartbeat) return;

    var CFG = window.mmHeartbeat;
    var sent = false;

    function sendSignal() {
      if (sent) return;
      sent = true;

      try {
        var body = JSON.stringify({
          domain: CFG.domain,
          source: 'js',
          plugin_version: CFG.pluginVersion || null,
          api_key: CFG.apiKey,
          meta: { user_agent: navigator.userAgent }
        });

        // Beacon first — credential travels in the body so headers aren't required.
        try {
          if (navigator && typeof navigator.sendBeacon === 'function') {
            var ok = navigator.sendBeacon(CFG.endpoint, new Blob([body], { type: 'application/json' }));
            if (ok) return;
          }
        } catch (e) { /* fall through */ }

        // Fallback: fetch with keepalive.
        if (typeof fetch === 'function') {
          fetch(CFG.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-actvtrkr-key': CFG.apiKey,
            },
            body: body,
            keepalive: true,
          }).catch(function () { /* silent */ });
        }
      } catch (e) { /* never throw to host */ }
    }

    // Single, debounced send.
    setTimeout(function () {
      try { sendSignal(); } catch (e) { /* silent */ }
    }, 2000);
  } catch (outerErr) { /* host page unaffected */ }
})();
