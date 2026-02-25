(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.mmConfig) return;

  var CFG = window.mmConfig;
  var COOKIE_VID = 'mm_vid';
  var COOKIE_SID = 'mm_sid';
  var COOKIE_UTM = 'mm_utm';
  var COOKIE_TS  = 'mm_ts';
  var SESSION_TIMEOUT = 30 * 60 * 1000;

  // ── Cookie helpers ──────────────────────────────────────────────

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() +
      ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var v = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
    return v ? decodeURIComponent(v[2]) : null;
  }

  // ── UUID v4 ─────────────────────────────────────────────────────

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── UTM extraction ──────────────────────────────────────────────

  function getUtms() {
    var params = new URLSearchParams(window.location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    var out = {};
    var found = false;
    keys.forEach(function (k) {
      var v = params.get(k);
      if (v) { out[k] = v; found = true; }
    });
    return found ? out : null;
  }

  function storedUtms() {
    var raw = getCookie(COOKIE_UTM);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  // ── Session logic ───────────────────────────────────────────────

  function utmsChanged(newUtms) {
    if (!newUtms) return false;
    var old = storedUtms();
    return ['utm_source', 'utm_medium', 'utm_campaign'].some(function (k) {
      return (newUtms[k] || '') !== (old[k] || '');
    });
  }

  function resolveSession(urlUtms) {
    var sid = getCookie(COOKIE_SID);
    var lastTs = parseInt(getCookie(COOKIE_TS) || '0', 10);
    var now = Date.now();
    var expired = !sid || !lastTs || (now - lastTs > SESSION_TIMEOUT);
    var utmSwitch = urlUtms && utmsChanged(urlUtms);

    if (expired || utmSwitch) {
      sid = uuid();
    }

    setCookie(COOKIE_SID, sid, 1);
    setCookie(COOKIE_TS, String(now), 1);
    return sid;
  }

  // ── Device hint ─────────────────────────────────────────────────

  function deviceType() {
    var w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  // ── Send ────────────────────────────────────────────────────────

  function send(endpoint, payload) {
    var body = JSON.stringify(payload);
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CFG.apiKey,
      },
      body: body,
      keepalive: true,
    }).catch(function () {
      try {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      } catch (e) { /* silent */ }
    });
  }

  // ── Pageview tracking ──────────────────────────────────────────

  function track() {
    var vid = getCookie(COOKIE_VID);
    if (!vid) {
      vid = uuid();
      setCookie(COOKIE_VID, vid, 365);
    }

    var urlUtms = getUtms();
    if (urlUtms) {
      setCookie(COOKIE_UTM, JSON.stringify(urlUtms), 30);
    }

    var sid = resolveSession(urlUtms);
    var attribution = Object.assign({}, storedUtms(), urlUtms || {});
    var eventId = uuid();

    send(CFG.endpoint, {
      source: {
        domain: CFG.domain,
        type: 'wordpress',
        plugin_version: CFG.pluginVersion,
      },
      event: {
        event_id: eventId,
        session_id: sid,
        page_url: window.location.href,
        page_path: window.location.pathname,
        title: document.title,
        referrer: document.referrer || null,
        device: deviceType(),
        occurred_at: new Date().toISOString(),
      },
      attribution: attribution,
      visitor: {
        visitor_id: vid,
      },
    });
  }

  // ── Universal Form Capture (Layer 1) ───────────────────────────

  // Fields to skip (security/privacy + WordPress internals)
  var SKIP_NAMES = [
    '_wpnonce', '_wp_http_referer', '_wpcf7', '_wpcf7_version',
    '_wpcf7_locale', '_wpcf7_unit_tag', '_wpcf7_container_post',
    'action', 'gform_ajax', 'gform_field_values',
    'is_submit', 'gform_submit', 'gform_unique_id',
    'gform_target_page_number', 'gform_source_page_number',
  ];

  var SKIP_PATTERNS = [
    /^_/, /nonce/i, /token/i, /csrf/i, /captcha/i,
    /^g-recaptcha/, /^h-captcha/, /^cf-turnstile/,
  ];

  var SENSITIVE_PATTERNS = [
    /password/i, /passwd/i, /cc[-_]?num/i, /card[-_]?number/i,
    /cvv/i, /cvc/i, /ssn/i, /social[-_]?security/i,
    /credit[-_]?card/i,
  ];

  function shouldSkipField(name, type) {
    if (!name) return true;
    if (type === 'password' || type === 'hidden') return true;
    if (SKIP_NAMES.indexOf(name) !== -1) return true;
    for (var i = 0; i < SKIP_PATTERNS.length; i++) {
      if (SKIP_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  function isSensitive(name) {
    for (var i = 0; i < SENSITIVE_PATTERNS.length; i++) {
      if (SENSITIVE_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  function captureFormFields(formEl) {
    var fields = [];
    var elements = formEl.elements;
    var seen = {};

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var name = el.name || el.id || '';
      var type = (el.type || 'text').toLowerCase();

      if (shouldSkipField(name, type)) continue;
      if (seen[name]) continue;

      var value = '';

      if (type === 'checkbox') {
        // Collect all checked values for this name
        var checked = formEl.querySelectorAll('input[name="' + name + '"]:checked');
        var vals = [];
        for (var j = 0; j < checked.length; j++) vals.push(checked[j].value);
        value = vals.join(', ');
      } else if (type === 'radio') {
        var selected = formEl.querySelector('input[name="' + name + '"]:checked');
        value = selected ? selected.value : '';
      } else if (el.tagName === 'SELECT') {
        var opts = el.selectedOptions || [];
        var selVals = [];
        for (var k = 0; k < opts.length; k++) selVals.push(opts[k].value);
        value = selVals.join(', ');
      } else {
        value = el.value || '';
      }

      seen[name] = true;

      if (isSensitive(name)) {
        value = '[REDACTED]';
      }

      if (value === '' && type !== 'checkbox') continue;

      fields.push({
        name: name,
        label: el.getAttribute('aria-label') || el.getAttribute('placeholder') || name,
        type: type,
        value: value,
      });
    }

    return fields;
  }

  function handleFormSubmit(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    // Allow opt-out
    if (form.getAttribute('data-mm-ignore') === 'true') return;

    // Skip search forms and login forms
    var role = form.getAttribute('role');
    if (role === 'search') return;
    var action = (form.getAttribute('action') || '').toLowerCase();
    if (action.indexOf('wp-login') !== -1 || action.indexOf('wp-admin') !== -1) return;

    var fields = captureFormFields(form);
    if (fields.length === 0) return;

    var vid = getCookie(COOKIE_VID);
    var sid = getCookie(COOKIE_SID);

    // Build the form endpoint
    var formEndpoint = CFG.endpoint.replace(/\/track-pageview$/, '/ingest-form');

    send(formEndpoint, {
      provider: 'js_capture',
      entry: {
        form_id: form.getAttribute('id') || form.getAttribute('data-form-id') || 'dom_form',
        form_title: form.getAttribute('data-form-title') || form.getAttribute('aria-label') || document.title,
        entry_id: 'js_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        source_url: window.location.href,
        page_url: window.location.href,
        submitted_at: new Date().toISOString(),
      },
      context: {
        domain: CFG.domain,
        referrer: document.referrer || null,
        visitor_id: vid,
        session_id: sid,
        utm: storedUtms(),
        plugin_version: CFG.pluginVersion,
      },
      fields: fields,
    });
  }

  // Attach universal form listener via event delegation
  document.addEventListener('submit', handleFormSubmit, true);

  // Also intercept fetch/XHR based form submissions (AJAX forms)
  // Listen for custom events that popular plugins fire
  document.addEventListener('wpcf7mailsent', function (e) {
    // CF7 fires this on success — the PHP hook handles it,
    // but if PHP hook fails, JS already captured via submit event
  });

  // ── Boot ───────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }
})();
