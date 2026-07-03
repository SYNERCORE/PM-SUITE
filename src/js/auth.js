async function doM365Login() {
  const clientId = _spClientId || localStorage.getItem('shic_sp_clientid') || '';
  const siteUrl = _spSiteUrl || localStorage.getItem('shic_sp_siteurl') || '';
  if (!clientId || !siteUrl) {
    showAuthForm('setup');
    return;
  }
  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Signing in...'; }
  const alertEl = document.getElementById('authAlert');
  if (alertEl) alertEl.style.display = 'none';
  try {
    const msalApp = initM365AuthMsal();
    if (!msalApp) throw new Error('MSAL not initialized — check Client ID');
    if (msalApp.initialize) await msalApp.initialize().catch(()=>{});
    // Try silent first (returning user)
    let authResult;
    const accounts = msalApp.getAllAccounts ? msalApp.getAllAccounts() : [];
    if (accounts.length > 0) {
      try {
        authResult = await msalApp.acquireTokenSilent({ scopes: M365_AUTH_SCOPES, account: accounts[0] });
        _m365Account = accounts[0];
      } catch(e) {
        authResult = await msalApp.loginPopup({ scopes: M365_AUTH_SCOPES, prompt: 'select_account' });
        _m365Account = authResult.account;
      }
    } else {
      authResult = await msalApp.loginPopup({ scopes: M365_AUTH_SCOPES, prompt: 'select_account' });
      _m365Account = authResult.account;
    }
    const token = authResult.accessToken;
    // ── Resolve SP site ──────────────────────────────────
    // Initialize SP sync MSAL with same credentials
    _spClientId = clientId; _spSiteUrl = siteUrl;
    _spMsalApp = msalApp; _spAccount = _m365Account; _spConnected = true;
    _spAutoSync = true;
    localStorage.setItem('shic_sp_autosync', 'true');
    await spResolveSiteAndList(token);
    const siteId = _spSiteId;
    // ── Get user info from MS Graph ──────────────────────
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + token } });
    const me = await meRes.json();
    const email = me.mail || me.userPrincipalName || _m365Account.username;
    const name = me.displayName || _m365Account.name || email.split('@')[0];
    const uid = me.id || _m365Account.localAccountId;
    // ── Check/create user profile in SharePoint ──────────
    const existingItem = await m365GetUserProfile(token, siteId, email);
    let profile;
    if (!existingItem) {
      // New user — check if this is the very first user (make them admin)
      const allUsers = await m365GetAllUsers();
      const hasApprovedAdmin = allUsers.some(u => u.isAdmin && u.status === 'approved' && u.uid !== uid);
      const isFirstUser = allUsers.length === 0;
      profile = {
        uid, email, name,
        status: isFirstUser ? 'approved' : 'pending',
        isAdmin: isFirstUser,
        role: isFirstUser ? 'Admin' : 'User',
        department: '',
        registeredAt: new Date().toISOString(),
        approvedBy: isFirstUser ? 'system (first user)' : '',
      };
      await m365SaveUserProfile(token, siteId, profile, null);
      if (isFirstUser) showToast('Welcome ' + name + '! You are the first user and have been set as Admin.', 'success', 5000);
    } else {
      profile = {
        uid: existingItem.fields?.UserUID || uid,
        itemId: existingItem.id,
        name: existingItem.fields?.Title || name,
        email: existingItem.fields?.UserEmail || email,
        status: existingItem.fields?.Status || 'pending',
        isAdmin: existingItem.fields?.IsAdmin === 'true',
        role: existingItem.fields?.Role || 'User',
        department: existingItem.fields?.Department || '',
        registeredAt: existingItem.fields?.RegisteredAt || '',
        approvedBy: existingItem.fields?.ApprovedBy || '',
      };
      // Update last login
      await m365SaveUserProfile(token, siteId, profile, existingItem.id);
    }
    // ── Handle access based on status ───────────────────
    if (profile.status === 'rejected' || profile.status === 'suspended') {
      showAuthForm('rejected');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-microsoft" style="font-size:16px"></i>Sign in with Microsoft 365'; }
      return;
    }
    if (profile.status === 'pending') {
      // Check if no admin exists — show self-approve button
      const allUsers2 = await m365GetAllUsers();
      const hasAdmin = allUsers2.some(u => u.isAdmin && u.status === 'approved' && u.uid !== uid);
      showAuthForm('pending');
      const pendingInfo = document.getElementById('pendingUserInfo');
      if (pendingInfo) pendingInfo.innerHTML = `Signed in as <strong>${email}</strong>.<br>Your account is pending admin approval.<br>An administrator will review and approve your access.`;
      const selfApproveBtn = document.getElementById('pendingSelfApprove');
      if (selfApproveBtn) selfApproveBtn.style.display = hasAdmin ? 'none' : 'block';
      // Store temp profile for self-approve
      window._m365PendingProfile = { profile, itemId: existingItem?.id || null, siteId, token };
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-microsoft" style="font-size:16px"></i>Sign in with Microsoft 365'; }
      return;
    }
    // ── Approved — enter the app ─────────────────────────
    _currentUser = { uid, email, displayName: name };
    _currentUserProfile = { ...profile, name, email, uid };
    _m365LoggedIn = true;
    // Initialize AES-GCM encryption key tied to this user's M365 UID
    if (typeof _initEncryption === 'function') await _initEncryption(uid);
    // One-time cleanup of legacy base64 file data
    try { _cleanupLegacyFileData(); } catch(e) { console.warn('Cleanup error:', e); }
    // Update sidebar
    const sidebarLabel = document.getElementById('sidebarUserLabel');
    if (sidebarLabel) sidebarLabel.textContent = name + (profile.isAdmin ? ' · Admin' : '');
    showAuthOverlay(false);
    // Boot — try decrypting local data; fall back to plaintext if key missing
    if (typeof _decryptFromStorage === 'function') {
      const decJson = await _decryptFromStorage();
      if (decJson) {
        try { AppState.data = JSON.parse(decJson); } catch(e) { _restoreLocalData(); }
      } else { _restoreLocalData(); }
    } else { _restoreLocalData(); }
    // Now that the encryption key exists, adopt the IndexedDB full-data
    // mirror if it holds more records than the localStorage bootstrap
    // (covers quota-trimmed or corrupt localStorage with an encrypted mirror)
    if (typeof _idbAdoptIfFuller === 'function') { try { await _idbAdoptIfFuller(); } catch(e) {} }
    // Migrate existing plaintext pm_data → encrypted now that key is ready
    if (typeof _encryptAndStore === 'function' && _cryptoKey) {
      const raw = localStorage.getItem('pm_data');
      if (raw) { try { const p=JSON.parse(raw); if(!p.__enc) _encryptAndStore(JSON.stringify(AppState.data)); } catch(e){} }
    }
    if (typeof migrateData === 'function') migrateData();
    if (typeof buildSidebar === 'function') buildSidebar();
    navigate(AppState.currentPage || 'dashboard');
    showToast('Welcome, ' + name + '!', 'success', 3000);
    // Start session inactivity timer
    if (typeof _startSessionTimer === 'function') _startSessionTimer();
    // Write login event to SP audit log (fire-and-forget)
    if (typeof spWriteAuditLog === 'function') spWriteAuditLog('login', 'session', uid, name, { email });
    // Initialize SharePoint sync
    if (typeof spAutoInit === 'function') spAutoInit().catch(e => console.warn('[SP] Auto-init error:', e.message));
  } catch(e) {
    console.error('[M365 Auth] Login error:', e);
    if (e.errorCode === 'user_cancelled' || e.message?.includes('cancelled')) {
      // User closed popup — silent fail
    } else {
      if (alertEl) {
        alertEl.style.display = 'block';
        alertEl.style.cssText += ';background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:#f85149';
        alertEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>' + (e.message || 'Sign-in failed. Try again.');
      }
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-microsoft" style="font-size:16px"></i>Sign in with Microsoft 365'; }
  }
}

