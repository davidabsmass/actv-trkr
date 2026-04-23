/**
 * ACTV TRKR — in-page tracker.
 *
 * SAFETY CONTRACT (v1.18.2+):
 *   This script is a passive observer. It MUST NOT, under any circumstance:
 *     - call preventDefault() or stopPropagation() on any event
 *     - block, delay, or modify form submissions, checkout, or payment flows
 *     - throw an uncaught error that could break other scripts on the page
 *     - perform synchronous network requests
 *     - depend on jQuery or any third-party global
 *
 *   Failure mode policy: if anything goes wrong (missing browser API, bad config,
 *   network outage, exception), the tracker silently disables itself. The host
 *   page must always continue to function.
 *
 *   Transport policy: prefer navigator.sendBeacon (browser-managed, never blocks
 *   unload). Fall back to fetch+keepalive. Never use synchronous XHR.
 *
 *   QA mode: enabled when ?actv_debug=1 is in the URL OR window.mmConfig.debug
 *   is true. Logs to console with the [ACTV] prefix. Errors are still swallowed.
 */
(function () {
  'use strict';

  // ── OUTER GUARD ──────────────────────────────────────────────
  // Nothing inside this IIFE may escape. If the entire bootstrap throws,
  // the host page is unaffected.
  try {

    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.mmConfig) return;

    var CFG = window.mmConfig;

    // ── QA / Debug mode ────────────────────────────────────────
    var DEBUG = false;
    try {
      if (CFG.debug === true) DEBUG = true;
      var qs = (window.location && window.location.search) || '';
      if (qs.indexOf('actv_debug=1') !== -1) DEBUG = true;
    } catch (e) {}

    function dbg() {
      if (!DEBUG) return;
      try {
        var args = ['[ACTV]'];
        for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
        if (window.console && window.console.log) window.console.log.apply(window.console, args);
      } catch (e) {}
    }

    function dbgErr(label, err) {
      if (!DEBUG) return;
      try {
        if (window.console && window.console.warn) window.console.warn('[ACTV]', label, err);
      } catch (e) {}
    }

    // safe(fn) wraps any handler so an internal exception cannot bubble to the host.
    function safe(fn, label) {
      return function () {
        try { return fn.apply(this, arguments); }
        catch (e) { dbgErr(label || 'handler error', e); }
      };
    }

    // SECURITY (v1.9.17+): use narrow-scope ingest token; fall back to admin
    // key only for older plugin builds during the upgrade window.
    var INGEST_CRED = CFG.ingestToken || CFG.apiKey || '';
    var USE_INGEST_TOKEN = !!CFG.ingestToken;
    var COOKIE_VID = 'mm_vid';
    var COOKIE_SID = 'mm_sid';
    var COOKIE_UTM = 'mm_utm';
    var COOKIE_TS  = 'mm_ts';
    var CONSENT_KEY = 'mm_consent';
    var SESSION_TIMEOUT = 30 * 60 * 1000;
    var SIGNAL_INTERVAL = 20000;
    var WATCHDOG_MULTIPLIER = 2;
    var MAX_EVENTS_PER_SESSION = 200;
    var MAX_QUEUE_SIZE = 500;
    var QUEUE_STORAGE_KEY = 'mm_event_queue';
    var FLUSH_INTERVAL = 10000;
    var MAX_RETRY_DELAY = 300000;
    var BASE_RETRY_DELAY = 2000;

    function authHeaders(extra) {
      var h = extra || {};
      h['Content-Type'] = 'application/json';
      // IMPORTANT: fetch requests must not rely on X-Ingest-Token because that
      // header triggers a CORS preflight our ingest endpoints do not allow.
      // Keep credentials in the JSON body via withAuthBody(); only legacy API
      // key auth may ride in Authorization for backward compatibility.
      if (!USE_INGEST_TOKEN && INGEST_CRED) {
        h['Authorization'] = 'Bearer ' + INGEST_CRED;
      }
      return h;
    }

    function withAuthBody(payload) {
      if (USE_INGEST_TOKEN) {
        payload.ingest_token = INGEST_CRED;
      } else if (INGEST_CRED) {
        payload.api_key = INGEST_CRED;
      }
      return payload;
    }

    // ── Consent Mode ──────────────────────────────────────────────
    var consentMode = (CFG.consentMode || 'relaxed').toLowerCase();
    // v1.20.9+: Limited Pre-Consent opt-in. When true AND strict AND no consent,
    // the tracker boots a reduced pipeline (anonymous pageview only — no IDs,
    // no cookies, no journeys). Off by default; existing sites unaffected.
    var limitedPreConsent = CFG.limitedPreConsent === true;
    var consentState = 'no_consent';
    var trackerInitialized = false;
    var limitedModeActive = false;

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
      try {
        var cookies = [COOKIE_VID, COOKIE_SID, COOKIE_UTM, COOKIE_TS];
        for (var i = 0; i < cookies.length; i++) {
          document.cookie = cookies[i] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
        }
      } catch (e) {}
    }

    function clearAnalyticsStorage() {
      clearAnalyticsCookies();
      try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch (e) {}
      clearStoredConsent();
    }

    if (consentMode === 'strict') {
      var _stored = getStoredConsent();
      if (_stored !== 'granted') {
        clearAnalyticsCookies();
      }
    }

    // ── Cookie helpers ──────────────────────────────────────────────

    function setCookie(name, value, days) {
      try {
        var d = new Date();
        d.setTime(d.getTime() + days * 864e5);
        document.cookie = name + '=' + encodeURIComponent(value) +
          ';expires=' + d.toUTCString() +
          ';path=/;SameSite=Lax';
      } catch (e) {}
    }

    function getCookie(name) {
      try {
        var v = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
        return v ? decodeURIComponent(v[2]) : null;
      } catch (e) { return null; }
    }

    // ── UUID v4 ─────────────────────────────────────────────────────

    function uuid() {
      try {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      } catch (e) {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    // ── UTM extraction ──────────────────────────────────────────────

    function getUtms() {
      try {
        if (typeof URLSearchParams === 'undefined') return null;
        var params = new URLSearchParams(window.location.search);
        var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        var out = {};
        var found = false;
        for (var i = 0; i < keys.length; i++) {
          var v = params.get(keys[i]);
          if (v) { out[keys[i]] = v; found = true; }
        }
        return found ? out : null;
      } catch (e) { return null; }
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
      try {
        var w = window.innerWidth;
        if (w < 768) return 'mobile';
        if (w < 1024) return 'tablet';
        return 'desktop';
      } catch (e) { return 'desktop'; }
    }

    // ── Visitor identity ──────────────────────────────────────────

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
      } catch (e) {}
    }

    function saveQueue() {
      try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(eventQueue));
      } catch (e) {}
    }

    function clearSavedQueue() {
      try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch (e) {}
    }

    function eventPriority(type) {
      if (type === 'page_view') return 3;
      if (type === 'form_submit') return 3;
      if (type === 'signal' || type === 'time_update') return 0;
      return 1;
    }

    function trimQueue() {
      if (eventQueue.length <= MAX_QUEUE_SIZE) return;
      eventQueue.sort(function (a, b) {
        var pa = eventPriority(a.event_type);
        var pb = eventPriority(b.event_type);
        if (pa !== pb) return pa - pb;
        return (new Date(a.timestamp)).getTime() - (new Date(b.timestamp)).getTime();
      });
      eventQueue = eventQueue.slice(eventQueue.length - MAX_QUEUE_SIZE);
      saveQueue();
    }

    function enqueueEvent(evt) {
      try {
        evt.event_uuid = evt.event_uuid || uuid();
        evt.timestamp = evt.timestamp || new Date().toISOString();
        eventQueue.push(evt);
        trimQueue();
        saveQueue();
      } catch (e) { dbgErr('enqueueEvent', e); }
    }

    // ── Tracker State ──────────────────────────────────────────────
    var trackerState = 'active';
    var retryCount = 0;
    var lastSuccessfulSend = Date.now();
    var lastSignalAttempt = 0;

    function setTrackerState(newState) {
      if (trackerState === newState) return;
      trackerState = newState;
      dbg('state ->', newState);
    }

    // ── Transport ──────────────────────────────────────────────────
    // Order of preference for ALL outbound sends:
    //   1. navigator.sendBeacon  — browser-managed, never blocks unload, never throws on us
    //   2. fetch + keepalive    — async, errors caught
    //   3. silent drop          — last resort
    // We NEVER use synchronous XHR (deprecated, can hang page during unload).

    function getEventEndpoint() {
      try { return CFG.endpoint.replace(/\/track-pageview$/, '/track-event'); }
      catch (e) { return CFG.endpoint; }
    }

    // sendBeacon doesn't support custom headers, so the credential rides
    // inside the JSON body via withAuthBody().
    function tryBeacon(endpoint, payload) {
      try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
          var body = JSON.stringify(payload);
          var ok = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
          if (ok) return true;
        }
      } catch (e) { dbgErr('sendBeacon failed', e); }
      return false;
    }

    function tryFetch(endpoint, payload, onSuccess, onFailure) {
      try {
        var body = JSON.stringify(payload);
        if (typeof fetch !== 'function') {
          if (onFailure) onFailure();
          return;
        }
        fetch(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          body: body,
          keepalive: true,
        }).then(function (resp) {
          if (resp && (resp.ok || resp.status === 200)) {
            if (onSuccess) onSuccess();
          } else {
            if (onFailure) onFailure();
          }
        }).catch(function (err) {
          dbgErr('fetch rejected', err);
          if (onFailure) onFailure();
        });
      } catch (e) {
        dbgErr('tryFetch threw', e);
        if (onFailure) onFailure();
      }
    }

    // Fetch-first send with optional retry callbacks.
    // For normal pageviews/event batches we want an actual HTTP response so
    // blocked or rejected requests do not look like successful sends.
    // Beacon remains reserved for unload/final flush paths only.
    function sendWithRetry(endpoint, payload, onSuccess, onFailure) {
      tryFetch(endpoint, payload, function () {
        if (onSuccess) onSuccess();
      }, function () {
        retryCount++;
        if (onFailure) onFailure();
        scheduleRetry();
      });
    }

    var retryTimer = null;
    function scheduleRetry() {
      if (retryTimer) return;
      var delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount - 1), MAX_RETRY_DELAY);
      retryTimer = setTimeout(safe(function () {
        retryTimer = null;
        flushQueue();
      }, 'retry'), delay);
    }

    // Fire-and-forget. Used for unload paths.
    function sendBeaconSafe(endpoint, payload) {
      if (tryBeacon(endpoint, payload)) return;
      // Last resort — fetch keepalive. No sync XHR ever.
      tryFetch(endpoint, payload, null, null);
    }

    // Standard send (pageviews, time_updates).
    // Use fetch first so regular tracking is acknowledged by the backend
    // instead of silently relying on the browser accepting a beacon.
    function send(endpoint, payload) {
      tryFetch(endpoint, payload, function () {
        lastSuccessfulSend = Date.now();
        setTrackerState('active');
      }, function () {
        // Last-resort fallback for browsers/environments where fetch+keepalive
        // is unavailable or unreliable, but never treat a beacon as the normal
        // success path for interactive tracking.
        if (tryBeacon(endpoint, payload)) {
          lastSuccessfulSend = Date.now();
          setTrackerState('active');
          return;
        }
        dbg('send failed, dropping payload');
      });
    }

    function flushQueue() {
      if (eventQueue.length === 0) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setTrackerState('offline');
        return;
      }

      var pageviewEvents = [];
      var otherEvents = [];
      for (var i = 0; i < eventQueue.length; i++) {
        if (eventQueue[i].event_type === 'page_view') {
          pageviewEvents.push(eventQueue[i]);
        } else {
          otherEvents.push(eventQueue[i]);
        }
      }

      if (otherEvents.length > 0) {
        var batch = otherEvents.splice(0, 50);
        var vid = getCookie(COOKIE_VID);
        var sid = getCookie(COOKIE_SID);

        var payload = withAuthBody({
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
        });

        sendWithRetry(getEventEndpoint(), payload, function onSuccess() {
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
          setTrackerState('retrying');
        });
      }
    }

    // ── Time-on-Page Tracking ─────────────────────────────────────

    var pageTimer = {
      startedAt: null,
      activeMs: 0,
      lastResumeAt: null,
      isActive: true,
      eventId: null,
      signalTimer: null,
      watchdogTimer: null,

      start: function (eventId) {
        this.eventId = eventId;
        this.startedAt = Date.now();
        this.lastResumeAt = Date.now();
        this.activeMs = 0;
        this.isActive = true;
        this.startSignal();
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

      startSignal: function () {
        var self = this;
        if (this.signalTimer) clearInterval(this.signalTimer);
        this.signalTimer = setInterval(safe(function () {
          if (self.isActive) {
            self.sendTimeUpdate();
            lastSignalAttempt = Date.now();
          }
        }, 'signal tick'), SIGNAL_INTERVAL);
      },

      startWatchdog: function () {
        var self = this;
        if (this.watchdogTimer) clearInterval(this.watchdogTimer);
        lastSignalAttempt = Date.now();
        this.watchdogTimer = setInterval(safe(function () {
          var elapsed = Date.now() - lastSignalAttempt;
          if (elapsed > SIGNAL_INTERVAL * WATCHDOG_MULTIPLIER) {
            self.startSignal();
            setTrackerState('degraded');
            enqueueEvent({
              event_type: 'session_gap_detected',
              page_url: window.location.href,
              page_path: window.location.pathname,
              meta: { gap_ms: elapsed, reason: 'watchdog_restart' },
            });
          }
        }, 'watchdog'), SIGNAL_INTERVAL * WATCHDOG_MULTIPLIER + 5000);
      },

      sendTimeUpdate: function () {
        if (!this.eventId) return;
        var vid = getCookie(COOKIE_VID);
        var sid = getCookie(COOKIE_SID);
        send(CFG.endpoint, withAuthBody({
          type: 'time_update',
          source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
          event: {
            event_id: this.eventId,
            session_id: sid,
            active_seconds: this.getActiveSeconds(),
          },
          visitor: buildVisitor(vid),
        }));
      },

      sendFinal: function () {
        if (!this.eventId) return;
        clearInterval(this.signalTimer);
        clearInterval(this.watchdogTimer);
        var vid = getCookie(COOKIE_VID);
        var sid = getCookie(COOKIE_SID);
        sendBeaconSafe(CFG.endpoint, withAuthBody({
          type: 'time_update',
          source: { domain: CFG.domain, type: 'wordpress', plugin_version: CFG.pluginVersion },
          event: {
            event_id: this.eventId,
            session_id: sid,
            active_seconds: this.getActiveSeconds(),
          },
          visitor: buildVisitor(vid),
        }));
      },
    };

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
          // CRITICAL: never interfere with submit buttons inside forms.
          // We look at them only to skip them.
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

    // CRITICAL: this handler MUST NOT call preventDefault/stopPropagation,
    // and MUST NOT throw. It's wrapped in safe() at attach time.
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

    // Form listeners are intentionally disabled. The tracker stays purely
    // passive — form data is captured server-side by class-forms.php after
    // the form's own handler has completed. This guarantees we cannot
    // interfere with submission, validation, payment tokenization, or nonces.
    function trackFormFocus() { return; }
    function handleFormSubmit() { return; }

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

      pageTimer.start(eventId);

      send(CFG.endpoint, withAuthBody({
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
      }));
    }

    // ── Listeners ────────────────────────────────────────────────
    var flushIntervalId = null;
    var listenersAttached = false;

    function onVisibilityChange() {
      if (!trackerInitialized) return;
      if (document.hidden) {
        pageTimer.pause();
        flushQueue();
      } else {
        pageTimer.resume();
        var sid = getCookie(COOKIE_SID);
        var lastTs = parseInt(getCookie(COOKIE_TS) || '0', 10);
        var now = Date.now();
        if (!sid || (now - lastTs > SESSION_TIMEOUT)) {
          enqueueEvent({
            event_type: 'session_resume',
            page_url: window.location.href,
            page_path: window.location.pathname,
            meta: { gap_ms: now - lastTs },
          });
          resolveSession(null);
        }
        setCookie(COOKIE_TS, String(now), 1);
        pageTimer.startSignal();
        flushQueue();
      }
    }

    function onFocus() {
      if (!trackerInitialized) return;
      pageTimer.resume();
      pageTimer.startSignal();
      flushQueue();
    }

    function onBlur() {
      if (!trackerInitialized) return;
      pageTimer.pause();
    }

    function onBeforeUnload() {
      if (!trackerInitialized) return;
      pageTimer.sendFinal();
      if (eventQueue.length > 0) {
        var vid = getCookie(COOKIE_VID);
        var sid = getCookie(COOKIE_SID);
        var batch = eventQueue.splice(0, 50);
        sendBeaconSafe(getEventEndpoint(), withAuthBody({
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
        }));
        saveQueue();
      }
    }

    function onPageHide() {
      if (!trackerInitialized) return;
      pageTimer.sendFinal();
    }

    function onOnline() {
      if (!trackerInitialized) return;
      setTrackerState('active');
      flushQueue();
    }

    function onOffline() {
      if (!trackerInitialized) return;
      setTrackerState('offline');
    }

    // Every listener is wrapped in safe() so a runtime exception here can
    // never bubble out to the host page or other scripts.
    var L = {
      vis: safe(onVisibilityChange, 'visibilitychange'),
      focus: safe(onFocus, 'focus'),
      blur: safe(onBlur, 'blur'),
      beforeUnload: safe(onBeforeUnload, 'beforeunload'),
      pageHide: safe(onPageHide, 'pagehide'),
      online: safe(onOnline, 'online'),
      offline: safe(onOffline, 'offline'),
      click: safe(trackClick, 'click'),
    };

    function attachListeners() {
      if (listenersAttached) return;
      listenersAttached = true;
      document.addEventListener('visibilitychange', L.vis);
      window.addEventListener('focus', L.focus);
      window.addEventListener('blur', L.blur);
      window.addEventListener('beforeunload', L.beforeUnload);
      window.addEventListener('pagehide', L.pageHide);
      window.addEventListener('online', L.online);
      window.addEventListener('offline', L.offline);
      // Capture-phase listener: passive observation of clicks. We never call
      // preventDefault or stopPropagation here. trackClick() is wrapped in safe().
      document.addEventListener('click', L.click, true);
      flushIntervalId = setInterval(safe(function () { flushQueue(); }, 'flush tick'), FLUSH_INTERVAL);
      dbg('listeners attached');
    }

    function detachListeners() {
      if (!listenersAttached) return;
      listenersAttached = false;
      document.removeEventListener('visibilitychange', L.vis);
      window.removeEventListener('focus', L.focus);
      window.removeEventListener('blur', L.blur);
      window.removeEventListener('beforeunload', L.beforeUnload);
      window.removeEventListener('pagehide', L.pageHide);
      window.removeEventListener('online', L.online);
      window.removeEventListener('offline', L.offline);
      document.removeEventListener('click', L.click, true);
      if (flushIntervalId) { clearInterval(flushIntervalId); flushIntervalId = null; }
    }

    // ── Shutdown ──────────────────────────────────────────────────

    function shutdownTracker() {
      try {
        if (pageTimer.signalTimer) clearInterval(pageTimer.signalTimer);
        if (pageTimer.watchdogTimer) clearInterval(pageTimer.watchdogTimer);
        detachListeners();
        eventQueue = [];
        trackerInitialized = false;
        dbg('tracker shut down');
      } catch (e) { dbgErr('shutdown', e); }
    }

    // ── Boot ───────────────────────────────────────────────────────

    function bootTracker() {
      if (trackerInitialized) return;
      trackerInitialized = true;

      attachListeners();
      loadQueue();
      if (eventQueue.length > 0) {
        setTimeout(safe(flushQueue, 'initial flush'), 1000);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safe(track, 'pageview'));
      } else {
        safe(track, 'pageview')();
      }
      dbg('tracker booted', { region: CFG.consentMode, version: CFG.pluginVersion });
    }

    // v1.20.9+: Limited Pre-Consent boot path.
    // ──────────────────────────────────────────────────────────────
    // Sends a SINGLE anonymous pageview when consent has not been granted
    // and the admin has explicitly opted in via Settings → Privacy.
    // Hard guarantees:
    //   - no visitor_id, no session_id, no wp_user_*
    //   - no cookies are read or written
    //   - no localStorage queue, no journey stitching, no listeners
    //   - no form/lead tracking, no clicks, no time-on-page signals
    //   - flagged with tracking_mode='limited' so the backend strips
    //     anything the client did manage to include
    //
    // If consent is later granted, the full tracker boots normally via
    // mmConsent.grant() — this function does NOT mark tracker initialized,
    // so the upgrade path is clean.
    function bootLimitedTracker() {
      if (limitedModeActive) return;
      limitedModeActive = true;

      function sendLimitedPageview() {
        try {
          var refDomain = null;
          try {
            if (document.referrer) refDomain = new URL(document.referrer).hostname;
          } catch (e) {}

          // Generate a one-shot event_id (required by backend) but DO NOT
          // persist anywhere. New event_id each call = no stitching possible.
          var eventId = 'lim_' + uuid();

          var payload = withAuthBody({
            source: {
              domain: CFG.domain,
              type: 'wordpress',
              plugin_version: CFG.pluginVersion,
            },
            event: {
              event_id: eventId,
              page_url: window.location.href,
              page_path: window.location.pathname,
              referrer: document.referrer || null,
              device: deviceType(),
              occurred_at: new Date().toISOString(),
              tracking_mode: 'limited',
            },
          });

          send(CFG.endpoint, payload);
          dbg('limited pre-consent pageview sent');
        } catch (e) { dbgErr('limited pageview', e); }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safe(sendLimitedPageview, 'limited pv'));
      } else {
        safe(sendLimitedPageview, 'limited pv')();
      }
    }

    // ── Public Consent + Diagnostics API ──────────────────────────

    window.mmConsent = {
      grant: safe(function () {
        consentState = 'analytics_consent_granted';
        setStoredConsent('granted');
        if (!trackerInitialized) {
          bootTracker();
        }
      }, 'consent.grant'),
      deny: safe(function () {
        consentState = 'analytics_consent_denied';
        setStoredConsent('denied');
        shutdownTracker();
        clearAnalyticsCookies();
      }, 'consent.deny'),
      revoke: safe(function () {
        consentState = 'analytics_consent_denied';
        clearAnalyticsStorage();
        shutdownTracker();
      }, 'consent.revoke'),
      getState: function () { return consentState; },
    };

    // QA-mode diagnostics window. Useful for spot-checking install safety
    // on a client site without exposing internals to the public.
    if (DEBUG) {
      window.mmDiag = {
        getState: function () {
          return {
            initialized: trackerInitialized,
            consentState: consentState,
            consentMode: consentMode,
            trackerState: trackerState,
            queueLength: eventQueue.length,
            sessionEventCount: sessionEventCount,
            lastSuccessfulSend: lastSuccessfulSend,
            pluginVersion: CFG.pluginVersion,
            domain: CFG.domain,
            usingIngestToken: USE_INGEST_TOKEN,
          };
        },
        flush: safe(flushQueue, 'diag.flush'),
        shutdown: safe(shutdownTracker, 'diag.shutdown'),
      };
      dbg('QA mode active. window.mmDiag is available.');
    }

    // CMP integrations (each handler is wrapped in safe()).
    document.addEventListener('cmplz_fire_categories', safe(function (e) {
      if (e.detail && e.detail.categories && e.detail.categories.indexOf('statistics') !== -1) {
        window.mmConsent.grant();
      } else {
        window.mmConsent.deny();
      }
    }, 'cmplz handler'));

    document.addEventListener('mm_consent_update', safe(function (e) {
      if (e.detail && e.detail.analytics === true) {
        window.mmConsent.grant();
      } else {
        window.mmConsent.deny();
      }
    }, 'mm_consent_update handler'));

    // ── Consent-aware initialization ──────────────────────────────

    if (consentMode === 'strict') {
      var stored = getStoredConsent();
      if (stored === 'granted') {
        consentState = 'analytics_consent_granted';
        bootTracker();
      } else if (stored === 'denied') {
        consentState = 'analytics_consent_denied';
        // v1.20.9+: respect explicit denial. No limited mode after deny.
      } else {
        consentState = 'no_consent';
        // v1.20.9+: if admin opted into Limited Pre-Consent Tracking,
        // boot the reduced pipeline. Otherwise stay completely inert
        // (unchanged legacy behavior — wait for mmConsent.grant()).
        if (limitedPreConsent) {
          bootLimitedTracker();
        }
      }
    } else {
      // Relaxed mode: boot immediately (backward compatible).
      consentState = 'analytics_consent_granted';
      bootTracker();
    }

  } catch (outerErr) {
    // Last line of defense. The host page MUST keep working even if our
    // bootstrap throws something unexpected. Surface the error in QA mode
    // only; never re-throw.
    try {
      if (window.mmConfig && (window.mmConfig.debug === true ||
          (window.location && window.location.search && window.location.search.indexOf('actv_debug=1') !== -1))) {
        if (window.console && window.console.warn) {
          window.console.warn('[ACTV] tracker bootstrap failed (host page unaffected):', outerErr);
        }
      }
    } catch (_) {}
  }
})();

