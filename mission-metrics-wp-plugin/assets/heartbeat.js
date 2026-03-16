(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.mmHeartbeat) return;

  var CFG = window.mmHeartbeat;
  var sent = false;

  function sendHeartbeat() {
    if (sent) return;
    sent = true;

    var body = JSON.stringify({
      domain: CFG.domain,
      source: 'js',
      plugin_version: CFG.pluginVersion || null,
      meta: { user_agent: navigator.userAgent }
    });

    fetch(CFG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actvtrkr-key': CFG.apiKey,
      },
      body: body,
      keepalive: true,
    }).catch(function () {
      try {
        navigator.sendBeacon(CFG.endpoint, new Blob([body], { type: 'application/json' }));
      } catch (e) { /* silent */ }
    });
  }

  // Send once per page load, debounced
  setTimeout(sendHeartbeat, 2000);
})();
