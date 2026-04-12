(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.mmConfig) return;

  var CFG = window.mmConfig;
  var COOKIE_VID = 'mm_vid';
  var COOKIE_SID = 'mm_sid';
  var COOKIE_UTM = 'mm_utm';
  var COOKIE_TS  = 'mm_ts';
  var CONSENT_KEY = 'mm_consent';
  var SESSION_TIMEOUT = 30 * 60 * 1000;
  var HEARTBEAT_INTERVAL = 20000; // 20 seconds
  var WATCHDOG_MULTIPLIER = 2;
  var MAX_EVENTS_PER_SESSION = 200;
  var MAX_QUEUE_SIZE = 500;
  var QUEUE_STORAGE_KEY = 'mm_event_queue';
  var FLUSH_INTERVAL = 10000; // 10 seconds batch flush
  var MAX_RETRY_DELAY = 300000; // 5 min cap
  var BASE_RETRY_DELAY = 2000;

  // ── Consent Mode ──────────────────────────────────────────────
  // CFG.consentMode: 'strict' | 'relaxed' (default: 'relaxed' for backward compat)
  var consentMode = (CFG.consentMode || 'relaxed').toLowerCase();
  var consentState = 'no_consent'; // no_consent | analytics_consent_granted | analytics_consent_denied
  var trackerInitialized = false;

  function getStoredConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function setStoredConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  function clearStoredConsent() {
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
  }

  function clearAnalyticsCookies() {
    var cookies = [COOKIE_VID, COOKIE_SID, COOKIE_UTM, COOKIE_TS];
    for (var i = 0; i < cookies.length; i++) {
      document.cookie = cookies[i] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
    }
  }

  function clearAnalyticsStorage() {
    clearAnalyticsCookies();
    try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch (e) {}
    clearStoredConsent();
  }

  // Public API for consent management (called by CMP like Complianz)
  window.mmConsent = {
    grant: function () {
      consentState = 'analytics_consent_granted';
      setStoredConsent('granted');
      if (!trackerInitialized) {
        bootTracker();
      }
    },
    deny: function () {
      consentState = 'analytics_consent_denied';
      setStoredConsent('denied');
      shutdownTracker();
    },
    revoke: function () {
      consentState = 'analytics_consent_denied';
      clearAnalyticsStorage();
      shutdownTracker();
    },
    getState: function () { return consentState; },
  };

  // Complianz integration: listen for cmplz consent events
  document.addEventListener('cmplz_fire_categories', function (e) {
    if (e.detail && e.detail.categories && e.detail.categories.indexOf('statistics') !== -1) {
      window.mmConsent.grant();
    } else {
      window.mmConsent.deny();
    }
  });

  // Generic CMP integration via custom event
  document.addEventListener('mm_consent_update', function (e) {
    if (e.detail && e.detail.analytics === true) {
      window.mmConsent.grant();
    } else {
      window.mmConsent.deny();
    }
  });

  function shutdownTracker() {
    if (pageTimer.heartbeatTimer) clearInterval(pageTimer.heartbeatTimer);
    if (pageTimer.watchdogTimer) clearInterval(pageTimer.watchdogTimer);
    eventQueue = [];
    trackerInitialized = false;
  }

  // ── Tracker State ──────────────────────────────────────────────
  var trackerState = 'active'; // active | degraded | retrying | offline | stalled
  var retryCount = 0;
  var lastSuccessfulSend = Date.now();
  var lastHeartbeatAttempt = 0;

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

  // ── Visitor identity (includes WP user if logged in) ──────────

  function buildVisitor(vid) {
    var v = { visitor_id: vid };
    if (CFG.wpUser) {
      v.wp_user_id = String(CFG.wpUser.id);
      v.wp_user_role = CFG.wpUser.role;
    }
    return v;
  }

  // ── Event Queue System ─────────────────────────────────────────

  var eventQueue = [];

  function loadQueue() {
    try {
      var stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          eventQueue = parsed;
        }
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  function saveQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(eventQueue));
    } catch (e) { /* quota exceeded or unavailable */ }
  }

  function clearSavedQueue() {
    try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch (e) {}
  }

  // Priority: page_view > click events > heartbeat
  function eventPriority(type) {
    if (type === 'page_view') return 3;
    if (type === 'form_submit') return 3;
    if (type === 'heartbeat' || type === 'time_update') return 0;
    return 1;
  }

  function trimQueue() {
    if (eventQueue.length <= MAX_QUEUE_SIZE) return;
    // Sort by priority ascending (lowest priority first), then oldest first
    eventQueue.sort(function (a, b) {
      var pa = eventPriority(a.event_type);
      var pb = eventPriority(b.event_type);
      if (pa !== pb) return pa - pb;
      return (new Date(a.timestamp)).getTime() - (new Date(b.timestamp)).getTime();
    });
    // Remove lowest priority (first items) until under limit
    eventQueue = eventQueue.slice(eventQueue.length - MAX_QUEUE_SIZE);
    saveQueue();
  }

  function enqueueEvent(evt) {
    evt.event_uuid = evt.event_uuid || uuid();
    evt.timestamp = evt.timestamp || new Date().toISOString();
    eventQueue.push(evt);
    trimQueue();
    saveQueue();
  }

  // ── Transport ──────────────────────────────────────────────────

  function getEventEndpoint() {
    return CFG.endpoint.replace(/\/track-pageview$/, '/track-event');
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    if (!navigator.onLine) {
      setTrackerState('offline');
      return;
    }

    // Split queue: pageview events go to track-pageview, rest to track-event
    var pageviewEvents = [];
    var otherEvents = [];
    for (var i = 0; i < eventQueue.length; i++) {
      if (eventQueue[i].event_type === 'page_view') {
        pageviewEvents.push(eventQueue[i]);
      } else {
        otherEvents.push(eventQueue[i]);
      }
    }

    // For now, send everything via track-event batch endpoint
    // (page_view events still use their original endpoint for compatibility)
    if (otherEvents.length > 0) {
      var batch = otherEvents.splice(0, 50); // max 50 per batch
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);

      var payload = {
        api_key: CFG.apiKey,
        source: {
          domain: CFG.domain,
          type: 'wordpress',
          plugin_version: CFG.pluginVersion,
        },
        events: batch.map(function (e) {
          return {
            event_type: e.event_type,
            event_uuid: e.event_uuid,
            target_text: e.target_text,
            page_url: e.page_url || window.location.href,
            page_path: e.page_path || window.location.pathname,
            timestamp: e.timestamp,
            session_id: e.session_id || sid,
            visitor_id: e.visitor_id || vid,
            target_label: e.target_label,
            target_href: e.target_href,
            meta: e.meta,
          };
        }),
      };

      sendWithRetry(getEventEndpoint(), payload, function onSuccess() {
        // Remove sent events from queue
        var sentUuids = {};
        for (var j = 0; j < batch.length; j++) {
          sentUuids[batch[j].event_uuid] = true;
        }
        eventQueue = eventQueue.filter(function (e) {
          return !sentUuids[e.event_uuid];
        });
        saveQueue();
        retryCount = 0;
        lastSuccessfulSend = Date.now();
        setTrackerState('active');
      }, function onFailure() {
        // Events stay in queue for next retry
        setTrackerState('retrying');
      });
    }
  }

  function sendWithRetry(endpoint, payload, onSuccess, onFailure) {
    var body = JSON.stringify(payload);
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CFG.apiKey,
      },
      body: body,
      keepalive: true,
    }).then(function (resp) {
      if (resp.ok || resp.status === 200) {
        if (onSuccess) onSuccess();
      } else {
        retryCount++;
        if (onFailure) onFailure();
        scheduleRetry();
      }
    }).catch(function () {
      retryCount++;
      if (onFailure) onFailure();
      scheduleRetry();
    });
  }

  var retryTimer = null;
  function scheduleRetry() {
    if (retryTimer) return;
    var delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount - 1), MAX_RETRY_DELAY);
    retryTimer = setTimeout(function () {
      retryTimer = null;
      flushQueue();
    }, delay);
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

  // Legacy send function for pageview endpoint (backward compat)
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
    }).then(function (resp) {
      if (resp.ok) {
        lastSuccessfulSend = Date.now();
        setTrackerState('active');
      }
    }).catch(function () {
      // Pageview sends are critical — try beacon as fallback
      try {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      } catch (e) { /* silent */ }
    });
  }

  // ── Tracker State Management ──────────────────────────────────

  function setTrackerState(newState) {
    if (trackerState === newState) return;
    trackerState = newState;
  }

  // ── Time-on-Page Tracking ─────────────────────────────────────

  var pageTimer = {
    startedAt: null,
    activeMs: 0,
    lastResumeAt: null,
    isActive: true,
    eventId: null,
    heartbeatTimer: null,
    watchdogTimer: null,

    start: function (eventId) {
      this.eventId = eventId;
      this.startedAt = Date.now();
      this.lastResumeAt = Date.now();
      this.activeMs = 0;
      this.isActive = true;
      this.startHeartbeat();
      this.startWatchdog();
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
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(function () {
        if (self.isActive) {
          self.sendTimeUpdate();
          lastHeartbeatAttempt = Date.now();
        }
      }, HEARTBEAT_INTERVAL);
    },

    // Watchdog: restart heartbeat if no attempt in 2x interval
    startWatchdog: function () {
      var self = this;
      if (this.watchdogTimer) clearInterval(this.watchdogTimer);
      lastHeartbeatAttempt = Date.now();
      this.watchdogTimer = setInterval(function () {
        var elapsed = Date.now() - lastHeartbeatAttempt;
        if (elapsed > HEARTBEAT_INTERVAL * WATCHDOG_MULTIPLIER) {
          // Heartbeat loop died — restart it
          self.startHeartbeat();
          setTrackerState('degraded');
          // Queue a session_gap_detected event
          enqueueEvent({
            event_type: 'session_gap_detected',
            page_url: window.location.href,
            page_path: window.location.pathname,
            meta: { gap_ms: elapsed, reason: 'watchdog_restart' },
          });
        }
      }, HEARTBEAT_INTERVAL * WATCHDOG_MULTIPLIER + 5000);
    },

    sendTimeUpdate: function () {
      if (!this.eventId) return;
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);
      send(CFG.endpoint, {
        type: 'time_update',
        api_key: CFG.apiKey,
        source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
        event: {
          event_id: this.eventId,
          session_id: sid,
          active_seconds: this.getActiveSeconds(),
        },
        visitor: buildVisitor(vid),
      });
    },

    sendFinal: function () {
      if (!this.eventId) return;
      clearInterval(this.heartbeatTimer);
      clearInterval(this.watchdogTimer);
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);
      sendBeaconSafe(CFG.endpoint, {
        type: 'time_update',
        api_key: CFG.apiKey,
        source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
        event: {
          event_id: this.eventId,
          session_id: sid,
          active_seconds: this.getActiveSeconds(),
        },
        visitor: buildVisitor(vid),
      });
    },
  };

  // ── Visibility & Focus Handlers ───────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pageTimer.pause();
      // Flush queue when tab goes hidden
      flushQueue();
    } else {
      pageTimer.resume();
      // Re-check session on return
      var sid = getCookie(COOKIE_SID);
      var lastTs = parseInt(getCookie(COOKIE_TS) || '0', 10);
      var now = Date.now();
      if (!sid || (now - lastTs > SESSION_TIMEOUT)) {
        // Session expired while hidden — queue session_resume
        enqueueEvent({
          event_type: 'session_resume',
          page_url: window.location.href,
          page_path: window.location.pathname,
          meta: { gap_ms: now - lastTs },
        });
        resolveSession(null);
      }
      setCookie(COOKIE_TS, String(now), 1);
      // Ensure heartbeat is running
      pageTimer.startHeartbeat();
      flushQueue();
    }
  });

  window.addEventListener('focus', function () {
    pageTimer.resume();
    // Restart heartbeat on focus return
    pageTimer.startHeartbeat();
    flushQueue();
  });

  window.addEventListener('blur', function () {
    pageTimer.pause();
  });

  window.addEventListener('beforeunload', function () {
    pageTimer.sendFinal();
    // Flush remaining events via beacon
    if (eventQueue.length > 0) {
      var vid = getCookie(COOKIE_VID);
      var sid = getCookie(COOKIE_SID);
      var batch = eventQueue.splice(0, 50);
      sendBeaconSafe(getEventEndpoint(), {
        api_key: CFG.apiKey,
        source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
        events: batch.map(function (e) {
          return {
            event_type: e.event_type,
            event_uuid: e.event_uuid,
            target_text: e.target_text,
            page_url: e.page_url || window.location.href,
            page_path: e.page_path || window.location.pathname,
            timestamp: e.timestamp,
            session_id: e.session_id || sid,
            visitor_id: e.visitor_id || vid,
            target_label: e.target_label,
            target_href: e.target_href,
            meta: e.meta,
          };
        }),
      });
      saveQueue(); // Save any remaining
    }
  });

  window.addEventListener('pagehide', function () {
    pageTimer.sendFinal();
  });

  // Online/offline handlers
  window.addEventListener('online', function () {
    setTrackerState('active');
    flushQueue();
  });

  window.addEventListener('offline', function () {
    setTrackerState('offline');
  });

  // ── Intent-Based Click Tracking ───────────────────────────────

  var sessionEventCount = 0;

  var DOWNLOAD_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt|rtf|mp3|mp4|avi|mov|epub)$/i;

  var CTA_CLASS_PATTERN = /\b(btn|button|cta|book)\b/i;

  function classifyClick(el) {
    if (!el) return null;

    var target = el;
    for (var i = 0; i < 5 && target; i++) {
      var tag = (target.tagName || '').toLowerCase();

      if (target.getAttribute && target.getAttribute('data-actv') === 'cta') {
        return { type: 'cta_click', text: getClickText(target), label: getActvLabel(target), el: target };
      }

      if (tag === 'a') {
        var href = target.getAttribute('href') || '';
        if (href.indexOf('tel:') === 0) return { type: 'tel_click', text: href.replace('tel:', ''), label: getActvLabel(target), el: target };
        if (href.indexOf('mailto:') === 0) return { type: 'mailto_click', text: href.replace('mailto:', ''), label: getActvLabel(target), el: target };
        if (DOWNLOAD_EXTENSIONS.test(href)) return { type: 'download_click', text: getClickText(target) || href.split('/').pop(), label: getActvLabel(target), el: target };

        var classes = target.className || '';
        var isCta = (typeof classes === 'string' && CTA_CLASS_PATTERN.test(classes)) || target.getAttribute('role') === 'button';
        if (isCta) return { type: 'cta_click', text: getClickText(target), label: getActvLabel(target), el: target };

        try {
          var linkHost = new URL(href, window.location.origin).hostname;
          if (linkHost && linkHost !== window.location.hostname) {
            return { type: 'outbound_click', text: getClickText(target) || linkHost, label: getActvLabel(target), el: target };
          }
        } catch (e) {}
      }

      if (tag === 'button' || (target.getAttribute && target.getAttribute('role') === 'button')) {
        var inForm = target.closest && target.closest('form');
        var btnType = (target.getAttribute('type') || '').toLowerCase();
        if (!inForm || btnType !== 'submit') {
          return { type: 'cta_click', text: getClickText(target), label: getActvLabel(target), el: target };
        }
      }

      target = target.parentElement;
    }

    return null;
  }

  function getActvLabel(el) {
    if (!el || !el.getAttribute) return null;
    return el.getAttribute('data-actv-label') || null;
  }

  function getClickText(el) {
    var label = getActvLabel(el);
    if (label) return label;
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

    var evt = {
      event_type: result.type,
      target_text: result.text,
      page_url: window.location.href,
      page_path: window.location.pathname,
      session_id: sid,
      visitor_id: vid,
    };
    if (result.label) evt.target_label = result.label;
    var href = (result.el && result.el.getAttribute) ? (result.el.getAttribute('href') || '') : '';
    if (href) {
      try { evt.target_href = new URL(href, window.location.origin).href; } catch (err) { evt.target_href = href; }
    }
    enqueueEvent(evt);
  }

  // Form listeners are intentionally disabled so the tracker stays passive.
  function trackFormFocus() { return; }
  function handleFormSubmit() { return; }

  document.addEventListener('click', trackClick, true);

  // ── Periodic Queue Flush ──────────────────────────────────────

  setInterval(function () {
    flushQueue();
  }, FLUSH_INTERVAL);

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

    // Pageview still goes via dedicated endpoint for backward compatibility
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
      visitor: buildVisitor(vid),
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

  // Safety-first: form submission capture is disabled so the plugin never runs
  // inside a client form submission path.

  // ── Boot ───────────────────────────────────────────────────────

  function bootTracker() {
    if (trackerInitialized) return;
    trackerInitialized = true;

    loadQueue();
    if (eventQueue.length > 0) {
      setTimeout(flushQueue, 1000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', track);
    } else {
      track();
    }
  }

  // Consent-aware initialization
  if (consentMode === 'strict') {
    var stored = getStoredConsent();
    if (stored === 'granted') {
      consentState = 'analytics_consent_granted';
      bootTracker();
    } else if (stored === 'denied') {
      consentState = 'analytics_consent_denied';
      // Do nothing — tracker stays inert
    } else {
      consentState = 'no_consent';
      // Wait for consent via mmConsent.grant() or CMP event
    }
  } else {
    // Relaxed mode: boot immediately (backward compatible)
    consentState = 'analytics_consent_granted';
    bootTracker();
  }
})();
