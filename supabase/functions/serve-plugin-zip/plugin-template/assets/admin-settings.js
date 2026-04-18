/* ACTV TRKR — Admin Settings interactions
 * Handles: tool buttons, copy modals, conditional field visibility,
 * connection/sync/links AJAX. Vanilla JS, no jQuery dependency.
 */
(function () {
  'use strict';

  var cfg = window.mmSettingsAdmin || {};
  if (!cfg.ajaxurl) return;

  // ── Helpers ─────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function ajax(action, nonceKey) {
    var nonce = cfg.nonces ? cfg.nonces[nonceKey] : '';
    return fetch(cfg.ajaxurl + '?action=' + encodeURIComponent(action) + '&_wpnonce=' + encodeURIComponent(nonce))
      .then(function (r) { return r.json(); });
  }

  function setResult(el, ok, msg) {
    if (!el) return;
    el.textContent = (ok ? '✅ ' : '❌ ') + msg;
    el.style.color = ok ? '#047857' : '#b91c1c';
  }

  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var orig = btn.dataset.origLabel || btn.textContent;
      btn.dataset.origLabel = orig;
      btn.textContent = '✅ Copied';
      setTimeout(function () { btn.textContent = orig; }, 1800);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallback(text); done();
      });
    } else {
      fallback(text); done();
    }
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ── Tool buttons (General + Tools tabs) ─────────────────
  function bindTool(btnId, resultId, action, nonceKey, formatter) {
    var btn = document.getElementById(btnId);
    var out = document.getElementById(resultId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      if (out) { out.textContent = 'Working…'; out.style.color = '#64748b'; }
      ajax(action, nonceKey).then(function (d) {
        if (d && d.success) {
          setResult(out, true, formatter ? formatter(d.data) : 'Success');
        } else {
          setResult(out, false, (d && d.data) || 'Failed');
        }
      }).catch(function () {
        setResult(out, false, 'Request failed');
      }).finally(function () {
        btn.disabled = false;
      });
    });
  }
  bindTool('mm-test-btn',  'mm-test-result',  'mm_test_connection', 'test',
    function () { return 'Connected'; });
  bindTool('mm-sync-btn',  'mm-sync-result',  'mm_sync_forms', 'sync',
    function (d) { return 'Discovered ' + d.discovered + ' form(s), synced ' + d.synced + '.'; });
  bindTool('mm-links-btn', 'mm-links-result', 'mm_scan_broken_links', 'links',
    function (d) { return 'Checked ' + d.pages_checked + ' page(s), found ' + d.broken_found + ' broken link(s).'; });

  // ── Copy-text modals ────────────────────────────────────
  $$('[data-mm-open-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-mm-open-modal');
      var dlg = document.getElementById(id);
      if (dlg && typeof dlg.showModal === 'function') {
        dlg.showModal();
      } else if (dlg) {
        dlg.setAttribute('open', 'open');
      }
    });
  });
  $$('.mm-modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dlg = btn.closest('dialog');
      if (dlg && typeof dlg.close === 'function') dlg.close();
      else if (dlg) dlg.removeAttribute('open');
    });
  });
  $$('.mm-copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-mm-copy-target');
      var src = targetId ? document.getElementById(targetId) : null;
      if (!src) return;
      copyText(src.value || src.textContent || '', btn);
    });
  });

  // ── Conditional visibility ──────────────────────────────
  function toggleConditionals() {
    // Compliance mode → Other Regions Fallback + US controls
    var modeEl = document.querySelector('[name="mm_consent_banner[compliance_mode]"]');
    var bannerEnabledEl = document.querySelector('[name="mm_consent_banner[enabled]"]');
    var consentModeEl = document.querySelector('[name="mm_consent_banner_mode]"]') || document.getElementById('mm-consent-source');
    var bannerSection = document.querySelector('[data-mm-section="banner-content"]');
    var bannerDisplay = document.querySelector('[data-mm-section="banner-display"]');
    var fallbackRow = document.querySelector('[data-mm-row="other-fallback"]');
    var usSection   = document.querySelector('[data-mm-section="us-controls"]');

    var mode = modeEl ? modeEl.value : 'global_strict';
    var bannerOn = bannerEnabledEl ? bannerEnabledEl.checked : false;
    var consentSrc = (document.getElementById('mm-consent-source') || {}).value || 'builtin';

    if (fallbackRow) fallbackRow.hidden = (mode === 'global_strict');
    if (usSection)   usSection.hidden   = (mode === 'global_strict');

    // Banner content/display only when source = builtin AND enabled
    var showBanner = (consentSrc === 'builtin') && bannerOn;
    if (bannerSection) bannerSection.hidden = !showBanner;
    if (bannerDisplay) bannerDisplay.hidden = !showBanner;
  }

  $$('[name="mm_consent_banner[compliance_mode]"], [name="mm_consent_banner[enabled]"], #mm-consent-source')
    .forEach(function (el) { el.addEventListener('change', toggleConditionals); });

  // Consent source radio: when "disabled" or "external", uncheck the
  // built-in banner and keep it that way.
  var sourceEl = document.getElementById('mm-consent-source');
  if (sourceEl) {
    sourceEl.addEventListener('change', function () {
      var bannerEnabledEl = document.querySelector('[name="mm_consent_banner[enabled]"]');
      if (!bannerEnabledEl) return;
      if (sourceEl.value === 'builtin') {
        bannerEnabledEl.checked = true;
      } else {
        bannerEnabledEl.checked = false;
      }
      toggleConditionals();
    });
  }

  toggleConditionals();
})();
