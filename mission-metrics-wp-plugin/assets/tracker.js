(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.mmConfig) return;

  var CFG = window.mmConfig;
  var COOKIE_VID = 'mm_vid';
  var COOKIE_SID = 'mm_sid';
  var COOKIE_UTM = 'mm_utm';
  var COOKIE_TS  = 'mm_ts'; // last-activity timestamp for session timeout
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

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

    setCookie(COOKIE_SID, sid, 1); // session cookie refreshed to 1 day (timeout enforced via mm_ts)
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

  function send(payload) {
    var body = JSON.stringify(payload);
    var headers = {
      type: 'application/json',
    };
    var blob = new Blob([body], headers);

    // Prefer sendBeacon for reliability on page unload.
    if (navigator.sendBeacon) {
      // sendBeacon doesn't support custom headers, so we use fetch as primary
    }

    fetch(CFG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CFG.apiKey,
      },
      body: body,
      keepalive: true,
    }).catch(function () {
      // Fallback to sendBeacon (no auth header, but at least data arrives).
      try { navigator.sendBeacon(CFG.endpoint, blob); } catch (e) { /* silent */ }
    });
  }

  // ── Main ────────────────────────────────────────────────────────

  function track() {
    // Visitor ID (persistent).
    var vid = getCookie(COOKIE_VID);
    if (!vid) {
      vid = uuid();
      setCookie(COOKIE_VID, vid, 365);
    }

    // UTMs from URL.
    var urlUtms = getUtms();
    if (urlUtms) {
      setCookie(COOKIE_UTM, JSON.stringify(urlUtms), 30);
    }

    // Session.
    var sid = resolveSession(urlUtms);

    // Merge attribution (URL UTMs take precedence, then stored).
    var attribution = Object.assign({}, storedUtms(), urlUtms || {});

    var eventId = uuid();

    send({
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

  // Fire on DOMContentLoaded (or immediately if already loaded).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }
})();
