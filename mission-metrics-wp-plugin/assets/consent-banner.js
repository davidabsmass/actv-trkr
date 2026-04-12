/**
 * ACTV TRKR Built-in Consent Banner v3
 * Region-aware: EU/UK strict, US opt-out, configurable other.
 * Conflict-resistant, fail-closed, with diagnostics.
 * Integrates with window.mmConsent API in tracker.js.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ── Diagnostics state ──────────────────────────────────────
  var diag = {
    banner_enabled: false,
    script_enqueued: true,
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
    init_timestamp: Date.now(),
    detected_region: 'unknown',
    region_behavior: 'strict',
    region_source: 'none',
    external_cmp_detected: false,
    consent_signal_status: 'unknown',
    external_tracking_scripts: []
  };

  window.__mmConsentDiag = diag;

  var CFG = window.mmConsentBannerConfig;

  diag.bootstrap_present = !!(CFG && typeof CFG === 'object');

  if (!CFG || !CFG.enabled) {
    diag.banner_enabled = false;
    debugLog('Banner disabled or config missing');
    return;
  }

  diag.banner_enabled = true;

  // Check CSS
  var sheets = document.styleSheets;
  try {
    for (var s = 0; s < sheets.length; s++) {
      var href = '';
      try { href = sheets[s].href || ''; } catch (e) {}
      if (href.indexOf('consent-banner') !== -1) { diag.css_enqueued = true; break; }
    }
  } catch (e) {}
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
  var OPT_OUT_COOKIE = 'mm_optout';
  var CONSENT_VERSION = '2';
  var MOUNT_ID = 'mm-cb-root';
  var FALLBACK_DELAY = 1500;
  var SECOND_FALLBACK_DELAY = 3500;
  var isDebug = !!(CFG.debugMode);
  var mountCount = 0;

  // ── Region detection ──────────────────────────────────────────

  var EU_TIMEZONES_PREFIX = [
    'Europe/', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Madeira',
    'Atlantic/Reykjavik', 'Arctic/Longyearbyen'
  ];
  var US_TIMEZONES_PREFIX = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'America/Phoenix', 'America/Adak', 'America/Boise',
    'America/Detroit', 'America/Indiana', 'America/Kentucky', 'America/Menominee',
    'America/Nome', 'America/North_Dakota', 'America/Sitka', 'America/Yakutat',
    'Pacific/Honolulu', 'US/'
  ];

  function detectRegionFromTimezone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      for (var i = 0; i < US_TIMEZONES_PREFIX.length; i++) {
        if (tz.indexOf(US_TIMEZONES_PREFIX[i]) === 0) return 'us';
      }
      for (var j = 0; j < EU_TIMEZONES_PREFIX.length; j++) {
        if (tz.indexOf(EU_TIMEZONES_PREFIX[j]) === 0) return 'eu';
      }
    } catch (e) {}
    return 'other';
  }

  // Determine effective region: server-detected > timezone fallback
  var detectedRegion = CFG.detectedRegion || 'unknown';
  var regionSource = 'server';

  if (detectedRegion === 'unknown') {
    detectedRegion = detectRegionFromTimezone();
    regionSource = 'timezone';
  }

  // Determine effective behavior
  var regionBehavior = CFG.regionBehavior || 'strict';

  // If server gave 'unknown', we need to compute behavior client-side
  if (CFG.detectedRegion === 'unknown' || !CFG.detectedRegion) {
    var mode = CFG.complianceMode || 'global_strict';
    if (mode === 'global_strict') {
      regionBehavior = 'strict';
    } else {
      if (detectedRegion === 'eu') regionBehavior = 'strict';
      else if (detectedRegion === 'us') regionBehavior = 'us_optout';
      else regionBehavior = (CFG.otherRegionFallback === 'relaxed') ? 'relaxed' : 'strict';
    }
  }

  diag.detected_region = detectedRegion;
  diag.region_behavior = regionBehavior;
  diag.region_source = regionSource;
  diag.external_cmp_detected = !!(CFG.externalCmpDetected);

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

  debugLog('Region detected:', detectedRegion + ' (source: ' + regionSource + ')');
  debugLog('Region behavior:', regionBehavior);

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
      if (d && typeof d === 'object' && (d.v === CONSENT_VERSION || d.v === '1') && typeof d.analytics === 'boolean') {
        return d;
      }
    } catch (e) {
      debugLog('Malformed consent cookie, treating as no consent');
      diag.last_banner_error = 'malformed_consent_cookie';
      deleteCookie(COOKIE_NAME);
    }
    return null;
  }

  function getOptOut() {
    return getCookie(OPT_OUT_COOKIE) === '1';
  }

  function setOptOut(value) {
    if (value) {
      setCookie(OPT_OUT_COOKIE, '1', CFG.expiryDays || 365);
    } else {
      deleteCookie(OPT_OUT_COOKIE);
    }
  }

  function saveDecision(analytics) {
    var val = JSON.stringify({ analytics: analytics, v: CONSENT_VERSION, t: Date.now(), region: detectedRegion });
    setCookie(COOKIE_NAME, val, CFG.expiryDays || 365);
    // Also update opt-out cookie for US mode
    setOptOut(!analytics);
  }

  function clearDecision() {
    deleteCookie(COOKIE_NAME);
    deleteCookie(OPT_OUT_COOKIE);
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

  // ── Build Banner (EU/UK strict) ────────────────────────────

  var bannerEl, overlayEl, modalEl;

  function buildBanner() {
    var links = '';
    if (CFG.privacyUrl) links += '<a href="' + esc(CFG.privacyUrl) + '" target="_blank" rel="noopener">' + esc(CFG.privacyLabel || 'Privacy Policy') + '</a>';
    if (CFG.cookieUrl) {
      if (links) links += ' · ';
      links += '<a href="' + esc(CFG.cookieUrl) + '" target="_blank" rel="noopener">' + esc(CFG.cookieLabel || 'Cookie Policy') + '</a>';
    }

    var defaultDesc = 'We use optional analytics cookies to understand how you use our site and improve your experience. You can accept or reject them — the site works either way.';
    var desc = esc(CFG.description || defaultDesc);
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

  // ── Build US Notice (non-blocking) ─────────────────────────

  var usNoticeEl;

  function buildUsNotice() {
    if (!CFG.usShowNotice) return null;

    var text = CFG.usNoticeText || 'This site uses analytics cookies to improve your experience. You can opt out anytime.';
    var privacyLabel = CFG.usPrivacyLabel || 'Privacy Settings';

    usNoticeEl = el('div', {
      className: 'mm-cb-us-notice mm-cb-pos-' + (CFG.position || 'bottom'),
      role: 'status',
      'aria-label': 'Privacy notice',
    }, [
      el('div', { className: 'mm-cb-inner' }, [
        el('p', { className: 'mm-cb-us-notice-text', textContent: text }),
        el('div', { className: 'mm-cb-actions' }, [
          el('button', {
            className: 'mm-cb-btn mm-cb-btn-prefs',
            textContent: privacyLabel,
            type: 'button',
            onClick: function () { openModal(); },
          }),
          el('button', {
            className: 'mm-cb-btn mm-cb-btn-dismiss',
            textContent: 'Dismiss',
            type: 'button',
            onClick: function () { hideUsNotice(); },
          }),
        ]),
      ]),
    ]);

    return usNoticeEl;
  }

  function showUsNotice() {
    if (usNoticeEl) usNoticeEl.classList.add('mm-cb-visible');
  }

  function hideUsNotice() {
    if (usNoticeEl) usNoticeEl.classList.remove('mm-cb-visible');
    // Remember dismissal
    try { sessionStorage.setItem('mm_us_notice_dismissed', '1'); } catch (e) {}
  }

  function wasUsNoticeDismissed() {
    try { return sessionStorage.getItem('mm_us_notice_dismissed') === '1'; } catch (e) { return false; }
  }

  // ── Build Preferences Modal ─────────────────────────────────

  var analyticsToggle;

  function buildModal() {
    overlayEl = el('div', { className: 'mm-cb-overlay', onClick: function () { closeModal(); } });

    analyticsToggle = el('input', { type: 'checkbox', id: 'mm-cb-analytics-toggle', 'aria-label': 'Analytics cookies' });

    var modalTitle = regionBehavior === 'us_optout'
      ? (CFG.usPrivacyLabel || 'Privacy Settings')
      : (CFG.prefsTitle || 'Cookie Preferences');

    modalEl = el('div', {
      className: 'mm-cb-modal',
      role: 'dialog',
      'aria-label': modalTitle,
      'aria-modal': 'true',
    }, [
      el('button', {
        className: 'mm-cb-modal-close',
        textContent: '✕',
        type: 'button',
        'aria-label': 'Close preferences',
        onClick: function () { closeModal(); },
      }),
      el('h3', { textContent: modalTitle }),

      // Essential
      el('div', { className: 'mm-cb-category' }, [
        el('div', { className: 'mm-cb-cat-header' }, [
          el('span', { className: 'mm-cb-cat-title', textContent: 'Essential Cookies' }),
          el('span', { className: 'mm-cb-cat-badge', textContent: 'Always Active' }),
        ]),
        el('p', { className: 'mm-cb-cat-desc', textContent: 'Required for the website to function properly. These cannot be disabled.' }),
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
        el('p', { className: 'mm-cb-cat-desc', textContent: 'Help us understand how visitors use our website so we can improve it. All data is anonymous. Disabling these does not affect how the site works for you.' }),
      ]),

      // Actions
      el('div', { className: 'mm-cb-modal-actions' }, [
        el('button', {
          className: 'mm-cb-btn mm-cb-btn-reject',
          textContent: regionBehavior === 'us_optout' ? 'Opt Out of Analytics' : 'Reject All',
          type: 'button',
          onClick: function () { doDecision(false); closeModal(); },
        }),
        el('button', {
          className: 'mm-cb-btn mm-cb-btn-accept',
          textContent: regionBehavior === 'us_optout' ? 'Keep Analytics On' : 'Accept All',
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
    if (regionBehavior === 'us_optout') {
      // US: default ON unless opted out
      analyticsToggle.checked = decision ? decision.analytics : !getOptOut();
    } else {
      analyticsToggle.checked = decision ? decision.analytics : false;
    }
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
    hideUsNotice();
    debugLog('User decision saved:', analytics ? 'accept' : 'reject');
  }

  function showBanner() {
    if (bannerEl) bannerEl.classList.add('mm-cb-visible');
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove('mm-cb-visible');
  }

  // ── Footer link management ──────────────────────────────────

  function setupFooterLinks() {
    var cookieLink = document.getElementById('mm-cookie-settings');
    var privacyLink = document.getElementById('mm-privacy-settings');

    if (regionBehavior === 'strict') {
      // EU/UK: show cookie settings link
      if (cookieLink) {
        cookieLink.style.display = '';
        cookieLink.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
        cookieLink.setAttribute('role', 'button');
        cookieLink.setAttribute('tabindex', '0');
      }
      if (privacyLink) privacyLink.style.display = 'none';
    } else if (regionBehavior === 'us_optout') {
      // US: show privacy settings link
      if (privacyLink) {
        privacyLink.style.display = '';
        privacyLink.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
        privacyLink.setAttribute('role', 'button');
        privacyLink.setAttribute('tabindex', '0');
      }
      // Also show cookie link if enabled
      if (cookieLink && CFG.showReopener) {
        cookieLink.style.display = 'none'; // hide cookie link for US, privacy link handles it
      }
    } else {
      // Relaxed/other: show cookie settings if reopener enabled
      if (cookieLink && CFG.showReopener) {
        cookieLink.style.display = '';
        cookieLink.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
      }
      if (privacyLink) privacyLink.style.display = 'none';
    }
  }

  // ── Public API for reopening ────────────────────────────────

  window.mmConsentBanner = {
    open: function () { openModal(); },
    reset: function () {
      clearDecision();
      applyDecision(false);
      if (regionBehavior === 'strict') {
        showBanner();
      }
    },
    getDiagnostics: function () {
      return JSON.parse(JSON.stringify(diag));
    },
    getRegion: function () {
      return { region: detectedRegion, behavior: regionBehavior, source: regionSource };
    },
  };

  // ── Escape helper ───────────────────────────────────────────

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ── Mount logic ────────────────────────────────────────────

  function isBannerMounted() {
    return !!document.getElementById(MOUNT_ID);
  }

  function mountBanner(isFallback) {
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

      // Always build the modal (shared between banner & US notice)
      var modal = buildModal();

      // Build banner for strict mode
      if (regionBehavior === 'strict') {
        var banner = buildBanner();
        root.appendChild(banner);
      }

      // Build US notice for opt-out mode
      if (regionBehavior === 'us_optout') {
        var notice = buildUsNotice();
        if (notice) root.appendChild(notice);
      }

      root.appendChild(modal.overlay);
      root.appendChild(modal.modal);

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

      setupFooterLinks();
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
      // Only fallback-mount matters for strict mode (EU/UK)
      if (regionBehavior !== 'strict') return;

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
        debugLog(label + ': banner mounted but not visible, forcing show');
        showBanner();
      }

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
    // Consent signal status
    if (diag.external_cmp_detected) {
      if (diag.tracker_active) {
        diag.consent_signal_status = 'external_cmp_signal_received';
      } else if (diag.current_consent_state === 'pending' || diag.current_consent_state === 'unknown') {
        diag.consent_signal_status = 'external_cmp_signal_unclear';
      } else {
        diag.consent_signal_status = 'external_cmp_signal_denied';
      }
    } else {
      diag.consent_signal_status = diag.banner_enabled ? 'actv_trkr_banner_active' : 'no_consent_handler';
    }
    debugLog('Consent signal status:', diag.consent_signal_status);
  }

  // ── Init ────────────────────────────────────────────────────

  function init() {
    debugLog('Initializing consent banner (behavior: ' + regionBehavior + ')');
    diag.dom_mount_attempted = true;

    var decision = getDecision();
    var optedOut = getOptOut();
    var mounted = mountBanner(false);

    if (regionBehavior === 'strict') {
      // ── EU/UK: strict opt-in ──────────────────────────────
      if (decision) {
        applyDecision(decision.analytics);
        diag.current_consent_state = decision.analytics ? 'granted' : 'denied';
        debugLog('Existing consent found:', decision.analytics ? 'granted' : 'denied');
      } else {
        // No decision — show banner, keep tracker blocked
        if (mounted) showBanner();
        diag.current_consent_state = 'pending';
        debugLog('No consent decision, showing banner');
        selfCheck(FALLBACK_DELAY, 'fallback1');
        selfCheck(SECOND_FALLBACK_DELAY, 'fallback2');
      }

    } else if (regionBehavior === 'us_optout') {
      // ── US: opt-out ───────────────────────────────────────
      if (decision) {
        // User made an explicit decision
        applyDecision(decision.analytics);
        diag.current_consent_state = decision.analytics ? 'granted' : 'denied';
        debugLog('Existing decision found:', decision.analytics ? 'opted in' : 'opted out');
      } else if (optedOut) {
        // Opted out via mm_optout cookie but no full decision
        applyDecision(false);
        diag.current_consent_state = 'opted_out';
        debugLog('User previously opted out');
      } else {
        // No decision, no opt-out → allow tracking (US default)
        applyDecision(true);
        diag.current_consent_state = 'us_default_granted';
        debugLog('US visitor, no opt-out — allowing analytics');

        // Show US notice if configured and not dismissed
        if (CFG.usShowNotice && !wasUsNoticeDismissed() && mounted) {
          showUsNotice();
        }
      }

    } else {
      // ── Relaxed / other ───────────────────────────────────
      if (decision) {
        applyDecision(decision.analytics);
        diag.current_consent_state = decision.analytics ? 'granted' : 'denied';
      } else {
        // Relaxed: allow tracking by default
        applyDecision(true);
        diag.current_consent_state = 'relaxed_default_granted';
        debugLog('Relaxed mode — allowing analytics');
      }
    }

    updateTrackerDiag();
    detectExternalTrackingScripts();
    debugLog('Diagnostics:', diag);
  }

  // ── External tracking script detection (lightweight) ───────
  function detectExternalTrackingScripts() {
    var detected = [];
    try {
      if (window.fbq) detected.push('Meta Pixel (fbq)');
      if (window.gtag) detected.push('Google Analytics (gtag)');
      if (window.dataLayer && window.dataLayer.length > 0) detected.push('Google Tag Manager (dataLayer)');
    } catch (e) {}
    diag.external_tracking_scripts = detected;
    if (detected.length > 0) {
      debugLog('⚠️ Additional tracking scripts detected:', detected.join(', '));
    }
  }

  // ── Boot ────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', function () {
    if (!diag.dom_mount_attempted) {
      debugLog('Init did not run by window.load — running now');
      init();
    }
  });
})();