// ── Setup & Login (first time) ──────────────────────────────
function setupAndLogin() {
  const clientId = (document.getElementById('setupClientId')?.value || '').trim();
  const siteUrl = (document.getElementById('setupSiteUrl')?.value || '').trim();
  if (!clientId) { showToast('Client ID is required', 'error'); return; }
  if (!siteUrl) { showToast('SharePoint Site URL is required', 'error'); return; }
  _spClientId = clientId; _spSiteUrl = siteUrl;
  localStorage.setItem('shic_sp_clientid', clientId);
  localStorage.setItem('shic_sp_siteurl', siteUrl);
  _spSiteId = ''; _spListId = ''; _spItemId = ''; _usersListId = null;
  localStorage.removeItem('shic_sp_siteid'); localStorage.removeItem('shic_sp_listid'); localStorage.removeItem('shic_sp_itemid');
  _spMsalApp = null; _m365AuthMsal = null;
  showToast('Settings saved — opening Microsoft login...', 'success', 2000);
  setTimeout(doM365Login, 500);
}

// ── Self-approve as admin (M365 version) ────────────────────
async function selfApproveAsAdmin() {
  const pending = window._m365PendingProfile;
  if (!pending) { showToast('Session expired — please sign in again', 'error'); return; }
  if (!confirm('Approve yourself as Admin? Only do this if you are the FIRST user and no admin exists yet.')) return;
  try {
    // Double-check no admin exists
    const allUsers = await m365GetAllUsers();
    const hasAdmin = allUsers.some(u => u.isAdmin && u.status === 'approved' && u.uid !== pending.profile.uid);
    if (hasAdmin) {
      showToast('An admin already exists — contact them for approval.', 'error', 5000);
      document.getElementById('pendingSelfApprove').style.display = 'none';
      return;
    }
    const updatedProfile = { ...pending.profile, status: 'approved', isAdmin: true, role: 'Admin', approvedBy: 'self (first admin)' };
    await m365SaveUserProfile(pending.token, pending.siteId, updatedProfile, pending.itemId);
    window._m365PendingProfile = null;
    showToast('Approved as Admin! Entering app...', 'success');
    // Re-run login flow
    setTimeout(doM365Login, 800);
  } catch(e) { showToast('Self-approve failed: ' + e.message, 'error'); }
}

// ── Auto-login on page load (silent token) ──────────────────
async function m365AutoLogin() {
  // ── ALWAYS show login screen — never auto sign in ──────
  // User must explicitly click "Sign in with Microsoft" each session.
  // This prevents data conflicts and surprises after logout.
  const clientId = _spClientId || localStorage.getItem('shic_sp_clientid') || '';
  const siteUrl = _spSiteUrl || localStorage.getItem('shic_sp_siteurl') || '';
  showAuthOverlay(true);
  showAuthForm('login');
  if (!clientId || !siteUrl) {
    // No SP configured — show setup prompt
    const setupPrompt = document.getElementById('authSetupPrompt');
    if (setupPrompt) setupPrompt.style.display = 'block';
    return;
  }
  // Initialize MSAL silently so the "Sign in" button works fast on first click
  try {
    const msalApp = initM365AuthMsal();
    if (msalApp && msalApp.initialize) await msalApp.initialize().catch(()=>{});
    console.log('[M365 Auth] MSAL ready — waiting for user to click Sign in');
  } catch(e) {
    console.warn('[M365 Auth] MSAL init failed:', e.message);
  }
}

function showAuthForm(form){
  ['login','register','forgot','pending','setup','rejected'].forEach(f=>{
    const el=document.getElementById('authForm'+f.charAt(0).toUpperCase()+f.slice(1));
    if(el)el.style.display=f===form?'block':'none';
  });
  ['authAlert','authAlertReg','authAlertForgot'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.style.display='none';
  });
  if(form==='login'){
    const setupPrompt=document.getElementById('authSetupPrompt');
    if(setupPrompt){
      const hasSetup=!!((_spClientId||localStorage.getItem('shic_sp_clientid'))&&(_spSiteUrl||localStorage.getItem('shic_sp_siteurl')));
      setupPrompt.style.display=hasSetup?'none':'block';
    }
  }
  // Pre-fill saved Client ID / Site URL into the setup form
  if(form==='setup'){
    const c=document.getElementById('setupClientId');
    const s=document.getElementById('setupSiteUrl');
    if(c)c.value=localStorage.getItem('shic_sp_clientid')||_spClientId||'';
    if(s)s.value=localStorage.getItem('shic_sp_siteurl')||_spSiteUrl||'';
  }
}

function showAuthOverlay(show){
  const ov=document.getElementById('authOverlay');
  if(ov)ov.style.display=show?'flex':'none';
}

function authAlert(id,msg,type){
  const el=document.getElementById(id);
  if(!el)return;
  el.style.display='block';
  el.style.background=type==='error'?'rgba(248,81,73,.15)':'rgba(63,185,80,.15)';
  el.style.border='1px solid '+(type==='error'?'rgba(248,81,73,.4)':'rgba(63,185,80,.4)');
  el.style.color=type==='error'?'#f85149':'#3fb950';
  el.innerHTML=`<i class="fas ${type==='error'?'fa-exclamation-triangle':'fa-check-circle'}" style="margin-right:7px"></i>${msg}`;
}

function setBtnLoading(id,loading,text='Sign in'){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.disabled=loading;
  btn.innerHTML=loading?'<i class="fas fa-spinner fa-spin" style="margin-right:7px"></i>Please wait...':text;
  btn.style.opacity=loading?'.7':'1';
}

function togglePassView(inputId,iconId){
  const inp=document.getElementById(inputId);
  const ico=document.getElementById(iconId);
  if(!inp||!ico)return;
  inp.type=inp.type==='password'?'text':'password';
  ico.className=inp.type==='password'?'fas fa-eye':'fas fa-eye-slash';
  ico.style.cssText=ico.style.cssText; // no-op to trigger update
}

function updateSidebarUser(profile){
  const logoEl=document.getElementById('sidebarUserLabel')||document.querySelector('.logo-sub');
  if(logoEl&&profile)logoEl.textContent=profile.name+' · '+(profile.isAdmin?'Admin':profile.role||'User');
}

