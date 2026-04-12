/**
 * ACTV TRKR Built-in Consent Banner v2
 * Conflict-resistant, fail-closed, with diagnostics.
 * Integrates with the existing window.mmConsent API in tracker.js.
 * No third-party dependencies. Lightweight, accessible, GDPR-safe.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ── Diagnostics state ──────────────────────────────────────
  var diag = {
    banner_enabled: false,
    script_enqueued: true, // if we're running, we were enqueued
    css_enqueued: false,
    bootstrap_present: false,
    dom_mount_attempted: false,
    dom_mount_succeeded: false,
    fallback_mount_attempted: false,
    fallback_mount_succeeded: false,
    current_consent_state: 'unknown',
    tracker_blocked: true,
    tracker_active: false,
    last_banner_error: null,
    init_timestamp: Date.now()
  };

  // Expose diagnostics on a namespaced global
  window.__mmConsentDiag = diag;

  var CFG = window.mmConsentBannerConfig;

  // Check for inline bootstrap
  diag.bootstrap_present = !!(CFG && typeof CFG === 'object');

  if (!CFG || !CFG.enabled) {
    diag.banner_enabled = false;
    debugLog('Banner disabled or config missing');
    return;
  }

  diag.banner_enabled = true;

  // Check if CSS was loaded
  var sheets = document.styleSheets;
  try {
    for (var s = 0; s < sheets.length; s++) {
      var href = '';
      try { href = sheets[s].href || ''; } catch (e) {}
      if (href.indexOf('consent-banner') !== -1) {
        diag.css_enqueued = true;
        break;
      }
    }
  } catch (e) {}
  // Recheck CSS after load
  if (!diag.css_enqueued) {
    var cssCheck = function () {
      try {
        var allSheets = document.styleSheets;
        for (var i = 0; i < allSheets.length; i++) {
          var h = '';
          try { h = allSheets[i].href || ''; } catch (e) {}
          if (h.indexOf('consent-banner') !== -1) { diag.css_enqueued = true; break; }
        }
      } catch (e) {}
    };
    if (document.readyState === 'complete') cssCheck();
    else window.addEventListener('load', cssCheck);
  }

  var COOKIE_NAME = 'mm_consent_decision';
  var CONSENT_VERSION = '1';
  var MOUNT_ID = 'mm-cb-root';
  var FALLBACK_DELAY = 1500;
  var SECOND_FALLBACK_DELAY = 3500;
  var isDebug = !!(CFG.debugMode);
  var mountCount = 0; // prevent duplicate mounts

  // ── Debug logger ───────────────────────────────────────────
  function debugLog(msg, data) {
    if (!isDebug) return;
    var prefix = '[ACTV TRKR Consent]';
    if (data !== undefined) {
      try { console.log(prefix, msg, data); } catch (e) {}
    } else {
      try { console.log(prefix, msg); } catch (e) {}
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[2]) : null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
  }

  // ── Decision persistence ─────────────────────────────────────

  function getDecision() {
    var raw = getCookie(COOKIE_NAME);
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (d && typeof d === 'object' && d.v === CONSENT_VERSION && typeof d.analytics === 'boolean') {
        return d;
      }
    } catch (e) {
      // Malformed cookie — treat as no consent (fail-closed)
      debugLog('Malformed consent cookie, treating as no consent');
      diag.last_banner_error = 'malformed_consent_cookie';
      deleteCookie(COOKIE_NAME);
    }
    return null;
  }

  function saveDecision(analytics) {
    var val = JSON.stringify({ analytics: analytics, v: CONSENT_VERSION, t: Date.now() });
    setCookie(COOKIE_NAME, val, CFG.expiryDays || 365);
  }

  function clearDecision() {
    deleteCookie(COOKIE_NAME);
  }

  // ── Wire to existing mmConsent API ───────────────────────────

  function applyDecision(analytics) {
    if (!window.mmConsent) {
      debugLog('mmConsent API not found — tracker may not be loaded');
      diag.last_banner_error = 'mmConsent_api_missing';
      return;
    }
    if (analytics) {
      window.mmConsent.grant();
      diag.tracker_blocked = false;
      diag.tracker_active = true;
    } else {
      window.mmConsent.revoke();
      diag.tracker_blocked = true;
      diag.tracker_active = false;
    }
    diag.current_consent_state = analytics ? 'granted' : 'denied';
    debugLog('Consent applied:', analytics ? 'GRANTED' : 'DENIED');
  }

  // ── DOM creation ────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'innerHTML') node.innerHTML = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (typeof children[i] === 'string') node.appendChild(document.createTextNode(children[i]));
        else if (children[i]) node.appendChild(children[i]);
      }
    }
    return node;
  }

  // ── Build Banner ────────────────────────────────────────────

  var bannerEl, overlayEl, modalEl;

  function buildBanner() {
    // Links
    var links = '';
    if (CFG.privacyUrl) links += '<a href="' + esc(CFG.privacyUrl) + '" target="_blank" rel="noopener">' + esc(CFG.privacyLabel || 'Privacy Policy') + '</a>';
    if (CFG.cookieUrl) {
      if (links) links += ' · ';
      links += '<a href="' + esc(CFG.cookieUrl) + '" target="_blank" rel="noopener">' + esc(CFG.cookieLabel || 'Cookie Policy') + '</a>';
    }

    var desc = esc(CFG.description || 'We use cookies to understand how you use our site and improve your experience. Analytics cookies are optional.');
    if (links) desc += '<br>' + links;

    bannerEl = el('div', {
      className: 'mm-cb-banner mm-cb-pos-' + (CFG.position || 'bottom'),
      role: 'dialog',
      'aria-label': 'Cookie consent',
      'aria-modal': 'false',
    }, [
      el('div', { className: 'mm-cb-inner' }, [
        el('div', { className: 'mm-cb-text' }, [
          el('h4', { textContent: CFG.title || 'Cookie Preferences' }),
          el('p', { innerHTML: desc }),
        ]),
        el('div', { className: 'mm-cb-actions' }, [
          el('button', {
            className: 'mm-cb-btn mm-cb-btn-reject',
            textContent: CFG.rejectLabel || 'Reject',
            type: 'button',
            onClick: function () { doDecision(false); },
          }),
          el('button', {
            className: 'mm-cb-btn mm-cb-btn-accept',
            textContent: CFG.acceptLabel || 'Accept',
            type: 'button',
            onClick: function () { doDecision(true); },
          }),
          el('button', {
            className: 'mm-cb-btn mm-cb-btn-prefs',
            textContent: CFG.prefsLabel || 'Manage Preferences',
            type: 'button',
            onClick: function () { openModal(); },
          }),
        ]),
      ]),
    ]);

    return bannerEl;
  }

  // ── Build Preferences Modal ─────────────────────────────────

  var analyticsToggle;

  function buildModal() {
    overlayEl = el('div', { className: 'mm-cb-overlay', onClick: function () { closeModal(); } });

    analyticsToggle = el('input', { type: 'checkbox', id: 'mm-cb-analytics-toggle', 'aria-label': 'Analytics cookies' });

    modalEl = el('div', {
      className: 'mm-cb-modal',
      role: 'dialog',
      'aria-label': 'Cookie preferences',
      'aria-modal': 'true',
    }, [
      el('button', {
        className: 'mm-cb-modal-close',
        textContent: '✕',
        type: 'button',
        'aria-label': 'Close preferences',
        onClick: function () { closeModal(); },
      }),
      el('h3', { textContent: CFG.prefsTitle || 'Cookie Preferences' }),

      // Essential
      el('div', { className: 'mm-cb-category' }, [
        el('div', { className: 'mm-cb-cat-header' }, [
          el('span', { className: 'mm-cb-cat-title', textContent: 'Essential Cookies' }),
          el('span', { className: 'mm-cb-cat-badge', textContent: 'Always Active' }),
        ]),
        el('p', { className: 'mm-cb-cat-desc', textContent: 'Required for the website to function. These cannot be disabled.' }),
      ]),

      // Analytics
      el('div', { className: 'mm-cb-category' }, [
        el('div', { className: 'mm-cb-cat-header' }, [
          el('span', { className: 'mm-cb-cat-title', textContent: 'Analytics Cookies' }),
          el('label', { className: 'mm-cb-toggle' }, [
            analyticsToggle,
            el('span', { className: 'mm-cb-toggle-slider' }),
          ]),
        ]),
        el('p', { className: 'mm-cb-cat-desc', textContent: 'Help us understand how visitors interact with our website. All data is anonymous.' }),
      ]),

      // Actions
      el('div', { className: 'mm-cb-modal-actions' }, [
        el('button', {
          className: 'mm-cb-btn mm-cb-btn-reject',
          textContent: 'Reject All',
          type: 'button',
          onClick: function () { doDecision(false); closeModal(); },
        }),
        el('button', {
          className: 'mm-cb-btn mm-cb-btn-accept',
          textContent: 'Accept All',
          type: 'button',
          onClick: function () { doDecision(true); closeModal(); },
        }),
        el('button', {
          className: 'mm-cb-btn mm-cb-btn-accept',
          textContent: 'Save Preferences',
          type: 'button',
          onClick: function () { doDecision(analyticsToggle.checked); closeModal(); },
        }),
      ]),
    ]);

    return { overlay: overlayEl, modal: modalEl };
  }

  function openModal() {
    var decision = getDecision();
    analyticsToggle.checked = decision ? decision.analytics : false;
    overlayEl.classList.add('mm-cb-visible');
    modalEl.classList.add('mm-cb-visible');
    modalEl.focus();
    document.addEventListener('keydown', trapFocus);
  }

  function closeModal() {
    overlayEl.classList.remove('mm-cb-visible');
    modalEl.classList.remove('mm-cb-visible');
    document.removeEventListener('keydown', trapFocus);
  }

  function trapFocus(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    var focusable = modalEl.querySelectorAll('button, input, [tabindex]');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ── Actions ─────────────────────────────────────────────────

  function doDecision(analytics) {
    saveDecision(analytics);
    applyDecision(analytics);
    hideBanner();
    debugLog('User decision saved:', analytics ? 'accept' : 'reject');
  }

  function showBanner() {
    if (bannerEl) bannerEl.classList.add('mm-cb-visible');
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove('mm-cb-visible');
  }

  // ── Footer reopener ─────────────────────────────────────────

  function addReopener() {
    var existing = document.getElementById('mm-cookie-settings');
    if (existing) {
      existing.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
      existing.setAttribute('role', 'button');
      existing.setAttribute('tabindex', '0');
      return;
    }
    if (CFG.showReopener === false) return;
  }

  // ── Public API for reopening ────────────────────────────────

  window.mmConsentBanner = {
    open: function () { openModal(); },
    reset: function () {
      clearDecision();
      applyDecision(false);
      showBanner();
    },
    getDiagnostics: function () {
      return JSON.parse(JSON.stringify(diag));
    },
  };

  // ── Escape helper ───────────────────────────────────────────

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ── Mount logic (conflict-resistant) ────────────────────────

  function isBannerMounted() {
    return !!document.getElementById(MOUNT_ID);
  }

  function mountBanner(isFallback) {
    // Prevent duplicate mounts
    if (isBannerMounted()) {
      debugLog('Banner already mounted, skipping');
      return true;
    }

    mountCount++;
    if (mountCount > 3) {
      diag.last_banner_error = 'max_mount_attempts_exceeded';
      debugLog('Max mount attempts exceeded');
      return false;
    }

    try {
      var root = el('div', { id: MOUNT_ID });

      var banner = buildBanner();
      var modal = buildModal();

      root.appendChild(banner);
      root.appendChild(modal.overlay);
      root.appendChild(modal.modal);

      // Mount directly on document.body to avoid being clipped by parent containers
      document.body.appendChild(root);

      if (isFallback) {
        diag.fallback_mount_attempted = true;
        diag.fallback_mount_succeeded = true;
        debugLog('Fallback mount succeeded');
      } else {
        diag.dom_mount_attempted = true;
        diag.dom_mount_succeeded = true;
        debugLog('Primary mount succeeded');
      }

      addReopener();
      return true;
    } catch (err) {
      diag.last_banner_error = 'mount_error: ' + (err.message || String(err));
      if (isFallback) {
        diag.fallback_mount_attempted = true;
        diag.fallback_mount_succeeded = false;
      } else {
        diag.dom_mount_attempted = true;
        diag.dom_mount_succeeded = false;
      }
      debugLog('Mount failed:', err.message || err);
      return false;
    }
  }

  // ── Self-check / fallback ──────────────────────────────────

  function selfCheck(delay, label) {
    setTimeout(function () {
      var decision = getDecision();
      if (decision) {
        debugLog(label + ': consent already decided, no action needed');
        return;
      }

      if (!isBannerMounted()) {
        debugLog(label + ': banner not mounted, attempting fallback');
        var ok = mountBanner(true);
        if (ok) {
          showBanner();
          diag.current_consent_state = 'pending';
        } else {
          diag.last_banner_error = label + '_fallback_failed';
        }
      } else if (bannerEl && !bannerEl.classList.contains('mm-cb-visible')) {
        // Banner is mounted but not visible — could be CSS conflict
        debugLog(label + ': banner mounted but not visible, forcing show');
        showBanner();
      }

      // Verify tracking is still blocked
      updateTrackerDiag();
    }, delay);
  }

  function updateTrackerDiag() {
    if (window.mmConsent) {
      var state = window.mmConsent.getState();
      diag.tracker_blocked = state !== 'analytics_consent_granted';
      diag.tracker_active = state === 'analytics_consent_granted';
      diag.current_consent_state = state;
    }
  }

  // ── Init ────────────────────────────────────────────────────

  function init() {
    debugLog('Initializing consent banner');
    diag.dom_mount_attempted = true;

    var decision = getDecision();

    // Primary mount
    var mounted = mountBanner(false);

    if (decision) {
      // Already decided — apply silently, no banner
      applyDecision(decision.analytics);
      diag.current_consent_state = decision.analytics ? 'granted' : 'denied';
      debugLog('Existing consent found:', decision.analytics ? 'granted' : 'denied');
    } else {
      // No decision yet — show banner
      if (mounted) {
        showBanner();
      }
      diag.current_consent_state = 'pending';
      debugLog('No consent decision, showing banner');

      // Schedule fallback checks for deferred/delayed JS environments
      selfCheck(FALLBACK_DELAY, 'fallback1');
      selfCheck(SECOND_FALLBACK_DELAY, 'fallback2');
    }

    updateTrackerDiag();
    debugLog('Diagnostics:', diag);
  }

  // ── Boot ────────────────────────────────────────────────────
  // Use multiple strategies to ensure init runs even if DOMContentLoaded was missed

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready — init immediately
    init();
  }

  // Safety net: if init hasn't run after window load, run it
  window.addEventListener('load', function () {
    if (!diag.dom_mount_attempted) {
      debugLog('Init did not run by window.load — running now');
      init();
    }
  });
})();
