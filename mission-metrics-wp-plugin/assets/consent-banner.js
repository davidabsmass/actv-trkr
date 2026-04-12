/**
 * ACTV TRKR Built-in Consent Banner
 * Integrates with the existing window.mmConsent API in tracker.js.
 * No third-party dependencies. Lightweight, accessible, GDPR-safe.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var CFG = window.mmConsentBannerConfig;
  if (!CFG || !CFG.enabled) return;

  var COOKIE_NAME = 'mm_consent_decision';
  var CONSENT_VERSION = '1'; // bump to re-prompt after policy changes

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
      if (d && d.v === CONSENT_VERSION) return d;
    } catch (e) {}
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
    if (!window.mmConsent) return;
    if (analytics) {
      window.mmConsent.grant();
    } else {
      window.mmConsent.revoke();
    }
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

    document.body.appendChild(bannerEl);
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

    document.body.appendChild(overlayEl);
    document.body.appendChild(modalEl);
  }

  function openModal() {
    var decision = getDecision();
    analyticsToggle.checked = decision ? decision.analytics : false;
    overlayEl.classList.add('mm-cb-visible');
    modalEl.classList.add('mm-cb-visible');
    modalEl.focus();
    // Trap focus
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
  }

  function showBanner() {
    if (bannerEl) bannerEl.classList.add('mm-cb-visible');
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove('mm-cb-visible');
  }

  // ── Footer reopener ─────────────────────────────────────────

  function addReopener() {
    // Look for a placeholder the theme can provide, or auto-add
    var existing = document.getElementById('mm-cookie-settings');
    if (existing) {
      existing.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
      existing.setAttribute('role', 'button');
      existing.setAttribute('tabindex', '0');
      return;
    }
    // If CFG.showReopener is false, skip auto-inject
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
  };

  // ── Escape helper ───────────────────────────────────────────

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ── Init ────────────────────────────────────────────────────

  function init() {
    buildBanner();
    buildModal();
    addReopener();

    var decision = getDecision();
    if (decision) {
      // Already decided — apply silently, no banner
      applyDecision(decision.analytics);
    } else {
      // No decision yet — show banner
      showBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