function doLogout(){
  if(!confirm('Sign out of SHIC?'))return;
  doLogoutAsync().catch(e => console.error('[SHIC] Logout error:', e));
}

async function doLogoutAsync(){
  // ── 0. Persist local data immediately (always survives sign-out) ──
  try {
    if (typeof _origSaveForOffline === 'function') _origSaveForOffline();
    else AppState.save();
  } catch (e) { console.warn('[SHIC] Local save on logout failed:', e); }

  const localCount = _dataRecordCount(AppState.data);

  // ── 1. Flush to SharePoint BEFORE tearing down connection ──
  if (_spConnected && _spAccount && (localCount > 0 || _spHasLocalEdits())) {
    clearTimeout(_spSyncTimer);
    try {
      showToast('Saving to SharePoint before sign out...', 'info', 3000);
      const pushed = await spPushData(true);
      if (!pushed) {
        _spOfflineQueue = true;
        localStorage.setItem('shic_sp_offlinequeue', '1');
        showToast('SharePoint sync failed — data saved locally, will retry on next login', 'warning', 5000);
      }
    } catch (e) {
      console.warn('[SHIC] Logout SP push failed:', e);
      _spOfflineQueue = true;
      localStorage.setItem('shic_sp_offlinequeue', '1');
      showToast('Data saved locally — will sync to SharePoint on next login', 'warning', 5000);
    }
  }

  // ── 2. Stop all timers to prevent callbacks firing after logout ──
  clearTimeout(_spSyncTimer);
  clearTimeout(_spRetryTimer);
  clearInterval(_spPollingTimer);
  clearInterval(window._tokenRefreshInterval);
  _spPollingTimer = null;

  // ── 3. Stop SP polling ──
  spStopPolling();

  // ── 4. Reset app state (keep _spLastWriteTs / _spDataHash / offline queue if push failed) ──
  _pendingEdits = false;
  _spConnected = false;
  _spAccount = null;
  _spMsalApp = null;
  _m365Account = null;
  _m365AuthMsal = null;
  _m365LoggedIn = false;
  _cryptoKey = null; // discard in-memory key — localStorage data remains encrypted
  if (typeof _stopSessionTimer === 'function') _stopSessionTimer();
  _usersListId = null;
  if (!_spOfflineQueue) {
    _spLastSavedHash = '';
  }
  _spPrevData = null;
  _spPendingRemote = null;
  // DO NOT clear _spLastWriteTs or _spDataHash — needed for safe merge on next login
  _spSiteId = ''; _spListId = ''; _spItemId = '';
  localStorage.removeItem('shic_sp_siteid');
  localStorage.removeItem('shic_sp_listid');
  localStorage.removeItem('shic_sp_itemid');
  if(typeof _currentUser !== 'undefined') _currentUser = null;
  if(typeof _currentUserProfile !== 'undefined') _currentUserProfile = null;

  // ── 5. Sign out and show login screen ──────────────────
  try{
    if(_m365AuthMsal && _m365Account){
      await _m365AuthMsal.logoutPopup({ account: _m365Account }).catch(()=>{});
    }
  }catch(e){}
  showAuthOverlay(true);
  showAuthForm('login');
  console.log('[SHIC] Signed out — login screen shown');
}

// ── Admin: User Management ────────────────────────────────

