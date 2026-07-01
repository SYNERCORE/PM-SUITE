// ── Session Timeout ────────────────────────────────────────────
// Auto-logout after configurable inactivity. Default 30 min; 0 = disabled.

let _sessionTimer = null;
let _sessionWarnTimer = null;
let _sessionWarnShown = false;
let _lastActivity = Date.now();

function _getSessionTimeout() {
  const mins = parseInt(AppState.data?.settings?.sessionTimeout ?? 30);
  return isNaN(mins) ? 30 : mins;
}

function _resetSessionTimer() {
  _lastActivity = Date.now();
  if (_sessionWarnShown) {
    _sessionWarnShown = false;
    clearInterval(window._sessionCountdownInterval);
    try { if (typeof closeModal==='function') closeModal('sessionWarnModal'); } catch(_) {}
  }
}

function _showSessionWarning(secsLeft) {
  // Build a dedicated modal (not genericModal) so it doesn't stomp open modals
  let m = document.getElementById('sessionWarnModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'sessionWarnModal';
    m.className = 'modal';
    m.innerHTML = `<div class="modal-overlay" onclick="_resetSessionTimer()"></div>
      <div class="modal-container" style="max-width:360px;text-align:center">
        <div style="font-size:28px;color:var(--accent-amber);margin-bottom:10px"><i class="fas fa-clock"></i></div>
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Session Expiring</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">You'll be signed out due to inactivity in</div>
        <div id="_swCountdown" style="font-size:36px;font-weight:700;font-family:var(--font-mono);color:var(--accent-amber);margin-bottom:18px">${secsLeft}s</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" onclick="_resetSessionTimer()"><i class="fas fa-hand-paper"></i> Stay Signed In</button>
          <button class="btn btn-secondary" onclick="if(typeof doLogout==='function')doLogout()">Sign Out</button>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  m.classList.add('open');
  let secs = secsLeft;
  clearInterval(window._sessionCountdownInterval);
  window._sessionCountdownInterval = setInterval(() => {
    secs--;
    const el = document.getElementById('_swCountdown');
    if (el) { el.textContent = secs + 's'; el.style.color = secs <= 30 ? 'var(--accent-red)' : 'var(--accent-amber)'; }
    if (secs <= 0) clearInterval(window._sessionCountdownInterval);
  }, 1000);
}

function _startSessionTimer() {
  _stopSessionTimer();
  const mins = _getSessionTimeout();
  if (!mins || mins <= 0) return; // disabled
  const warnMs = (mins - 2) * 60 * 1000;
  const logoutMs = mins * 60 * 1000;

  _sessionTimer = setInterval(() => {
    if (!_m365LoggedIn) { _stopSessionTimer(); return; }
    const idle = Date.now() - _lastActivity;
    if (!_sessionWarnShown && warnMs > 0 && idle >= warnMs) {
      _sessionWarnShown = true;
      _showSessionWarning(Math.round((logoutMs - idle) / 1000));
    }
    if (idle >= logoutMs) {
      _stopSessionTimer();
      if (typeof closeModal === 'function') try { closeModal('sessionWarnModal'); } catch(_) {}
      showToast('Session expired — signing out.', 'warning', 4000);
      setTimeout(() => { if (typeof doLogout === 'function') doLogout(); }, 1500);
    }
  }, 10000); // check every 10 seconds
}

function _stopSessionTimer() {
  clearInterval(_sessionTimer);
  clearInterval(_sessionWarnTimer);
  _sessionTimer = null;
  _sessionWarnShown = false;
}

// Track any user interaction to reset the idle clock
['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(evt => {
  document.addEventListener(evt, _resetSessionTimer, { passive: true });
});
