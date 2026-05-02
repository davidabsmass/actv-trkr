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
  function getBannerEnabledField() {
    return document.querySelector('input[type="checkbox"][name="mm_consent_banner[enabled]"]');
  }

  function getConsentSource() {
    var checked = document.querySelector('input[name="mm_consent_source"]:checked');
    return checked ? checked.value : 'builtin';
  }

  function syncConsentSourceToBannerToggle() {
    var bannerEnabledEl = getBannerEnabledField();
    if (!bannerEnabledEl) return;
    bannerEnabledEl.checked = (getConsentSource() === 'builtin');
  }

  function toggleConditionals() {
    // Compliance mode → Other Regions Fallback + US controls
    var modeEl = document.querySelector('[name="mm_consent_banner[compliance_mode]"]');
    var bannerEnabledEl = getBannerEnabledField();
    var bannerSection = document.querySelector('[data-mm-section="banner-content"]');
    var bannerDisplay = document.querySelector('[data-mm-section="banner-display"]');
    var fallbackRow = document.querySelector('[data-mm-row="other-fallback"]');
    var usSection   = document.querySelector('[data-mm-section="us-controls"]');

    var mode = modeEl ? modeEl.value : 'global_strict';
    var bannerOn = bannerEnabledEl ? bannerEnabledEl.checked : false;
    var consentSrc = getConsentSource();

    if (fallbackRow) fallbackRow.hidden = (mode === 'global_strict');
    if (usSection)   usSection.hidden   = (mode === 'global_strict');

    // Banner content/display only when source = builtin AND enabled
    var showBanner = (consentSrc === 'builtin') && bannerOn;
    if (bannerSection) bannerSection.hidden = !showBanner;
    if (bannerDisplay) bannerDisplay.hidden = !showBanner;
  }

  $$('[name="mm_consent_banner[compliance_mode]"], input[name="mm_consent_source"], input[type="checkbox"][name="mm_consent_banner[enabled]"]')
    .forEach(function (el) { el.addEventListener('change', toggleConditionals); });

  $$('input[name="mm_consent_source"]').forEach(function (sourceEl) {
    sourceEl.addEventListener('change', function () {
      syncConsentSourceToBannerToggle();
      toggleConditionals();
    });
  });

  syncConsentSourceToBannerToggle();
  toggleConditionals();

  // ── Connection hero card ────────────────────────────────
  // Renders + polls the live connection status set by the activation
  // self-test cron (and by the Re-test button below).
  var hero = $('[data-mm-hero]');
  if (hero) {
    var titleEl   = $('.mm-hero-title', hero);
    var msgEl     = $('.mm-hero-msg', hero);
    var metaEl    = $('.mm-hero-meta', hero);
    var dashBtn   = $('.mm-hero-dashboard', hero);
    var retestBtn = $('.mm-hero-retest', hero);
    var initial   = {};
    try { initial = JSON.parse(($('.mm-hero-initial', hero) || {}).textContent || '{}'); } catch (e) {}

    var pollTimer = null;
    var pollCount = 0;
    var POLL_MAX  = 12; // ~48s at 4s interval

    function fmtAgo(ts) {
      if (!ts) return '';
      var s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
      if (s < 5) return 'just now';
      if (s < 60) return s + 's ago';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      return h + 'h ago';
    }

    function render(state) {
      var status = state.status || 'unknown';
      hero.dataset.status = status;
      var siteId = state.site_id ? String(state.site_id) : '';
      var siteIdShort = siteId ? (siteId.length > 12 ? siteId.slice(0, 8) + '…' : siteId) : '';
      var domain = state.domain || initial.domain || '';
      var http = state.http || state.http_code || 0;
      var err = state.error || '';

      if (status === 'success') {
        titleEl.textContent = 'Connected — reporting as ' + (domain || 'this site');
        msgEl.textContent   = state.message || 'Your dashboard is receiving signals from this site.';
        metaEl.textContent  = (siteIdShort ? 'Site ID: ' + siteIdShort + '   ·   ' : '') + 'Last signal: ' + fmtAgo(state.last);
        if (dashBtn) dashBtn.style.display = '';
        retestBtn.textContent = 'Re-test connection';
      } else if (status === 'failure') {
        titleEl.textContent = "Couldn't reach your ACTV TRKR dashboard";
        msgEl.textContent   = (http ? 'HTTP ' + http + ' — ' : '') + (err || 'Connection test failed.');
        metaEl.textContent  = state.last ? 'Last attempt: ' + fmtAgo(state.last) : '';
        if (dashBtn) dashBtn.style.display = 'none';
        retestBtn.textContent = 'Retry connection';
      } else if (status === 'awaiting_key') {
        titleEl.textContent = 'Paste your API key to connect';
        msgEl.textContent   = 'Enter the key from your ACTV TRKR dashboard above, then click Save Changes.';
        metaEl.textContent  = '';
        if (dashBtn) dashBtn.style.display = 'none';
        retestBtn.textContent = 'Test connection';
      } else {
        // pending / unknown
        titleEl.textContent = 'Connecting ' + (domain || 'this site') + ' to ACTV TRKR…';
        msgEl.textContent   = state.message || "We're sending a test signal. This usually takes a few seconds.";
        metaEl.textContent  = state.last ? 'Last attempt: ' + fmtAgo(state.last) : '';
        if (dashBtn) dashBtn.style.display = 'none';
        retestBtn.textContent = 'Check now';
      }
    }

    function poll() {
      var nonce = hero.dataset.stateNonce;
      fetch(cfg.ajaxurl + '?action=mm_connection_state&_wpnonce=' + encodeURIComponent(nonce), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.success && j.data) {
            var s = j.data;
            render({
              status: s.status, domain: s.domain, site_id: s.site_id,
              http: s.http_code, error: s.error, message: s.message, last: s.last_attempt_at,
            });
            if (s.status === 'pending' && pollCount < POLL_MAX) {
              pollCount += 1;
              pollTimer = setTimeout(poll, 4000);
            } else {
              pollTimer = null;
            }
          }
        })
        .catch(function () { pollTimer = null; });
    }

    function startPollIfPending() {
      if (hero.dataset.status === 'pending') {
        pollCount = 0;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, 2000);
      }
    }

    retestBtn.addEventListener('click', function () {
      retestBtn.disabled = true;
      retestBtn.textContent = 'Testing…';
      hero.dataset.status = 'pending';
      render({ status: 'pending', domain: initial.domain, message: 'Sending test signal…', last: Math.floor(Date.now() / 1000) });
      var fd = new FormData();
      fd.append('action', 'mm_test_connection');
      fd.append('_wpnonce', hero.dataset.testNonce);
      fetch(cfg.ajaxurl, { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          retestBtn.disabled = false;
          var st = (j && j.data && j.data.state) ? j.data.state : null;
          if (st) {
            render({
              status: st.status, domain: st.domain, site_id: st.site_id,
              http: st.http_code, error: st.error, message: st.message, last: st.last_attempt_at,
            });
          } else {
            // Soft-poll to pick up whatever was written.
            poll();
          }
        })
        .catch(function () {
          retestBtn.disabled = false;
          render({ status: 'failure', error: 'Network error during connection test.', last: Math.floor(Date.now() / 1000) });
        });
    });

    // Initial paint + start polling if cron hasn't finished yet.
    render({
      status: initial.status, domain: initial.domain, site_id: initial.site_id,
      http: initial.http, error: initial.error, message: initial.message, last: initial.last,
    });
    startPollIfPending();
  }
})();