function _renderUserTable(users){
  const pending=users.filter(u=>u.status==='pending');

  $('#userMgmtContent').innerHTML=`
  <div style="padding:8px 14px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:7px;margin-bottom:12px;font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">
    <i class="fas fa-info-circle" style="color:var(--accent-blue);flex-shrink:0"></i>
    <span><strong>Module Access</strong> button appears on each user row (except your own). It lets you block specific sidebar modules for that user. Admins always see all modules regardless.</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${[['fa-users','Total Users',users.length,'var(--accent-blue)'],
       ['fa-clock','Pending',pending.length,'var(--accent-amber)'],
       ['fa-check-circle','Approved',users.filter(u=>u.status==='approved').length,'var(--accent-green)'],
       ['fa-ban','Rejected/Suspended',users.filter(u=>u.status==='rejected'||u.status==='suspended').length,'var(--accent-red)'],
    ].map(([ic,l,v,c])=>`<div class="stat-card" style="border-left:3px solid ${c}">
      <div class="stat-icon" style="background:${c}22"><i class="fas ${ic}" style="color:${c}"></i></div>
      <div class="stat-info"><div class="label">${l}</div><div class="value" style="color:${c}">${v}</div></div>
    </div>`).join('')}
  </div>
  ${pending.length?`<div style="padding:10px 14px;background:rgba(240,164,80,.1);border:1px solid rgba(240,164,80,.3);border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--accent-amber)">
    <i class="fas fa-clock" style="margin-right:7px"></i><strong>${pending.length} user(s) pending approval</strong>
  </div>`:''}
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px">
    <button class="btn btn-secondary btn-sm" onclick="showAuditLog()" style="font-size:11px"><i class="fas fa-clipboard-list"></i> Audit Log</button>
    <button class="btn btn-primary btn-sm" onclick="showInviteModal()" style="font-size:11px"><i class="fas fa-user-plus"></i> Invite User</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>User</th><th>Email</th><th>Dept/Role</th><th>Status</th><th>Registered</th><th>Last Login</th><th>Admin</th><th>Actions</th></tr></thead>
    <tbody>${users.length?_pgSlice('users',users).map(u=>{
      const isMe=_currentUser&&u.uid===_currentUser.uid;
      const sb={approved:'badge-green',pending:'badge-amber',rejected:'badge-red',suspended:'badge-red'};
      return`<tr style="${isMe?'background:rgba(56,139,253,.06)':''}">
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:${stringToColor(u.uid)};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${(u.name||'?').charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:600;font-size:12px">${u.name||'—'}${isMe?' <span class="badge badge-blue" style="font-size:8px">you</span>':''}</div></div>
        </div></td>
        <td style="font-size:11px">${u.email}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${u.dept||'—'} / ${u.role||'User'}</td>
        <td><span class="badge ${sb[u.status]||'badge-gray'}">${u.status}</span></td>
        <td style="font-size:10px;font-family:var(--font-mono)">${u.createdAt?new Date(u.createdAt).toLocaleDateString():'-'}</td>
        <td style="font-size:10px;color:var(--text-secondary)">${u.lastLogin?new Date(u.lastLogin).toLocaleDateString():'-'}</td>
        <td><label class="toggle" style="width:34px;height:18px"><input type="checkbox" ${u.isAdmin?'checked':''} ${isMe?'disabled':''} onchange="toggleAdmin('${u.uid}',this.checked)"><span class="toggle-slider"></span></label></td>
        <td><div style="display:flex;gap:5px;flex-wrap:wrap">
          ${u.status==='pending'?`
          <button class="btn btn-success btn-sm" style="font-size:9px;padding:3px 8px" onclick="approveUser('${u.uid}','${u.name||'User'}','${u.email}')"><i class="fas fa-check"></i> Approve</button>
          <button class="btn btn-danger btn-sm" style="font-size:9px;padding:3px 8px" onclick="rejectUser('${u.uid}','${u.name||'User'}')"><i class="fas fa-times"></i> Reject</button>`:''}
          ${u.status==='approved'&&!isMe?`<button class="btn btn-warning btn-sm" style="font-size:9px;padding:3px 8px" onclick="suspendUser('${u.uid}','${u.name||'User'}')"><i class="fas fa-ban"></i> Suspend</button>`:''}
          ${(u.status==='rejected'||u.status==='suspended')?`<button class="btn btn-success btn-sm" style="font-size:9px;padding:3px 8px" onclick="approveUser('${u.uid}','${u.name||'User'}','${u.email}')"><i class="fas fa-redo"></i> Restore</button>`:''}
          ${!u.isAdmin?`<button class="btn btn-secondary btn-sm" style="font-size:9px;padding:3px 8px;white-space:nowrap;display:block;width:100%;margin-top:3px" onclick="showModuleAccess('${u.uid}','${(u.name||'User').replace(/'/g,'\'')}')" title="Module Access"><i class="fas fa-lock" style="margin-right:4px"></i>Module Access</button>`:''}
          ${!isMe?`<button class="btn btn-danger btn-sm btn-icon" onclick="deleteUser('${u.uid}','${u.name||'User'}')" title="Delete"><i class="fas fa-trash"></i></button>`:''}
        </div></td>
      </tr>`;}).join(''):`<tr><td colspan="8"><div class="empty-state"><p>No users registered yet.</p></div></td></tr>`}
    </tbody>
  </table></div>
  ${users.length<=1?`<div style="margin-top:12px;padding:14px;background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.15);border-radius:8px;font-size:12px;color:var(--text-secondary)">
    <i class="fas fa-users" style="color:var(--accent-blue);margin-right:8px"></i>
    <strong>No other users yet.</strong> Use the <strong>Invite User</strong> button above to pre-register teammates —
    they can sign in immediately with their Microsoft 365 account without waiting for approval.
  </div>`:''}
  <div id="inviteUserModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center">
    <div style="background:var(--bg-card);border-radius:12px;padding:24px;width:380px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <div style="font-weight:700;font-size:15px;margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <i class="fas fa-user-plus" style="color:var(--accent-blue)"></i> Invite New User
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:14px;padding:8px 10px;background:rgba(56,139,253,.07);border-radius:6px">
        Enter the user's Microsoft 365 email. When they sign in, they'll be automatically approved.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Full Name <span style="color:var(--accent-red)">*</span></label>
          <input id="inviteName" class="form-control" style="font-size:12px" placeholder="e.g. Juan Dela Cruz">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">M365 Email <span style="color:var(--accent-red)">*</span></label>
          <input id="inviteEmail" class="form-control" style="font-size:12px" placeholder="e.g. juan@company.com" type="email">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Department</label>
            <input id="inviteDept" class="form-control" style="font-size:12px" placeholder="e.g. Warehouse">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Role</label>
            <select id="inviteRole" class="form-control" style="font-size:12px">
              <option value="User">User</option>
              <option value="Viewer">Viewer</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:2px">
          <input type="checkbox" id="inviteAdmin" style="width:14px;height:14px">
          Grant Admin privileges
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="closeInviteModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveInvitedUser()"><i class="fas fa-paper-plane"></i> Add &amp; Pre-approve</button>
      </div>
    </div>
  </div>`;
}


function showInviteModal(){
  const m=document.getElementById('inviteUserModal');
  if(m){m.style.display='flex';['inviteName','inviteEmail','inviteDept'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const r=document.getElementById('inviteRole');if(r)r.value='User';const a=document.getElementById('inviteAdmin');if(a)a.checked=false;}
}
function closeInviteModal(){
  const m=document.getElementById('inviteUserModal');
  if(m)m.style.display='none';
}
async function saveInvitedUser(){
  const name=(document.getElementById('inviteName')?.value||'').trim();
  const email=(document.getElementById('inviteEmail')?.value||'').trim().toLowerCase();
  const dept=(document.getElementById('inviteDept')?.value||'').trim();
  const role=document.getElementById('inviteRole')?.value||'User';
  const isAdmin=document.getElementById('inviteAdmin')?.checked||role==='Admin';
  if(!name||!email){showToast('Name and email are required.','error');return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showToast('Enter a valid M365 email address.','error');return;}
  try{
    const token=await getM365AuthToken();
    const{siteId}=await spResolveSiteAndList(token);
    const existing=await m365GetUserProfile(token,siteId,email);
    if(existing){showToast('A user with that email already exists.','warning');return;}
    const profile={uid:'invited-'+Date.now(),email,name,status:'approved',isAdmin,role:isAdmin?'Admin':role,department:dept,registeredAt:new Date().toISOString(),approvedBy:_currentUser?.email||'admin'};
    await m365SaveUserProfile(token,siteId,profile,null);
    showToast(name+' added and pre-approved. They can sign in immediately.','success',5000);
    closeInviteModal();
    _userMgmtCache=null;_userMgmtHash='';
    renderUserManagement();
  }catch(e){showToast('Error: '+e.message,'error');}
}

let _userMgmtCache=null,_userMgmtHash='',_userMgmtBusy=false;
function _hashUsers(users){return users.map(u=>u.uid+'|'+u.status+'|'+u.isAdmin+'|'+(u.lastLogin||0)).join(',');}

async function renderUserManagement(){
  if(_userMgmtBusy)return;
  _userMgmtBusy=true;
  const container=$('#userMgmtContent');
  if(!container){_userMgmtBusy=false;return;}
  container.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;display:block"></i>Loading users from SharePoint...</div>';
  try{
    const users = await m365GetAllUsers();
    users.sort((a,b)=>new Date(b.registeredAt||0)-new Date(a.registeredAt||0));
    _renderUserTable(users);
    _userMgmtCache=container.innerHTML;
  }catch(e){
    container.innerHTML=`<div class="empty-state"><p>Error: ${e.message}</p><button class="btn btn-secondary btn-sm" onclick="renderUserManagement()"><i class="fas fa-redo"></i> Retry</button></div>`;
  }
  _userMgmtBusy=false;
}

async function approveUser(uid,name,email){
  if(!confirm(`Approve ${name} (${email})?`))return;
  await m365ApproveUser(uid,true);
  showToast(name+' approved','success');
  _userMgmtCache=null;_userMgmtHash='';
  renderUserManagement();
}

async function rejectUser(uid,name){
  if(!confirm(`Reject ${name}?`))return;
  await m365ApproveUser(uid,false);
  showToast(name+' rejected','warning');
  _userMgmtCache=null;_userMgmtHash='';
  renderUserManagement();
}

async function suspendUser(uid,name){
  if(!confirm(`Suspend ${name}?`))return;
  await m365UpdateUserStatus(uid,'suspended');
  showToast(name+' suspended','warning');
  _userMgmtCache=null;_userMgmtHash='';
  renderUserManagement();
}

async function toggleAdmin(uid,isAdmin){
  await m365SetUserAdmin(uid,isAdmin);
  showToast('Admin status updated','success');
  renderUserManagement();
}

function removeTeamMember(id){
  if(!confirm('Remove this team member from the project?'))return;
  AppState.data.projectTeam=(AppState.data.projectTeam||[]).filter(m=>m.id!==id);
  AppState.save();
  if(typeof renderPage==='function')renderPage(AppState.currentPage);
  showToast('Team member removed','warning');
}


async function deleteUser(uid,name){
  if(!confirm(`Delete ${name}? This removes their profile from SHIC.`))return;
  await m365DeleteUser(uid);
  showToast(name+' removed','warning');
  renderUserManagement();
}


// ── Boot sequence ───────────────────────────────────────────
// M365 handles authentication.

document.addEventListener('DOMContentLoaded', () => {
  m365AutoLogin();
});

function initOneDriveSync(){
  _odClientId=localStorage.getItem('pm_od_clientid')||'';
  _odAutoSync=localStorage.getItem('pm_od_autosync')==='true';
  _odLastSync=localStorage.getItem('pm_od_lastsync')||null;
  if(_odClientId)initMSAL();
}



function runVersionedMigrations(){
  const stored=getStoredDataVersion();
  if(stored===APP_VERSION)return;
  // Only migrate forward — never downgrade
  if(compareVersions(stored,APP_VERSION)>0){
    console.log('SHIC: stored version '+stored+' is newer than app '+APP_VERSION+' — skipping migration');
    return;
  }
  console.log('SHIC: migrating data from '+stored+' to '+APP_VERSION);
  // Run all migrations newer than the stored version
  const versions=Object.keys(DATA_MIGRATIONS).sort();
  versions.forEach(v=>{
    if(v>stored){
      try{
        AppState.data=DATA_MIGRATIONS[v](AppState.data)||AppState.data;
        console.log(`SHIC: migration ${v} applied`);
      }catch(e){console.error(`SHIC: migration ${v} failed:`,e);}
    }
  });
  setStoredDataVersion(APP_VERSION);
  AppState.save();
}


// ── UPDATE & PATCH SYSTEM ─────────────────────────────────

async function checkForUpdates(){
  const el=document.getElementById('updateCheckResult');
  if(el)el.innerHTML='<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Checking for updates...';
  try{
    if(!UPDATE_CHECK_URL){throw new Error('No update URL configured');}
    const res=await fetch(UPDATE_CHECK_URL,{signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw new Error('Could not reach update server');
    const data=await res.json();
    const latest=data.tag_name?.replace('v','')||APP_VERSION;
    const isNewer=compareVersions(latest,APP_VERSION)>0;
    if(el){
      if(isNewer){
        el.innerHTML=`<span style="color:var(--accent-green);font-weight:600"><i class="fas fa-arrow-circle-up" style="margin-right:5px"></i>Update available: v${latest}</span>
          <a href="${data.html_url||'#'}" target="_blank" style="margin-left:10px;font-size:11px;color:var(--accent-blue)"><i class="fas fa-download" style="margin-right:4px"></i>Download</a>`;
        showToast(`Update available: v${latest}. Download from the About panel.`,'info',5000);
      }else{
        el.innerHTML=`<span style="color:var(--accent-green)"><i class="fas fa-check-circle" style="margin-right:5px"></i>You have the latest version (v${HARDENING_VERSION})</span>`;
        showToast('Already on the latest version','success',2000);
      }
    }
  }catch(e){
    if(el)el.innerHTML=`<span style="color:var(--text-muted)"><i class="fas fa-info-circle" style="margin-right:5px"></i>Update check unavailable — ${e.name==='TimeoutError'?'no internet':'server unreachable'}</span>
      <div style="font-size:10px;margin-top:4px">Current: v${HARDENING_VERSION} (Build ${APP_BUILD}) &middot; Manual check: see your download source</div>`;
  }
}

function compareVersions(a,b){
  const pa=String(a).split('.').map(Number);
  const pb=String(b).split('.').map(Number);
  for(let i=0;i<3;i++){
    const d=(pa[i]||0)-(pb[i]||0);
    if(d!==0)return d;
  }
  return 0;
}

// ── PATCH IMPORT SYSTEM ───────────────────────────────────
// Allows applying a JS patch file without replacing the entire app
function showPatchImport(){
  $('#genericModalTitle').textContent='Apply Update Patch';
  const appliedList=JSON.parse(localStorage.getItem('shic_applied_patches')||'[]');
  const persistentList=getPersistentPatches();
  $('#genericModalBody').innerHTML=`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    <div style="padding:10px;background:rgba(63,185,80,.08);border-radius:7px;border:1px solid rgba(63,185,80,.2)">
      <div style="font-size:11px;font-weight:700;color:var(--accent-green);margin-bottom:4px"><i class="fas fa-bolt" style="margin-right:5px"></i>Patch File (.js)</div>
      <div style="font-size:10px;color:var(--text-secondary);line-height:1.7">For bug fixes & new features.<br>Saved to localStorage — re-runs on every page load automatically.<br><strong>Survives page reloads ✓</strong></div>
    </div>
    <div style="padding:10px;background:rgba(56,139,253,.08);border-radius:7px;border:1px solid rgba(56,139,253,.2)">
      <div style="font-size:11px;font-weight:700;color:var(--accent-blue);margin-bottom:4px"><i class="fas fa-file-code" style="margin-right:5px"></i>New App Version (.html)</div>
      <div style="font-size:10px;color:var(--text-secondary);line-height:1.7">For major updates.<br>Export data → replace HTML → import data.<br><strong>Full replacement ✓</strong></div>
    </div>
  </div>
  <div style="margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:12px;font-weight:600">Applied Patches</span>
      <span class="badge badge-blue" style="font-size:10px">${appliedList.length} applied / ${persistentList.length} persistent</span>
    </div>
    ${persistentList.length?`<div style="max-height:80px;overflow-y:auto;font-size:10px;font-family:var(--font-mono);background:var(--bg-hover);border-radius:6px;padding:8px">
      ${persistentList.map(p=>`<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--accent-green)">${p.id}</span><span style="color:var(--text-muted)">${p.appliedAt?.slice(0,10)||''} <button onclick="removePatch('${p.id}')" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:10px;padding:0 4px">✕ remove</button></span></div>`).join('')}
    </div>`:`<div style="font-size:11px;color:var(--text-muted);padding:6px 0">No persistent patches installed</div>`}
  </div>
  <div class="form-group">
    <label class="form-label"><i class="fas fa-file-upload" style="margin-right:5px;color:var(--accent-amber)"></i>Select Patch File (.js) *</label>
    <input type="file" id="patchFile" accept=".js,.txt" class="form-input" style="padding:4px" onchange="previewPatchFile(this)">
  </div>
  <div id="patchPreview" style="margin-top:8px"></div>
  <div style="margin-top:12px;padding:8px 12px;background:rgba(245,158,11,.08);border-radius:6px;font-size:10px;color:var(--text-secondary);border-left:2px solid var(--accent-amber)">
    <i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:5px"></i>
    <strong>Always export your data before applying a patch.</strong>
    <button class="btn btn-secondary btn-sm" style="margin-left:8px;font-size:9px;padding:2px 8px" onclick="exportAllData()"><i class="fas fa-download"></i> Export Backup</button>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-warning" id="applyPatchBtn" onclick="applyPatch()" disabled style="opacity:.4;cursor:not-allowed"><i class="fas fa-bolt"></i> Apply Patch</button>`;
  const fi=document.getElementById('patchFile');
  if(fi)fi.onchange=function(){
    const f=this.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      const code=ev.target.result;
      // Extract patch metadata for display
      const idM=code.match(/\/\/\s*PATCH_ID:\s*([^\n]+)/);
      const verM=code.match(/\/\/\s*PATCH_VERSION:\s*([^\n]+)/);
      const descM=code.match(/\/\/\s*DESCRIPTION:\s*([^\n]+)/);
      const typeM=code.match(/\/\/\s*PATCH_TYPE:\s*([^\n]+)/);
      const preview=document.getElementById('patchPreview');
      if(preview)preview.innerHTML=
        (idM?`<div style="margin-bottom:8px;padding:8px 12px;background:rgba(63,185,80,.1);border-radius:6px;border-left:3px solid var(--accent-green)">
          <div style="font-size:11px;font-weight:700;color:var(--accent-green)">${idM[1].trim()}</div>
          ${verM?`<div style="font-size:10px;color:var(--text-secondary)">v${verM[1].trim()} · ${typeM?typeM[1].trim():''}</div>`:''}
          ${descM?`<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${descM[1].trim()}</div>`:''}
        </div>`:'')
        +`<div style="padding:10px;background:var(--bg-hover);border-radius:6px;font-family:var(--font-mono);font-size:10px;max-height:120px;overflow-y:auto;white-space:pre-wrap;color:var(--text-secondary)">${code.substring(0,600).replace(/</g,'&lt;')}${code.length>600?'\n...':''}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:5px">${code.split('\n').length} lines · ${(code.length/1024).toFixed(1)} KB</div>`;
      // Enable the Apply button
      const btn=document.getElementById('applyPatchBtn');
      if(btn){
        btn.disabled=false;
        btn.style.opacity='1';
        btn.style.cursor='pointer';
      }
    };
    r.readAsText(f);
  };
  openModal('genericModal');
}

function applyPatch(){
  const fi=document.getElementById('patchFile');
  if(!fi||!fi.files.length){showToast('Select a patch file first','error');return;}
  if(!confirm('Apply this patch? Export a data backup first if you haven\'t already.'))return;
  const r=new FileReader();
  r.onload=ev=>{
    const code=ev.target.result;
    try{
      // Expose all key globals so the patch can access them
      window.AppState=AppState;
      window.migrateData=migrateData;
      window.renderPage=renderPage;
      window.buildSidebar=buildSidebar;
      window.showToast=showToast;
      window.openModal=openModal;
      window.closeModal=closeModal;
      window.navigate=navigate;
      // Run the patch code directly via eval (allows it to access window globals)
      eval(code);
      // Extract patch metadata
      const idMatch=code.match(/\/\/\s*PATCH_ID:\s*([^\n]+)/);
      const verMatch=code.match(/\/\/\s*PATCH_VERSION:\s*([^\n]+)/);
      const descMatch=code.match(/\/\/\s*DESCRIPTION:\s*([^\n]+)/);
      const typeMatch=code.match(/\/\/\s*PATCH_TYPE:\s*([^\n]+)/);
      const isPersistent=!typeMatch||typeMatch[1].trim().toLowerCase()!=='once';
      const patchId=idMatch?idMatch[1].trim():'patch-'+Date.now();

      // Save to localStorage
      if(isPersistent){
        const patches=JSON.parse(localStorage.getItem(PERSISTENT_PATCHES_KEY)||'{}');
        patches[patchId]=code;
        localStorage.setItem(PERSISTENT_PATCHES_KEY,JSON.stringify(patches));
      }
      const applied=JSON.parse(localStorage.getItem('shic_applied_patches')||'[]');
      if(!applied.includes(patchId)){applied.push(patchId);}
      localStorage.setItem('shic_applied_patches',JSON.stringify(applied));

      showToast('Patch applied locally! Reloading...','success',2000);
      AppState.save();
      closeModal('genericModal');
      setTimeout(()=>location.reload(),2500);
    }catch(e){
      console.error('[SHIC] Patch apply error:',e);
      showToast('Patch error: '+e.message+' — see console (F12) for details','error',8000);
    }
  };
  r.readAsText(fi.files[0]);
}

function getAppliedPatches(){
  try{return JSON.parse(localStorage.getItem('shic_applied_patches')||'[]');}catch{return[];}
}

function previewPatchFile(input){
  const f=input.files[0];if(!f)return;
  const btn=document.getElementById('applyPatchBtn');
  const r=new FileReader();
  r.onload=ev=>{
    const code=ev.target.result;
    const _rx=s=>new RegExp('//\\s*'+s+':\\s*([^\\n]+)');
    const idM=code.match(_rx('PATCH_ID'));
    const verM=code.match(_rx('PATCH_VERSION'));
    const typeM=code.match(_rx('PATCH_TYPE'));
    const descM=code.match(_rx('DESCRIPTION'));
    const el=document.getElementById('patchPreview');
    if(el){
      const patchType=(typeM?typeM[1].trim():'persistent');
      el.innerHTML=`<div style="padding:10px;background:var(--bg-hover);border-radius:6px;font-size:11px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
          ${idM?`<span><strong>ID:</strong> <code style="font-size:10px;background:rgba(63,185,80,.15);color:var(--accent-green);padding:1px 6px;border-radius:3px">${idM[1].trim()}</code></span>`:''}
          ${verM?`<span><strong>Version:</strong> v${verM[1].trim()}</span>`:''}
          <span><strong>Type:</strong> <span class="badge ${patchType==='once'?'badge-gray':'badge-green'}" style="font-size:9px">${patchType==='once'?'One-time only':'Persistent (survives reload)'}</span></span>
        </div>
        ${descM?`<div style="color:var(--text-secondary);margin-bottom:6px">${descM[1].trim()}</div>`:''}
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);max-height:80px;overflow-y:auto;white-space:pre-wrap">${(()=>{const ln=code.split(/\n/);return ln.slice(0,8).join('\n').replace(/</g,'&lt;')+(ln.length>8?'\n...':'');})()}</div>
        <div style="margin-top:5px;color:var(--text-muted);font-size:10px">${code.split(/\n/).length} lines &middot; ${(code.length/1024).toFixed(1)} KB</div>
      </div>`;
    }
    if(btn)btn.removeAttribute('disabled');
  };
  r.readAsText(f);
}

function removePatch(id){
  if(!confirm('Remove patch "'+id+'"? The fix it provides will no longer apply after reload.'))return;
  removePersistentPatch(id);
  const applied=JSON.parse(localStorage.getItem('shic_applied_patches')||'[]').filter(p=>p!==id);
  localStorage.setItem('shic_applied_patches',JSON.stringify(applied));
  showToast('Patch removed — will take effect on next reload','warning');
  showPatchImport(); // refresh modal
}

// ── DATA EXPORT / IMPORT ──────────────────────────────────
function exportAllData(){
  const backup={
    version:APP_VERSION,
    build:APP_BUILD,
    exportedAt:new Date().toISOString(),
    data:AppState.data,
    appliedPatches:getAppliedPatches(),
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`shic_backup_${new Date().toISOString().slice(0,10)}_v${HARDENING_VERSION}.json`;
  a.click();
  showToast('Data exported as JSON backup','success');
}

function importData(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.onchange=ev=>{
    const f=ev.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=re=>{
      try{
        const backup=JSON.parse(re.target.result);
        const importVersion=backup.version||'unknown';
        const isBackup=!!backup.data;
        const data=isBackup?backup.data:backup;
        // ── Validate structure: must be an object with at least one known data array ──
        const KNOWN=['projects','tasks','actions','procurement','warehouseItems','stockTransactions','costs','risks','qaqc','documents','manpower','equipment','materials','dailyMeetingLogs'];
        if(!data||typeof data!=='object'||Array.isArray(data)||!KNOWN.some(k=>Array.isArray(data[k]))){
          showToast('Not a valid ProMaster backup — no recognizable data found in this file','error',6000);
          return;
        }
        // ── Show record-count diff so the user sees exactly what will change ──
        const diffLines=KNOWN
          .filter(k=>Array.isArray(data[k])||(AppState.data[k]||[]).length)
          .map(k=>{
            const cur=(AppState.data[k]||[]).length;
            const inc=Array.isArray(data[k])?data[k].length:cur;
            const marker=Array.isArray(data[k])&&inc<cur?'  ⚠ FEWER':'';
            return `${k}: ${cur} → ${inc}${marker}`;
          }).join('\n');
        const confirmed=confirm(
          `Import data backup?\n\nBackup version: ${importVersion}\nExported: ${backup.exportedAt||'unknown'}\n\nRecord counts (current → after import):\n${diffLines}\n\nArrays present in the file REPLACE your current ones.`
        );
        if(!confirmed)return;
        // ── Snapshot current data first so the import is reversible ──
        try{if(typeof _idbSaveSnapshot==='function')_idbSaveSnapshot(JSON.stringify(AppState.data),typeof _dataRecordCount==='function'?_dataRecordCount(AppState.data):0,true);}catch(e){}
        AppState.data={...AppState.data,...data};
        migrateData();
        runVersionedMigrations();
        AppState.save();
        buildSidebar();navigate('dashboard');
        showToast(`Data imported from v${importVersion} backup`,'success');
        // ── Push imported data to SharePoint if connected ──
        if(_spConnected && _spAccount){
          setTimeout(()=>spPushData(true),1000);
          showToast('Pushing imported data to SharePoint...','info',3000);
        }
      }catch(e){showToast('Import failed: '+e.message,'error');}
    };
    r.readAsText(f);
  };
  input.click();
}

function clearAllData(){
  if(!confirm('⚠ CLEAR ALL DATA?\n\nThis will permanently delete everything on this device.'))return;
  // Force a backup download BEFORE anything is deleted
  try{exportAllData();}catch(e){}
  const typed=prompt('A backup file was just downloaded to your Downloads folder.\n\nTo confirm permanent deletion, type DELETE (in capitals):');
  if(typed!=='DELETE'){showToast('Cancelled — nothing was deleted','info',4000);return;}
  // Keep one final IndexedDB snapshot as a last-resort safety net
  try{if(typeof _idbSaveSnapshot==='function')_idbSaveSnapshot(JSON.stringify(AppState.data),typeof _dataRecordCount==='function'?_dataRecordCount(AppState.data):0,true);}catch(e){}
  // Sign out first so login shows cleanly after reload
  try{if(_auth)_auth.signOut();}catch(e){}
  ['pm_data','pm_theme','shic_data_version','shic_applied_patches',
   PERSISTENT_PATCHES_KEY,'shic_offline_queue','shic_offline_data','shic_data_backup',
   'shic_sp_lastwritets','shic_sp_offlinequeue','shic_sp_lastsync','shic_sp_itemid',
  ].forEach(k=>{try{localStorage.removeItem(k);}catch{} });
  location.reload();
}


// ── One-time cleanup: strip legacy base64 fileData from documents ──
// This permanently removes oversized base64 strings from the local data
// so they never get pushed to SP again. Files in the SP library are unaffected.
function _cleanupLegacyFileData() {
  const docs = AppState.data.documents || [];
  let cleaned = 0;
  let totalSize = 0;
  docs.forEach(d => {
    if (d.fileData) {
      totalSize += (d.fileData.length || 0);
      // Mark as legacy so we can warn user
      d.legacyFile = true;
      d.legacyFileName = d.fileName || d.name || 'unknown';
      delete d.fileData; // remove base64 from local data
      cleaned++;
    }
  });
  if (cleaned > 0) {
    const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`[SHIC] Cleaned ${cleaned} legacy file(s), freed ${sizeMB} MB from data`);
    AppState.save();
    setTimeout(() => {
      showToast(`Cleaned ${cleaned} legacy file(s) from data (${sizeMB} MB freed). Re-upload these documents to make them shareable.`, 'warning', 8000);
    }, 1500);
  }
}

function migrateData(){
  AppState.ensureData();
  const d=AppState.data;
  const def=getDefaultData();
  // Ensure all new arrays exist — merge in demo data if missing
  ['equipment','tools','vehicles','consumables','thirdParty','utilizationLog','assetHistory','resourceAllocations','resourceUsageLogs','projectTeam','procurementLogs','moduleAccessRules'].forEach(key=>{
    if(!d[key]||!Array.isArray(d[key]))d[key]=def[key]||[];
  });
  // Ensure materials array exists
  if(!d.materials||!Array.isArray(d.materials))d.materials=def.materials||[];
  // Ensure resources array exists
  if(!d.resources||!Array.isArray(d.resources))d.resources=def.resources||[];
  AppState.save();
}

// ── PERSISTENT PATCH RUNNER ───────────────────────────────
// Patches stored here are re-executed on every page load AFTER
// all app functions are defined, so overrides survive reloads.
// (declared at top)

function getPersistentPatches(){
  // Returns array of {id, code} for UI display
  const map=getPersistentPatchesMap();
  return Object.entries(map).map(([id,code])=>({id,code}));
}

function getPersistentPatchesMap(){
  // Supports both old array format [{id,code}] and new object format {id:code}
  try{
    const raw=localStorage.getItem(PERSISTENT_PATCHES_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      // Migrate old array format to object
      const obj={};
      parsed.forEach(p=>{if(p.id&&p.code)obj[p.id]=p.code;});
      localStorage.setItem(PERSISTENT_PATCHES_KEY,JSON.stringify(obj));
      return obj;
    }
    return parsed||{};
  }catch{return {};}
}

function savePersistentPatch(id,code){
  const patches=getPersistentPatchesMap();
  patches[id]=code;
  localStorage.setItem(PERSISTENT_PATCHES_KEY,JSON.stringify(patches));
}

function removePersistentPatch(id){
  const patches=getPersistentPatchesMap();
  delete patches[id];
  localStorage.setItem(PERSISTENT_PATCHES_KEY,JSON.stringify(patches));
}

function runPersistentPatches(){
  const patches=getPersistentPatchesMap();
  const ids=Object.keys(patches);
  if(!ids.length)return;
  let ok=0,fail=0;
  ids.forEach(id=>{
    try{
      // eval() lets the patch code access window globals directly
      eval(patches[id]);
      ok++;
    }catch(e){
      console.error('[SHIC Patch] Error running "'+id+'":',e.message);
      fail++;
    }
  });
  if(ok>0)console.log('[SHIC] '+ok+' persistent patch(es) applied on load');
  if(fail>0)showToast(fail+' patch(es) failed to run — check console (F12)','warning',4000);
}



// ── STUB FUNCTIONS — prevent ReferenceError on undefined actions ──
function showAddPO(){showAddProcurement();}
function showAddTeamMember(pid){
  if(!pid)pid=detailProjectId;
  const user=_currentUserProfile?.name||'';
  $('#genericModalTitle').textContent='Add Team Member';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="tmName" placeholder="Full name"></div>
    <div class="form-group"><label class="form-label">Role</label><input class="form-input" id="tmRole" placeholder="e.g., Site Engineer, QA Inspector"></div>
    <div class="form-group"><label class="form-label">Department</label><input class="form-input" id="tmDept" placeholder="e.g., Engineering, QA/QC"></div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="tmEmail" type="email" placeholder="email@company.com"></div>
    <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="tmPhone" placeholder="+966..."></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="tmStart" value="${new Date().toISOString().split('T')[0]}"></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveTeamMember('${pid}')"><i class="fas fa-save"></i> Add Member</button>`;
  openModal('genericModal');
}
function saveTeamMember(pid){
  const name=$('#tmName')?.value?.trim();
  if(!name){showToast('Name is required','error');return;}
  if(!AppState.data.projectTeam)AppState.data.projectTeam=[];
  AppState.data.projectTeam.push({
    id:'TM-'+Date.now().toString(36).toUpperCase(),
    projectId:pid,name,
    role:$('#tmRole')?.value||'',
    dept:$('#tmDept')?.value||'',
    email:$('#tmEmail')?.value||'',
    phone:$('#tmPhone')?.value||'',
    startDate:$('#tmStart')?.value||'',
    addedBy:_currentUserProfile?.name||'',
    addedAt:Date.now(),
  });
  AppState.save();closeModal('genericModal');
  if(typeof renderDetailTab==='function')renderDetailTab();
  showToast(name+' added to project team','success');
}
function showAddCost(pid){
  if(!pid)pid=detailProjectId||'';
  const projects=AppState.data.projects||[];
  $('#genericModalTitle').textContent='Add Cost Item';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Description *</label><input class="form-input" id="costDesc" placeholder="Cost item description"></div>
    <div class="form-group"><label class="form-label">Project</label><select class="form-select" id="costProj">${projects.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${p.id}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="costCat">${['Mobilization', 'Demobilization', 'Manpower Cost', 'Tools and Equipments', 'Materials and Consumables', 'Personal Protective Equipment', 'Miscellaneous'].map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Planned Amount (₱)</label><input class="form-input" type="number" id="costPlanned" value="0" min="0"></div>
    <div class="form-group"><label class="form-label">Actual Amount (₱)</label><input class="form-input" type="number" id="costActual" value="0" min="0"></div>
    <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="costDate" value="${new Date().toISOString().split('T')[0]}"></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveCostItem()"><i class="fas fa-save"></i> Add Cost</button>`;
  openModal('genericModal');
}
function saveCostItem(){
  const desc=$('#costDesc')?.value?.trim();
  if(!desc){showToast('Description is required','error');return;}
  if(!AppState.data.costs)AppState.data.costs=[];
  AppState.data.costs.push({
    id:'CST-'+Date.now().toString(36).toUpperCase(),
    projectId:$('#costProj')?.value||'',
    description:desc,
    category:$('#costCat')?.value||'Other',
    planned:parseFloat($('#costPlanned')?.value)||0,
    actual:parseFloat($('#costActual')?.value)||0,
    date:$('#costDate')?.value||'',
  });
  AppState.save();closeModal('genericModal');
  if(typeof renderCosts==='function')renderCosts();
  if(typeof renderDetailTab==='function')renderDetailTab();
  showToast('Cost item added','success');
}
function showAddQAQC(pid){
  if(!pid)pid=detailProjectId||'';
  const projects=AppState.data.projects||[];
  $('#genericModalTitle').textContent='Add QA/QC Item';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Inspection / Check Item *</label><input class="form-input" id="qDesc" placeholder="What was inspected?"></div>
    <div class="form-group"><label class="form-label">Project</label><select class="form-select" id="qProj">${projects.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${p.id}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="qType">${['Inspection','Test','Audit','Review','Verification','NCR'].map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="qStatus">${['pass','fail','pending','na'].map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Inspector</label><input class="form-input" id="qInsp" value="${_currentUserProfile?.name||''}"></div>
    <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="qDate" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Remarks</label><textarea class="form-textarea" id="qRem" style="min-height:60px"></textarea></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveQAQCItem()"><i class="fas fa-save"></i> Save</button>`;
  openModal('genericModal');
}
function saveQAQCItem(){
  const desc=$('#qDesc')?.value?.trim();
  if(!desc){showToast('Description is required','error');return;}
  if(!AppState.data.qaqc)AppState.data.qaqc=[];
  AppState.data.qaqc.push({
    id:'QA-'+Date.now().toString(36).toUpperCase(),
    projectId:$('#qProj')?.value||'',
    description:desc,
    type:$('#qType')?.value||'Inspection',
    status:$('#qStatus')?.value||'pending',
    inspector:$('#qInsp')?.value||'',
    date:$('#qDate')?.value||'',
    remarks:$('#qRem')?.value||'',
  });
  AppState.save();closeModal('genericModal');
  if(typeof renderQAQC==='function')renderQAQC();
  if(typeof renderDetailTab==='function')renderDetailTab();
  showToast('QA/QC item added','success');
}
function restoreUser(uid,name){approveUser(uid,name,'');}



function updateDetailTask(id,field,val){
  const t=(AppState.data.tasks||[]).find(x=>x.id===id);
  if(!t)return;
  t[field]=val;
  AppState.save();
}
function addDetailTask(pid){
  if(!pid)pid=detailProjectId;
  const t={
    id:'TSK-'+Date.now().toString(36).toUpperCase(),
    projectId:pid,name:'New Task',status:'todo',
    priority:'normal',progress:0,
    startDate:new Date().toISOString().split('T')[0],
    dueDate:'',assignee:'',description:'',milestone:false,
  };
  if(!AppState.data.tasks)AppState.data.tasks=[];
  AppState.data.tasks.push(t);
  AppState.save();
  if(typeof renderDetailTab==='function')renderDetailTab();
  showToast('Task added','success');
}


