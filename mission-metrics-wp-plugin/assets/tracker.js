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
  var HEARTBEAT_INTERVAL = 10000; // 10 seconds
  var MAX_EVENTS_PER_SESSION = 200;

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

  function sendBeaconSafe(endpoint, payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + CFG.apiKey);
        xhr.send(body);
      }
    } catch (e) { /* silent */ }
  }

  // ── Time-on-Page Tracking ─────────────────────────────────────

  var pageTimer = {
    startedAt: null,
    activeMs: 0,
    lastResumeAt: null,
    isActive: true,
    eventId: null,
    heartbeatTimer: null,

    start: function (eventId) {
      this.eventId = eventId;
      this.startedAt = Date.now();
      this.lastResumeAt = Date.now();
      this.activeMs = 0;
      this.isActive = true;
      this.startHeartbeat();
    },

    pause: function () {
      if (this.isActive && this.lastResumeAt) {
        this.activeMs += Date.now() - this.lastResumeAt;
        this.isActive = false;
      }
    },

    resume: function () {
      if (!this.isActive) {
        this.lastResumeAt = Date.now();
        this.isActive = true;
      }
    },

    getActiveSeconds: function () {
      var total = this.activeMs;
      if (this.isActive && this.lastResumeAt) {
        total += Date.now() - this.lastResumeAt;
      }
      return Math.round(total / 1000);
    },

    startHeartbeat: function () {
      var self = this;
      this.heartbeatTimer = setInterval(function () {
        if (self.isActive) {
          self.sendTimeUpdate();
        }
      }, HEARTBEAT_INTERVAL);
    },

    sendTimeUpdate: function () {
      if (!this.eventId) return;
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);
      send(CFG.endpoint, {
        type: 'time_update',
        source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
        event: {
          event_id: this.eventId,
          session_id: sid,
          active_seconds: this.getActiveSeconds(),
        },
        visitor: { visitor_id: vid },
      });
    },

    sendFinal: function () {
      if (!this.eventId) return;
      clearInterval(this.heartbeatTimer);
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);
      sendBeaconSafe(CFG.endpoint, {
        type: 'time_update',
        source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
        event: {
          event_id: this.eventId,
          session_id: sid,
          active_seconds: this.getActiveSeconds(),
        },
        visitor: { visitor_id: vid },
      });
    },
  };

  // Visibility change handlers
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pageTimer.pause();
    } else {
      pageTimer.resume();
    }
  });

  window.addEventListener('beforeunload', function () {
    pageTimer.sendFinal();
    flushEventBatch();
  });

  // ── Intent-Based Click Tracking ───────────────────────────────

  var eventBatch = [];
  var sessionEventCount = 0;
  var batchTimer = null;

  var DOWNLOAD_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt|rtf|mp3|mp4|avi|mov|epub)$/i;

  function classifyClick(el) {
    if (!el) return null;

    // Walk up to find meaningful element
    var target = el;
    for (var i = 0; i < 5 && target; i++) {
      var tag = (target.tagName || '').toLowerCase();

      // Check for data-actv="cta" attribute
      if (target.getAttribute && target.getAttribute('data-actv') === 'cta') {
        return { type: 'cta_click', text: getClickText(target), el: target };
      }

      if (tag === 'a') {
        var href = target.getAttribute('href') || '';

        // tel: links
        if (href.indexOf('tel:') === 0) {
          return { type: 'tel_click', text: href.replace('tel:', ''), el: target };
        }

        // mailto: links
        if (href.indexOf('mailto:') === 0) {
          return { type: 'mailto_click', text: href.replace('mailto:', ''), el: target };
        }

        // Download links
        if (DOWNLOAD_EXTENSIONS.test(href)) {
          return { type: 'download_click', text: getClickText(target) || href.split('/').pop(), el: target };
        }

        // Outbound links
        try {
          var linkHost = new URL(href, window.location.origin).hostname;
          if (linkHost && linkHost !== window.location.hostname) {
            return { type: 'outbound_click', text: getClickText(target) || linkHost, el: target };
          }
        } catch (e) { /* invalid URL */ }
      }

      // Button elements (not inside forms — those are form_start)
      if (tag === 'button' || (target.getAttribute && target.getAttribute('role') === 'button')) {
        var inForm = target.closest && target.closest('form');
        var btnType = (target.getAttribute('type') || '').toLowerCase();
        if (!inForm || btnType !== 'submit') {
          return { type: 'cta_click', text: getClickText(target), el: target };
        }
      }

      target = target.parentElement;
    }

    return null;
  }

  function getClickText(el) {
    var text = (el.innerText || el.textContent || '').trim();
    if (text.length > 100) text = text.substring(0, 100);
    return text || el.getAttribute('aria-label') || el.getAttribute('title') || '';
  }

  function trackClick(e) {
    if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return;
    var result = classifyClick(e.target);
    if (!result) return;

    sessionEventCount++;
    var vid = getCookie(COOKIE_VID);
    var sid = getCookie(COOKIE_SID);

    eventBatch.push({
      event_type: result.type,
      target_text: result.text,
      page_url: window.location.href,
      page_path: window.location.pathname,
      timestamp: new Date().toISOString(),
      session_id: sid,
      visitor_id: vid,
    });

    // Start batch timer if not already running
    if (!batchTimer) {
      batchTimer = setTimeout(flushEventBatch, HEARTBEAT_INTERVAL);
    }
  }

  function flushEventBatch() {
    clearTimeout(batchTimer);
    batchTimer = null;
    if (eventBatch.length === 0) return;

    var events = eventBatch.splice(0);
    var eventEndpoint = CFG.endpoint.replace(/\/track-pageview$/, '/track-event');

    sendBeaconSafe(eventEndpoint, {
      source: {
        domain: CFG.domain,
        type: 'wordpress',
        plugin_version: CFG.pluginVersion,
      },
      events: events,
    });
  }

  // Form start tracking
  function trackFormFocus(e) {
    if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return;
    var el = e.target;
    if (!el || !el.closest) return;
    var form = el.closest('form');
    if (!form) return;
    if (form._mmFormStarted) return;
    form._mmFormStarted = true;

    sessionEventCount++;
    var vid = getCookie(COOKIE_VID);
    var sid = getCookie(COOKIE_SID);

    eventBatch.push({
      event_type: 'form_start',
      target_text: form.getAttribute('data-form-title') || form.getAttribute('aria-label') || form.getAttribute('id') || 'form',
      page_url: window.location.href,
      page_path: window.location.pathname,
      timestamp: new Date().toISOString(),
      session_id: sid,
      visitor_id: vid,
    });

    if (!batchTimer) {
      batchTimer = setTimeout(flushEventBatch, HEARTBEAT_INTERVAL);
    }
  }

  // Attach click and focus listeners
  document.addEventListener('click', trackClick, true);
  document.addEventListener('focusin', trackFormFocus, true);

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

    // Start time-on-page tracking
    pageTimer.start(eventId);

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

    if (form.getAttribute('data-mm-ignore') === 'true') return;

    var role = form.getAttribute('role');
    if (role === 'search') return;
    var action = (form.getAttribute('action') || '').toLowerCase();
    if (action.indexOf('wp-login') !== -1 || action.indexOf('wp-admin') !== -1) return;

    var fields = captureFormFields(form);
    if (fields.length === 0) return;

    var vid = getCookie(COOKIE_VID);
    var sid = getCookie(COOKIE_SID);

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

  document.addEventListener('submit', handleFormSubmit, true);

  document.addEventListener('wpcf7mailsent', function (e) {
    // PHP hook handles it; JS submit event is the fallback
  });

  document.addEventListener('fusion-form-submit-success', function (e) {
    try {
      var formEl = e.target && e.target.closest ? e.target.closest('form') : null;
      if (!formEl) {
        var wrapper = document.querySelector('.fusion-form-submit-success, .fusion-form-form');
        if (wrapper) formEl = wrapper.querySelector('form') || wrapper.closest('form');
      }
      if (formEl) handleFormSubmit({ target: formEl });
    } catch (err) { /* silent */ }
  });

  if (window.jQuery) {
    window.jQuery(document).on('ajaxComplete', function (event, xhr, settings) {
      if (!settings || !settings.url) return;
      if (settings.url.indexOf('fusion_form') === -1 && settings.url.indexOf('avada') === -1) return;
      try {
        var forms = document.querySelectorAll('.fusion-form form, form.fusion-form-form');
        for (var i = 0; i < forms.length; i++) {
          var fields = captureFormFields(forms[i]);
          if (fields.length > 0) {
            handleFormSubmit({ target: forms[i] });
            break;
          }
        }
      } catch (err) { /* silent */ }
    });
  }

  // ── Boot ───────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }
})();
