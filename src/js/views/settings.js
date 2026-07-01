function renderSettings(){
AppState.ensureData();
  // Inject offline status into placeholder
  setTimeout(()=>{const osc=document.getElementById('offlineStatusContainer');if(osc)osc.innerHTML=getOfflineStatusHTML();},80);
  // Render palette picker
  setTimeout(()=>{const p=document.getElementById('palettePicker');if(p&&typeof _renderPalettePicker==='function')_renderPalettePicker(p);},90);
  // Show admin-only buttons only to admins
  setTimeout(()=>{
    const adminDiv=document.getElementById('adminOnlyBtns');
    if(adminDiv){
      const isAdm=!!(_currentUserProfile&&_currentUserProfile.isAdmin)||
        (!!_currentUser&&typeof isAdminEmail==='function'&&isAdminEmail(_currentUser.email||''));
      adminDiv.style.display=isAdm?'flex':'none';
    }
  },100);
const settings=AppState.data.settings||{companyName:'SHIC',currency:'PHP',timezone:'Asia/Manila'};
const connected=!!_odAccount;
const autoSync=_odAutoSync;
const lastSync=_odLastSync;
const clientId=_odClientId||'';
const redirectUri=window.location.href.split('#')[0].split('?')[0];

$('#settings').innerHTML=`
<div class="section-header" style="margin-bottom:14px">
  <div class="section-title">Application Settings</div>
  <button class="btn btn-primary btn-sm" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
</div>

<!-- ── OFFLINE STATUS ── -->
<div id="offlineStatusContainer"></div>

<!-- ── ONEDRIVE SYNC PANEL ── -->

<div class="card" id="onedriveCard" style="display:none;margin-bottom:16px;border:1px solid ${connected?'rgba(63,185,80,.4)':'rgba(56,139,253,.25)'}">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;background:linear-gradient(135deg,#0078d4,#106ebe);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fab fa-microsoft" style="color:#fff;font-size:18px"></i>
      </div>
      <div>
        <div style="font-size:15px;font-weight:700">OneDrive Cloud Sync</div>
        <div style="font-size:11px;color:var(--text-secondary)">Save and sync your data to Microsoft OneDrive</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div id="odStatusMsg" style="font-size:12px;display:flex;align-items:center">
        ${connected
          ?`<i class="fas fa-check-circle" style="color:var(--accent-green);margin-right:5px"></i><span style="color:var(--accent-green)">Connected as ${_odAccount.username}</span>`
          :`<i class="fas fa-circle" style="color:var(--text-muted);margin-right:5px"></i><span style="color:var(--text-muted)">Not connected</span>`}
      </div>
      ${connected
        ?`<button class="btn btn-danger btn-sm" onclick="disconnectOneDrive()"><i class="fas fa-unlink"></i> Disconnect</button>`
        :`<button class="btn btn-primary btn-sm" onclick="connectOneDrive()"><i class="fab fa-microsoft"></i> Connect to OneDrive</button>`}
    </div>
  </div>

  ${connected?`
  <!-- Connected state -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
    <div style="padding:12px;background:var(--bg-hover);border-radius:8px;text-align:center">
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">Sync File Location</div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--accent-blue)">OneDrive/ProMaster/promaster_data.json</div>
    </div>
    <div style="padding:12px;background:var(--bg-hover);border-radius:8px;text-align:center">
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">Last Synced</div>
      <div id="odSyncInfo" style="font-size:12px;font-weight:600">${lastSync?fmtSyncTime(lastSync):'Never'}</div>
    </div>
    <div style="padding:12px;background:var(--bg-hover);border-radius:8px;text-align:center">
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">Auto-Sync on Save</div>
      <label class="toggle" style="width:40px;height:22px;margin-top:4px"><input type="checkbox" ${autoSync?'checked':''} onchange="odAutoSyncToggle(this.checked)"><span class="toggle-slider"></span></label>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-primary" onclick="syncToOneDrive()"><i class="fas fa-cloud-upload-alt"></i> Upload to OneDrive Now</button>
    <button class="btn btn-secondary" onclick="syncFromOneDrive()"><i class="fas fa-cloud-download-alt"></i> Download from OneDrive</button>
    <div style="margin-left:auto;font-size:10px;color:var(--text-secondary);align-self:center"><i class="fas fa-shield-alt" style="margin-right:4px;color:var(--accent-green)"></i>Data encrypted in transit · Stored in your personal OneDrive</div>
  </div>`:

  `<!-- Setup wizard -->
  <div style="padding:14px;background:rgba(0,120,212,.08);border-radius:8px;border-left:3px solid #0078d4;margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px"><i class="fas fa-tools" style="color:#0078d4;margin-right:7px"></i>One-time Setup — 3 Steps</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">1</div>
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Register Azure App</div>
        <div style="font-size:10px;color:var(--text-secondary);line-height:1.7">
          1. Go to <a href="#" onclick="window.open('https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade')">portal.azure.com</a><br>
          2. App registrations → New registration<br>
          3. Name: <em>SHIC Sync</em><br>
          4. Accounts: <em>Personal Microsoft only</em><br>
          5. Click <strong>Register</strong>
        </div>
      </div>
      <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">2</div>
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Add Redirect URI</div>
        <div style="font-size:10px;color:var(--text-secondary);line-height:1.7">
          In your app → Authentication<br>
          → Add a platform → <strong>Single-page application</strong><br>
          Paste this exact URI:<br>
          <code style="background:rgba(0,120,212,.15);color:#0078d4;padding:2px 6px;border-radius:3px;font-size:9px;word-break:break-all;display:block;margin-top:4px">${redirectUri}</code>
          <button class="btn btn-secondary btn-sm" style="font-size:9px;padding:2px 7px;margin-top:5px" onclick="navigator.clipboard.writeText('${redirectUri}');showToast('Copied!','success')"><i class="fas fa-copy"></i> Copy URI</button>
        </div>
      </div>
      <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">3</div>
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Enter Client ID</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:8px">
          Copy the <strong>Application (client) ID</strong> from your app's Overview page and paste it below:
        </div>
        <div style="display:flex;gap:6px">
          <input class="form-input" id="odClientId" value="${clientId}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="font-family:var(--font-mono);font-size:10px;height:30px">
          <button class="btn btn-primary btn-sm" onclick="odSaveClientId()">Save</button>
        </div>
        ${clientId?`<div style="font-size:10px;color:var(--accent-green);margin-top:6px"><i class="fas fa-check-circle" style="margin-right:4px"></i>Client ID saved — click Connect</div>`:''}
      </div>
    </div>

  </div>`}
</div>

<!-- ── SHAREPOINT / M365 DATABASE PANEL ── -->
${renderSpPanel()}

<!-- ── BUSINESS UNIT MANAGEMENT ── -->
<div class="card" style="margin-bottom:16px;border:1px solid rgba(188,140,255,.25)">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas fa-layer-group" style="color:#fff;font-size:16px"></i>
      </div>
      <div>
        <div style="font-size:15px;font-weight:700">Business Units</div>
        <div style="font-size:11px;color:var(--text-secondary)">Manage your main company and business unit structure</div>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="showAddBU()"><i class="fas fa-plus"></i> Add Business Unit</button>
  </div>
  <div style="padding:8px 12px;background:rgba(188,140,255,.08);border-radius:7px;font-size:11px;margin-bottom:12px;border-left:3px solid #bc8cff">
    <i class="fas fa-info-circle" style="color:#bc8cff;margin-right:6px"></i>
    Projects can be assigned to a Business Unit in the project form. Reports can be filtered by BU.
    The <strong>Main Company</strong> covers projects with no BU assigned.
  </div>
  <div id="buList">${renderBUList()}</div>
</div>

<div class="grid grid-2">
  <div class="card">
    <div style="font-size:14px;font-weight:600;margin-bottom:14px">Company Settings</div>
    <div class="form-group"><label class="form-label">Company Name</label><input class="form-input" id="sCompany" value="${settings.companyName}"></div>
    <div class="form-group"><label class="form-label">Currency</label><select class="form-select" id="sCurrency">${['PHP','USD','EUR','SAR','GBP'].map(c=>`<option ${settings.currency===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Date Format</label><select class="form-select"><option>YYYY-MM-DD</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option></select></div>
    <div class="form-group"><label class="form-label">Timezone</label><select class="form-select"><option>Asia/Manila</option><option>Asia/Riyadh</option><option>UTC</option><option>US/Eastern</option><option>Europe/London</option></select></div>
    <div class="form-group">
      <label class="form-label">Session Timeout</label>
      <select class="form-select" id="sSessionTimeout">
        ${[['0','Disabled (stay signed in)'],['15','15 minutes'],['30','30 minutes (recommended)'],['60','1 hour'],['120','2 hours']].map(([v,l])=>`<option value="${v}" ${String(settings.sessionTimeout??30)===v?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label" style="display:flex;align-items:center;gap:10px">
        <label class="toggle" style="width:38px;height:20px"><input type="checkbox" id="sAutoBackup" ${settings.autoBackup?'checked':''}><span class="toggle-slider"></span></label>
        Auto-backup to Downloads after each SharePoint sync
        <span style="font-size:10px;color:var(--text-muted)">(once per day — saves a JSON file to your Downloads folder)</span>
      </label>
    </div>
  </div>
  <div class="card">
    <div style="font-size:14px;font-weight:600;margin-bottom:14px">Notifications &amp; Preferences</div>
    ${[['Email Notifications','Receive email alerts for overdue items'],['Push Notifications','Browser push notifications'],['Auto Save','Automatically save changes every 30s']].map(([t,d])=>`
    <div class="settings-item">
      <div class="settings-item-info"><div class="title">${t}</div><div class="desc">${d}</div></div>
      <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
    </div>`).join('')}
    <div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-item-info"><div class="title"><i class="fas fa-bolt" style="color:var(--accent-blue);margin-right:5px"></i>Power Automate Webhook</div><div class="desc">POST to this URL on key events (low stock, PO approved, stock received). Leave blank to disable.</div></div>
      <div style="display:flex;gap:8px;width:100%">
        <input class="form-input" id="sWebhookUrl" placeholder="https://prod-xx.westus.logic.azure.com/workflows/…" value="${settings.webhookUrl||''}" style="flex:1;font-size:11px;font-family:var(--font-mono)">
        <button class="btn btn-secondary btn-sm" onclick="_testWebhook()"><i class="fas fa-paper-plane"></i> Test</button>
      </div>
    </div>
  </div>
  <div class="card" style="grid-column:1/-1">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:600"><i class="fas fa-palette" style="color:var(--accent-purple);margin-right:7px"></i>Appearance — Color Palette</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Choose a color theme. Your choice is saved automatically.</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="applyPalette('dark')"><i class="fas fa-undo"></i> Reset to Default</button>
    </div>
    <div id="palettePicker" style="display:flex;gap:10px;flex-wrap:wrap"></div>
  </div>
  <div class="card">
    <div style="font-size:14px;font-weight:600;margin-bottom:14px">Local Data Management</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-secondary" onclick="exportAllData()"><i class="fas fa-download"></i> Export All Data (JSON backup)</button>
      <button class="btn btn-secondary" onclick="importData()"><i class="fas fa-upload"></i> Import Data from JSON</button>
      <button class="btn btn-warning" onclick="resetDemo()"><i class="fas fa-redo"></i> Reset to Demo Data</button>
      <button class="btn btn-danger" onclick="clearAllData()"><i class="fas fa-trash"></i> Clear All Data</button>
      <button class="btn btn-secondary" onclick="showPatchImport()"><i class="fas fa-bolt"></i> Apply Update Patch</button>
      <button class="btn btn-secondary" onclick="clearDemoData()" style="border-color:var(--accent-amber);color:var(--accent-amber)"><i class="fas fa-broom" style="margin-right:6px"></i> Clear Demo Data &amp; Start Fresh</button>
      <div id="adminOnlyBtns" style="display:none;flex-direction:column;gap:8px">
        <div style="font-size:10px;color:var(--accent-amber);padding:6px 10px;background:rgba(248,81,73,.07);border-radius:6px;border-left:3px solid var(--accent-amber)">
          <i class="fas fa-shield-alt" style="margin-right:5px"></i><strong>Admin Only</strong> — affects all team members
        </div>
        <button class="btn btn-secondary" onclick="showAuditLogPanel()"><i class="fas fa-history" style="margin-right:6px;color:var(--accent-blue)"></i> Audit Trail</button>
        <button class="btn btn-secondary" onclick="showDropdownManager()"><i class="fas fa-list-ul" style="margin-right:6px;color:var(--accent-blue)"></i> Manage Dropdown Options</button>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg-hover);border-radius:6px;font-size:10px;color:var(--text-secondary);line-height:1.7">
      <strong>Where is my data?</strong><br>
      Data is stored in your browser's <strong>localStorage</strong> on this device.<br>
      It persists across browser restarts but is <strong>device-specific</strong>.<br>
      Use <strong>SharePoint sync</strong> (M365) or OneDrive sync above, or Export JSON to back up across devices.
    </div>
  </div>
  <div class="card" style="grid-column:1/-1">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:14px;font-weight:600"><i class="fas fa-users-cog" style="color:var(--accent-blue);margin-right:7px"></i>User Management <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">— Admin only</span></div>
      <div style="display:flex;gap:7px">
        <button class="btn btn-secondary btn-sm" onclick="renderUserManagement()"><i class="fas fa-sync"></i> Refresh</button>
        <button class="btn btn-danger btn-sm" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
      </div>
    </div>
    ${_currentUserProfile&&(_currentUserProfile.isAdmin||isAdminEmail(_currentUser?.email||''))?`<div id="userMgmtContent">${typeof _userMgmtCache==='string'&&_userMgmtCache?_userMgmtCache:'<div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;display:block"></i>Loading users...</div>'}</div>`:`<div style="padding:14px;background:rgba(248,81,73,.08);border-radius:8px;font-size:12px;color:var(--accent-red)"><i class="fas fa-lock" style="margin-right:7px"></i>Admin access required to manage users.</div>`}
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:14px;font-weight:600">About SHIC</div>
      <button class="btn btn-secondary btn-sm" onclick="checkForUpdates()"><i class="fas fa-sync"></i> Check for Updates</button>
    </div>
    <!-- Version info -->
    <div style="padding:12px;background:linear-gradient(135deg,rgba(245,158,11,.1),rgba(217,119,6,.05));border:1px solid rgba(245,158,11,.25);border-radius:8px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;flex-shrink:0">S</div>
        <div>
          <div style="font-size:14px;font-weight:800">${APP_NAME}</div>
          <div style="font-size:10px;color:var(--text-secondary)">${APP_CODENAME} Edition</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--accent-amber)">v${HARDENING_VERSION}</div>
          <div style="font-size:9px;color:var(--text-muted)">Build ${APP_BUILD}</div>
        </div>
      </div>
      <div id="updateCheckResult" style="font-size:11px;color:var(--text-secondary)">18+ Modules &middot; Offline-first &middot; SharePoint Sync &middot; PWA Ready</div>
    </div>
    <!-- Changelog -->
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">Version History & Changelog</div>
    <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${APP_CHANGELOG.map(v=>`
      <div style="padding:10px;background:var(--bg-hover);border-radius:7px;border-left:3px solid ${v.type==='initial'?'#8b949e':v.type==='major'?'var(--accent-amber)':'var(--accent-blue)'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-family:var(--font-mono);font-weight:700;font-size:12px">v${v.version}</span>
          <span class="badge ${v.type==='initial'?'badge-gray':v.type==='major'?'badge-amber':'badge-blue'}" style="font-size:9px">${v.type}</span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:auto">${v.date}</span>
        </div>
        <ul style="margin:0;padding-left:16px;font-size:10px;color:var(--text-secondary);line-height:1.8">
          ${v.notes.map(n=>`<li>${n}</li>`).join('')}
        </ul>
      </div>`).join('')}
    </div>
    <!-- Data version status -->
    <div style="padding:8px 12px;background:var(--bg-hover);border-radius:6px;font-size:11px;display:flex;justify-content:space-between;margin-bottom:14px">
      <span style="color:var(--text-secondary)">Data Schema Version</span>
      <span style="font-family:var(--font-mono);font-weight:600;color:${getStoredDataVersion()===APP_VERSION?'var(--accent-green)':'var(--accent-amber)'}">${getStoredDataVersion()} ${getStoredDataVersion()===APP_VERSION?'✓ up to date':'→ will migrate on next load'}</span>
    </div>
    <!-- Keyboard shortcuts -->
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">Keyboard Shortcuts</div>
    ${[['/',  'Focus global search'],['Ctrl+N','Quick add new item'],['Esc','Close modal/panel']].map(([k,d])=>`
    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--border)">
      <span style="font-family:var(--font-mono);background:var(--bg-hover);padding:1px 5px;border-radius:3px">${k}</span>
      <span style="color:var(--text-secondary)">${d}</span></div>`).join('')}
  </div>
</div>`;
}

function showAuditLogPanel(){
  const localLogs=(()=>{try{return JSON.parse(localStorage.getItem('shic_audit_log')||'[]');}catch(e){return[];}})().slice().reverse();
  const _catCol={error:'#f85149',CREATE:'#3fb950',UPDATE:'#388bfd',DELETE:'#f85149',delete:'#f85149',delete_request:'#f0a450',convert:'#3fb950',sync:'#bc8cff',backup:'#3fb950',restore:'#f0a450',collision:'#f0a450',reset:'#f85149',boot:'#8b949e',auth:'#39d3f2',permissions_update:'#388bfd',status_lock:'#f0a450'};
  const _catIco={error:'fa-exclamation-triangle',CREATE:'fa-plus-circle',UPDATE:'fa-edit',DELETE:'fa-trash',delete:'fa-trash',delete_request:'fa-trash',convert:'fa-exchange-alt',sync:'fa-sync',backup:'fa-cloud-upload-alt',restore:'fa-undo',collision:'fa-exclamation-circle',reset:'fa-redo',boot:'fa-power-off',auth:'fa-sign-in-alt',permissions_update:'fa-shield-alt',status_lock:'fa-lock'};
  const _DATA_CATS=['CREATE','UPDATE','DELETE','delete','delete_request','convert','permissions_update','status_lock'];
  const _SYNC_CATS=['sync','backup','restore','collision','reset'];
  function _render(filter){
    const rows=localLogs.filter(l=>filter==='all'||filter==='error'&&l.category==='error'||filter==='data'&&_DATA_CATS.includes(l.category)||filter==='sync'&&_SYNC_CATS.includes(l.category)||filter==='auth'&&['boot','auth'].includes(l.category));
    if(!rows.length)return`<div class="empty-state" style="padding:24px"><i class="fas fa-clipboard-list empty-icon"></i><div class="empty-title">No events</div></div>`;
    return`<div style="max-height:400px;overflow-y:auto">${rows.slice(0,200).map(l=>{
      const c=_catCol[l.category]||'#8b949e',ic=_catIco[l.category]||'fa-circle';
      const t=l.iso?new Date(l.iso).toLocaleString():l.ts?new Date(l.ts).toLocaleString():'—';
      const usr=l.user&&l.user!=='unknown'?`<span style="font-size:10px;color:var(--accent-blue)">${l.user}</span>`:'';
      const det=l.details?`<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-family:var(--font-mono);word-break:break-all">${(typeof l.details==='object'?JSON.stringify(l.details):String(l.details)).substring(0,140)}</div>`:'';
      return`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="width:28px;height:28px;border-radius:6px;background:${c}22;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${ic}" style="color:${c};font-size:10px"></i></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
            <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${c}22;color:${c};font-weight:700">${l.category}</span>
            <span style="font-size:11px;font-weight:500">${l.message||'—'}</span>${usr}</div>
          ${det}<div style="font-size:9px;color:var(--text-muted)">${t}${l.page?` · page: ${l.page}`:''}</div>
        </div></div>`;
    }).join('')}</div>`;
  }
  const cnt=(f)=>f==='all'?localLogs.length:localLogs.filter(l=>f==='error'?l.category==='error':f==='data'?_DATA_CATS.includes(l.category):f==='sync'?_SYNC_CATS.includes(l.category):['boot','auth'].includes(l.category)).length;
  const _tabs=[['all','All'],['data','Data Changes'],['error','Errors'],['sync','Sync & Backup'],['auth','Auth']];
  $('#genericModalTitle').innerHTML='<i class="fas fa-history" style="margin-right:7px;color:var(--accent-blue)"></i>Audit Trail';
  $('#genericModalBody').innerHTML=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">
    ${_tabs.map(([id,lbl])=>`<button id="_at_${id}" class="btn btn-secondary btn-sm${id==='all'?' active':''}" onclick="_atTab('${id}')" style="font-size:11px">${lbl} <span style="opacity:.55">(${cnt(id)})</span></button>`).join('')}
    <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="_atExport()"><i class="fas fa-download"></i></button>
  </div><div id="_atBody">${_render('all')}</div>`;
  window._atTab=function(f){$$('[id^="_at_"]').forEach(b=>b.classList.remove('active'));$('#_at_'+f)?.classList.add('active');$('#_atBody').innerHTML=_render(f);};
  window._atExport=function(){const b=new Blob([JSON.stringify(localLogs,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`audit-${new Date().toISOString().slice(0,10)}.json`;a.click();showToast('Exported','success');};
  $('#genericModalFooter').innerHTML=`<span style="font-size:10px;color:var(--text-muted)">${localLogs.length} events · last 500 kept · local only</span><button class="btn btn-secondary" onclick="closeModal('genericModal')" style="margin-left:auto">Close</button>`;
  openModal('genericModal');
}

// ── DROPDOWN MANAGER ─────────────────────────────────────────
let _dmActiveKey = null;

function showDropdownManager(){
  if(!isAdminUser()){showToast('Admins only','error');return;}
  _dmActiveKey = null;
  $('#genericModalTitle').textContent = 'Manage Dropdown Options';
  _dmRender();
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

async function _dmPushToAllUsers(){
  if(!isAdminUser()){showToast('Admins only','error');return;}
  if(typeof _spConnected==='undefined'||!_spConnected){showToast('SharePoint not connected — connect first to push dropdowns','error',4000);return;}
  if(!confirm('Push current dropdown options to ALL users?\n\nAll users will receive these dropdowns on their next sync. This cannot be undone automatically.'))return;
  if(!AppState.data.settings)AppState.data.settings={};
  if(!AppState.data.settings.dropdowns)AppState.data.settings.dropdowns={};
  AppState.data.settings.dropdowns._adminPushedAt=Date.now();
  AppState.save();
  showToast('Pushing dropdown settings to SharePoint...','info',2500);
  try{
    await spPushData(true);
    showToast('Dropdown settings pushed — users will receive them on next sync','success',5000);
  }catch(e){showToast('Push failed: '+e.message,'error');}
  _dmRender();
}

function _dmRender(){
  const body = $('#genericModalBody');
  if(!body) return;

  if(!_dmActiveKey){
    // Show list of all dropdown categories
    const keys = Object.keys(DROPDOWN_REGISTRY);
    const _adminPushedAt = AppState.data.settings?.dropdowns?._adminPushedAt;
    const _pushedLabel = _adminPushedAt ? new Date(_adminPushedAt).toLocaleString() : null;
    body.innerHTML = `
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-secondary)">Select a dropdown to manage its options. Changes apply immediately across the entire app.</div>
    ${typeof _spConnected!=='undefined'&&_spConnected?`<div style="margin-bottom:12px;padding:10px 14px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--accent-blue)"><i class="fas fa-cloud-upload-alt" style="margin-right:6px"></i>Push Dropdowns to All Users</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${_pushedLabel?'Last pushed: '+_pushedLabel:'Never pushed — users see default values'}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_dmPushToAllUsers()"><i class="fas fa-share-nodes"></i> Push Now</button>
    </div>`:''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
      ${keys.map(key=>{
        const reg=DROPDOWN_REGISTRY[key];
        const items=_getDropdown(key);
        const isCustom=!!(AppState.data.settings?.dropdowns?.[key]?.length);
        return`<div onclick="_dmOpenKey('${key}')" style="padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all .15s;background:var(--bg-card)"
          onmouseover="this.style.borderColor='var(--accent-blue)';this.style.background='rgba(56,139,253,.05)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-card)'">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <i class="fas ${reg.icon}" style="color:var(--accent-blue);font-size:13px;width:16px"></i>
            <span style="font-size:12px;font-weight:600">${reg.label}</span>
            ${isCustom?`<span style="margin-left:auto;font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(63,185,80,.15);color:var(--accent-green);font-weight:700">CUSTOM</span>`:''}
          </div>
          <div style="font-size:10px;color:var(--text-muted)">${items.length} option${items.length!==1?'s':''} · ${isCustom?'Customized':'Using defaults'}</div>
        </div>`;
      }).join('')}
    </div>`;
    $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
    return;
  }

  // Show editor for active key
  const reg = DROPDOWN_REGISTRY[_dmActiveKey];
  const items = _getDropdown(_dmActiveKey);
  const isCustom = !!(AppState.data.settings?.dropdowns?.[_dmActiveKey]?.length);
  body.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="_dmActiveKey=null;_dmRender()"><i class="fas fa-arrow-left"></i> All Dropdowns</button>
    <div>
      <div style="font-weight:700;font-size:13px"><i class="fas ${reg.icon}" style="color:var(--accent-blue);margin-right:6px"></i>${reg.label}</div>
      <div style="font-size:10px;color:var(--text-muted)">${isCustom?'Using custom values':'Using default values'} · ${items.length} item${items.length!==1?'s':''}</div>
    </div>
    ${isCustom?`<button class="btn btn-secondary btn-sm" style="margin-left:auto;color:var(--accent-amber)" onclick="_dmResetToDefault('${_dmActiveKey}')"><i class="fas fa-undo"></i> Reset to Defaults</button>`:''}
  </div>
  <div id="dmItemList" style="margin-bottom:12px">
    ${items.map((item,i)=>`
    <div id="dmItem_${i}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;background:var(--bg-card)">
      <i class="fas fa-grip-vertical" style="color:var(--text-muted);font-size:11px;cursor:grab"></i>
      <span id="dmItemText_${i}" style="flex:1;font-size:12px">${item}</span>
      <input id="dmItemInput_${i}" class="form-input" value="${item.replace(/"/g,'&quot;')}" style="display:none;flex:1;height:28px;font-size:12px">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="_dmEditItem(${i})" id="dmEditBtn_${i}" title="Edit"><i class="fas fa-pen"></i></button>
      <button class="btn btn-success btn-sm btn-icon" onclick="_dmSaveItem(${i})" id="dmSaveBtn_${i}" style="display:none" title="Save"><i class="fas fa-check"></i></button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="_dmCancelEdit(${i})" id="dmCancelBtn_${i}" style="display:none" title="Cancel"><i class="fas fa-times"></i></button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="_dmDeleteItem(${i})" title="Remove"><i class="fas fa-trash"></i></button>
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="btn btn-secondary btn-sm btn-icon" onclick="_dmMoveItem(${i},-1)" ${i===0?'disabled':''} style="padding:1px 5px;font-size:9px"><i class="fas fa-chevron-up"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" onclick="_dmMoveItem(${i},1)" ${i===items.length-1?'disabled':''} style="padding:1px 5px;font-size:9px"><i class="fas fa-chevron-down"></i></button>
      </div>
    </div>`).join('')}
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <input class="form-input" id="dmNewItem" placeholder="New option value..." style="flex:1" onkeydown="if(event.key==='Enter')_dmAddItem()">
    <button class="btn btn-primary btn-sm" onclick="_dmAddItem()"><i class="fas fa-plus"></i> Add</button>
  </div>`;
  $('#genericModalFooter').innerHTML = `
  <button class="btn btn-secondary" onclick="_dmActiveKey=null;_dmRender()"><i class="fas fa-arrow-left"></i> Back</button>
  <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
}

function _dmOpenKey(key){_dmActiveKey=key;_dmRender();}

function _dmGetCurrentItems(){return _getDropdown(_dmActiveKey);}

function _dmSave(items){
  _setDropdown(_dmActiveKey,items);
  _dmRender();
  showToast('Dropdown updated','success',2000);
}

function _dmAddItem(){
  const inp=$('#dmNewItem');if(!inp)return;
  const val=inp.value.trim();
  if(!val){showToast('Enter a value first','error');return;}
  const items=[..._dmGetCurrentItems(),val];
  inp.value='';
  _dmSave(items);
}

function _dmEditItem(i){
  $(`#dmItemText_${i}`).style.display='none';
  $(`#dmItemInput_${i}`).style.display='';
  $(`#dmEditBtn_${i}`).style.display='none';
  $(`#dmSaveBtn_${i}`).style.display='';
  $(`#dmCancelBtn_${i}`).style.display='';
  $(`#dmItemInput_${i}`).focus();
}

function _dmCancelEdit(i){
  const items=_dmGetCurrentItems();
  $(`#dmItemText_${i}`).style.display='';
  $(`#dmItemInput_${i}`).style.display='none';
  $(`#dmEditBtn_${i}`).style.display='';
  $(`#dmSaveBtn_${i}`).style.display='none';
  $(`#dmCancelBtn_${i}`).style.display='none';
  $(`#dmItemInput_${i}`).value=items[i];
}

function _dmSaveItem(i){
  const val=$(`#dmItemInput_${i}`)?.value?.trim();
  if(!val){showToast('Value cannot be empty','error');return;}
  const items=[..._dmGetCurrentItems()];
  items[i]=val;
  _dmSave(items);
}

function _dmDeleteItem(i){
  const items=[..._dmGetCurrentItems()];
  if(items.length<=1){showToast('Must keep at least one option','error');return;}
  if(!confirm(`Remove "${items[i]}" from this dropdown?`))return;
  items.splice(i,1);
  _dmSave(items);
}

function _dmMoveItem(i,dir){
  const items=[..._dmGetCurrentItems()];
  const j=i+dir;
  if(j<0||j>=items.length)return;
  [items[i],items[j]]=[items[j],items[i]];
  _dmSave(items);
}

function _dmResetToDefault(key){
  if(!confirm(`Reset "${DROPDOWN_REGISTRY[key].label}" to default values?\n\nAll custom changes will be lost.`))return;
  if(!AppState.data.settings)AppState.data.settings={};
  if(!AppState.data.settings.dropdowns)AppState.data.settings.dropdowns={};
  delete AppState.data.settings.dropdowns[key];
  AppState.save();
  _dmRender();
  showToast('Reset to defaults','success',2000);
}

function saveSettings(){
AppState.data.settings.companyName=$('#sCompany').value;
AppState.data.settings.currency=$('#sCurrency').value;
AppState.data.settings.autoBackup=!!document.getElementById('sAutoBackup')?.checked;
AppState.data.settings.sessionTimeout=parseInt(document.getElementById('sSessionTimeout')?.value??'30')||0;
AppState.data.settings.webhookUrl=(document.getElementById('sWebhookUrl')?.value||'').trim();
AppState.save();
if(typeof _startSessionTimer==='function')_startSessionTimer();
showToast('Settings saved','success');}

function _testWebhook(){
  const url=(document.getElementById('sWebhookUrl')?.value||'').trim();
  if(!url){showToast('Enter a webhook URL first','warning');return;}
  fireWebhook('test',{message:'Test from PROCMASTER',app:'SHIC PM Suite',ts:new Date().toISOString()});
  showToast('Test payload sent — check your flow','info',4000);}

function fireWebhook(event, payload){
  const url=AppState.data?.settings?.webhookUrl||'';
  if(!url)return;
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,ts:new Date().toISOString(),app:'SHIC PM Suite',...payload})}).catch(()=>{});
}
window.fireWebhook=fireWebhook;

// ── BUSINESS UNIT FUNCTIONS ───────────────────────────────
const BU_COLORS=['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#f85149','#fb8f44','#ff6b9d'];

function renderBUList(){
  const BUs=AppState.data.businessUnits||[];
  if(!BUs.length)return`<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">
    <i class="fas fa-layer-group" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3"></i>
    No business units yet. Click <strong>Add Business Unit</strong> to create one.
  </div>`;
  return`<div style="display:flex;flex-direction:column;gap:7px">
    ${BUs.map((bu,i)=>{
      const projCount=(AppState.data.projects||[]).filter(p=>p.businessUnit===bu.id).length;
      return`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-hover);border-radius:8px;border-left:4px solid ${bu.color||BU_COLORS[i%BU_COLORS.length]}">
        <div style="width:32px;height:32px;border-radius:8px;background:${bu.color||BU_COLORS[i%BU_COLORS.length]}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas fa-layer-group" style="color:${bu.color||BU_COLORS[i%BU_COLORS.length]};font-size:13px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${bu.name}</div>
          ${bu.description?`<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bu.description}</div>`:''}
          <div style="font-size:10px;color:var(--text-secondary);margin-top:2px"><span class="badge badge-blue" style="font-size:9px">${projCount} project${projCount!==1?'s':''}</span></div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="showEditBU('${bu.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteBU('${bu.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function showAddBU(){
  const nextColor=BU_COLORS[(AppState.data.businessUnits||[]).length%BU_COLORS.length];
  $('#genericModalTitle').textContent='Add Business Unit';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Business Unit Name *</label>
      <input class="form-input" id="buName" placeholder="e.g., Fabrication Division">
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Description</label>
      <input class="form-input" id="buDesc" placeholder="Brief description (optional)">
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${BU_COLORS.map(c=>`<div onclick="$('#buColor').value='${c}';$$('.bu-color-swatch').forEach(s=>s.style.outline='none');this.style.outline='2px solid #fff'" 
          class="bu-color-swatch"
          style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;${c===nextColor?'outline:2px solid #fff':''}"></div>`).join('')}
        <input type="color" id="buColor" value="${nextColor}" style="width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none">
      </div>
    </div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveBU()"><i class="fas fa-save"></i> Add</button>`;
  openModal('genericModal');
}

function showEditBU(id){
  const bu=(AppState.data.businessUnits||[]).find(b=>b.id===id);
  if(!bu)return;
  $('#genericModalTitle').textContent='Edit Business Unit';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Business Unit Name *</label>
      <input class="form-input" id="buName" value="${bu.name}">
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Description</label>
      <input class="form-input" id="buDesc" value="${bu.description||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${BU_COLORS.map(c=>`<div onclick="$('#buColor').value='${c}';$$('.bu-color-swatch').forEach(s=>s.style.outline='none');this.style.outline='2px solid #fff'"
          class="bu-color-swatch"
          style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;${c===bu.color?'outline:2px solid #fff':''}"></div>`).join('')}
        <input type="color" id="buColor" value="${bu.color||'#388bfd'}" style="width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none">
      </div>
    </div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveBU('${id}')"><i class="fas fa-save"></i> Update</button>`;
  openModal('genericModal');
}

function saveBU(id){
  const name=($('#buName')||{}).value?.trim();
  if(!name){showToast('Name is required','error');return;}
  if(!AppState.data.businessUnits)AppState.data.businessUnits=[];
  if(id){
    const idx=AppState.data.businessUnits.findIndex(b=>b.id===id);
    if(idx>=0){
      AppState.data.businessUnits[idx]={...AppState.data.businessUnits[idx],
        name,description:$('#buDesc').value?.trim()||'',color:$('#buColor').value};
      showToast('Business unit updated','success');
    }
  }else{
    const newId='BU-'+Date.now().toString(36).toUpperCase();
    AppState.data.businessUnits.push({id:newId,name,description:$('#buDesc').value?.trim()||'',color:$('#buColor').value});
    showToast('Business unit added','success');
  }
  AppState.save();
  closeModal('genericModal');
  const buListEl=$('#buList');
  if(buListEl)buListEl.innerHTML=renderBUList();
}

function deleteBU(id){
  const bu=(AppState.data.businessUnits||[]).find(b=>b.id===id);
  if(!bu)return;
  const projCount=(AppState.data.projects||[]).filter(p=>p.businessUnit===id).length;
  const msg=projCount>0
    ?`Delete "${bu.name}"? This BU has ${projCount} project(s). They will be reassigned to Main Company.`
    :`Delete "${bu.name}"? This cannot be undone.`;
  if(!confirm(msg))return;
  // Unassign projects
  (AppState.data.projects||[]).forEach(p=>{if(p.businessUnit===id)p.businessUnit='';});
  AppState.data.businessUnits=(AppState.data.businessUnits||[]).filter(b=>b.id!==id);
  AppState.save();
  const buListEl=$('#buList');
  if(buListEl)buListEl.innerHTML=renderBUList();
  showToast('Business unit deleted','warning');
}





function clearDemoData(){
  // Clears all data locally, keeps trades + settings
  // This is the "start fresh" option — wipes everything including demo records
  if(!confirm(
    'Clear Demo Data & Start Fresh?\n\n'+
    'This will remove ALL current data:\n'+
    '• All projects, tasks, manpower\n'+
    '• All resources, materials, procurement\n'+
    '• All costs, QA/QC, risks, documents\n'+
    '• All allocations and usage logs\n\n'+
    'KEPT: Trade/Discipline Masterlist, Settings\n\n'+
    'Continue?'
  ))return;

  // Save trades and settings
  const savedTrades = AppState.data.trades||[];
  const savedSettings = AppState.data.settings||{companyName:'SHIC',currency:'PHP',timezone:'Asia/Manila'};

  // Reset to empty
  AppState.data = getDefaultData();
  AppState.data.trades = savedTrades;
  AppState.data.settings = savedSettings;
  AppState.save();

  // ── Push clear to SharePoint if connected ──
  if(_spConnected && _spAccount){
    spPushData(true).then(()=>{
      showToast('All data cleared and synced to SharePoint — team will see empty data on next pull.','success',5000);
    }).catch(e=>{
      showToast('Cleared locally. SharePoint sync failed: '+e.message,'warning',5000);
    });
  } else {
    showToast('Data cleared locally.','success',4000);
  }

  // Navigate to fresh dashboard
  navigate('dashboard');
  buildSidebar();
}

function resetDemo(){
  if(!confirm('Reset to demo data? Current data will be lost.'))return;
  AppState.data=getDemoData();
  AppState.save();
  navigate('dashboard');
  buildSidebar();
  showToast('Demo data restored','success');
}

function exportCSV(rows,headers,filename){
const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=filename;a.click();showToast('Exported: '+filename,'success');}


// ═══════════════════════════════════════════════════════════
// ── WAVE 1: DESKTOP APP UX — Command Palette, Shortcuts, ──
// ── Save Indicator, Recently Viewed, PWA Install ──────────
// ═══════════════════════════════════════════════════════════

// ── 1. COMMAND PALETTE ──────────────────────────────────────
let _cmdSelectedIdx = 0;
let _cmdResults = [];

function openCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  if (!pal) return;
  pal.style.display = 'block';
  const input = document.getElementById('cmdPaletteInput');
  input.value = '';
  input.focus();
  renderCmdResults('');
}

function closeCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  if (pal) pal.style.display = 'none';
}

function _cmdBuildIndex(query) {
  const q = (query || '').toLowerCase().trim();
  const results = [];
  const user = _currentUserProfile;
  const isAdmin = user && user.isAdmin;

  // ── Pages ──
  NAV_ITEMS.forEach(item => {
    if (!q || item.label.toLowerCase().includes(q) || item.id.includes(q)) {
      results.push({
        type: 'page', icon: item.icon, label: item.label,
        sublabel: 'Page · ' + item.section,
        action: () => { navigate(item.id); }
      });
    }
  });
  // Settings
  if (!q || 'settings'.includes(q)) {
    results.push({ type: 'page', icon: 'fas fa-cog', label: 'Settings', sublabel: 'Page', action: () => navigate('settings') });
  }

  // ── Actions ──
  const actions = [
    { label: 'New Project', icon: 'fas fa-plus', keywords: 'create add project new', fn: () => { navigate('projects'); setTimeout(() => showProjectForm(), 200); } },
    { label: 'New Prospect', icon: 'fas fa-search-dollar', keywords: 'create add prospect new potential', fn: () => { navigate('prospects'); setTimeout(() => showProspectForm(), 200); } },
    { label: 'New Task', icon: 'fas fa-tasks', keywords: 'create add task new', fn: () => { navigate('tasks'); setTimeout(() => { if (typeof showTaskForm === 'function') showTaskForm(); }, 200); } },
    { label: 'Upload Document', icon: 'fas fa-cloud-upload-alt', keywords: 'upload file document attach', fn: () => { navigate('documents'); setTimeout(() => { if (typeof uploadDoc === 'function') uploadDoc(); }, 200); } },
    { label: 'Push to SharePoint', icon: 'fas fa-cloud-upload-alt', keywords: 'sync push save sharepoint upload', fn: () => { if (typeof spPushData === 'function') spPushData(false); } },
    { label: 'Pull from SharePoint', icon: 'fas fa-cloud-download-alt', keywords: 'sync pull refresh sharepoint download latest', fn: () => { if (typeof spPullData === 'function') spPullData(); } },
    { label: 'Export All Data (JSON)', icon: 'fas fa-file-export', keywords: 'export backup download json data', fn: () => { if (typeof exportData === 'function') exportData(); } },
    { label: 'Toggle Theme', icon: 'fas fa-moon', keywords: 'theme dark light mode toggle', fn: () => { if (typeof toggleTheme === 'function') toggleTheme(); } },
    { label: 'Keyboard Shortcuts', icon: 'fas fa-keyboard', keywords: 'shortcuts keys help keyboard', fn: () => showKbdHelp() },
    { label: 'Sign Out', icon: 'fas fa-sign-out-alt', keywords: 'logout sign out exit', fn: () => { if (typeof doLogout === 'function') doLogout(); } },
  ];
  actions.forEach(a => {
    if (!q || a.label.toLowerCase().includes(q) || a.keywords.includes(q)) {
      results.push({ type: 'action', icon: a.icon, label: a.label, sublabel: 'Action', action: a.fn });
    }
  });

  // ── Projects (search by name/id/client) ──
  if (q.length >= 2) {
    (AppState.data.projects || []).forEach(p => {
      if (p.id.toLowerCase().includes(q) || (p.name||'').toLowerCase().includes(q) || (p.client||'').toLowerCase().includes(q)) {
        results.push({
          type: 'project',
          icon: p.status === 'prospect' ? 'fas fa-search-dollar' : 'fas fa-briefcase',
          label: p.name,
          sublabel: p.id + ' · ' + (p.status || '') + (p.client ? ' · ' + p.client : ''),
          action: () => showProjectDetail(p.id)
        });
      }
    });

    // ── Documents ──
    (AppState.data.documents || []).slice(0, 50).forEach(d => {
      if ((d.name||'').toLowerCase().includes(q) || (d.number||'').toLowerCase().includes(q)) {
        results.push({
          type: 'document', icon: 'fas fa-file-alt', label: d.name,
          sublabel: 'Document · ' + (d.number || '') + ' · ' + (d.category || ''),
          action: () => { navigate('documents'); setTimeout(() => { if (typeof showDocDetail === 'function') showDocDetail(d.id); }, 300); }
        });
      }
    });

    // ── Library docs ──
    (AppState.data.libraryDocs || []).forEach(d => {
      if (d.status !== 'superseded' && ((d.name||'').toLowerCase().includes(q) || (d.number||'').toLowerCase().includes(q) || (d.tags||[]).join(' ').toLowerCase().includes(q))) {
        results.push({
          type: 'document', icon: 'fas fa-book', label: d.name,
          sublabel: 'Library · ' + (d.number||'') + ' Rev ' + (d.rev||'A') + ' · ' + (d.category||''),
          action: () => { navigate('library'); }
        });
      }
    });

    // ── Tasks ──
    (AppState.data.tasks || []).slice(0, 100).forEach(t => {
      if ((t.name||t.title||'').toLowerCase().includes(q)) {
        results.push({
          type: 'task', icon: 'fas fa-tasks', label: t.name || t.title,
          sublabel: 'Task · ' + (t.projectId || '') + ' · ' + (t.status || ''),
          action: () => { navigate('tasks'); }
        });
      }
    });

    // ── Assets ──
    ['equipment','tools','vehicles','consumables','materials'].forEach(typeKey => {
      (AppState.data[typeKey] || []).forEach(a => {
        if ((a.name||'').toLowerCase().includes(q) || (a.id||'').toLowerCase().includes(q)) {
          results.push({
            type: 'asset', icon: 'fas fa-toolbox', label: a.name,
            sublabel: typeKey.charAt(0).toUpperCase() + typeKey.slice(1) + ' · ' + a.id,
            action: () => { showAssetDetail(a.id, typeKey); }
          });
        }
      });
    });
  }

  // ── Recently viewed (when no query) ──
  if (!q) {
    const recent = _getRecentItems();
    recent.slice(0, 5).forEach(r => {
      results.unshift({
        type: 'recent', icon: 'fas fa-history', label: r.label,
        sublabel: 'Recent · ' + r.sublabel,
        action: () => _openRecentItem(r)
      });
    });
  }

  return results.slice(0, 12);
}

function renderCmdResults(query) {
  _cmdResults = _cmdBuildIndex(query);
  _cmdSelectedIdx = 0;
  const container = document.getElementById('cmdPaletteResults');
  if (!container) return;
  if (!_cmdResults.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px"><i class="fas fa-search" style="font-size:20px;opacity:.3;display:block;margin-bottom:8px"></i>No results for "${query}"</div>`;
    return;
  }
  const typeColors = { page:'var(--accent-blue)', action:'var(--accent-amber)', project:'var(--accent-green)', document:'#bc8cff', task:'#39d3f2', asset:'#fb8f44', recent:'var(--text-muted)' };
  container.innerHTML = _cmdResults.map((r, i) => `
    <div onclick="_cmdExecute(${i})" onmouseenter="_cmdSelectedIdx=${i};_cmdHighlight()"
      data-cmd-idx="${i}"
      style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;
        background:${i === _cmdSelectedIdx ? 'var(--bg-hover)' : 'transparent'}">
      <div style="width:30px;height:30px;border-radius:7px;background:${typeColors[r.type]||'var(--text-muted)'}18;color:${typeColors[r.type]||'var(--text-muted)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="${r.icon}" style="font-size:12px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.label}</div>
        <div style="font-size:10px;color:var(--text-muted)">${r.sublabel}</div>
      </div>
      ${i === _cmdSelectedIdx ? '<kbd style="font-size:9px;padding:2px 5px;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;color:var(--text-muted)">↵</kbd>' : ''}
    </div>
  `).join('');
}

function _cmdHighlight() {
  document.querySelectorAll('[data-cmd-idx]').forEach((el, i) => {
    el.style.background = i === _cmdSelectedIdx ? 'var(--bg-hover)' : 'transparent';
  });
}

function _cmdExecute(idx) {
  const r = _cmdResults[idx !== undefined ? idx : _cmdSelectedIdx];
  if (!r) return;
  closeCmdPalette();
  try { r.action(); } catch(e) { console.warn('Cmd action error:', e); }
}

function cmdPaletteKeyNav(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdSelectedIdx = Math.min(_cmdSelectedIdx + 1, _cmdResults.length - 1); _cmdHighlight(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdSelectedIdx = Math.max(_cmdSelectedIdx - 1, 0); _cmdHighlight(); }
  else if (e.key === 'Enter') { e.preventDefault(); _cmdExecute(); }
  else if (e.key === 'Escape') { closeCmdPalette(); }
}

// ── 2. RECENTLY VIEWED TRACKING ─────────────────────────────
function _trackRecentItem(type, id, label, sublabel) {
  try {
    let recent = JSON.parse(localStorage.getItem('shic_recent_items') || '[]');
    recent = recent.filter(r => !(r.type === type && r.id === id)); // dedupe
    recent.unshift({ type, id, label, sublabel, at: Date.now() });
    recent = recent.slice(0, 10);
    localStorage.setItem('shic_recent_items', JSON.stringify(recent));
  } catch(e) {}
}

function _getRecentItems() {
  try { return JSON.parse(localStorage.getItem('shic_recent_items') || '[]'); }
  catch(e) { return []; }
}

function _openRecentItem(r) {
  if (r.type === 'project') showProjectDetail(r.id);
  else if (r.type === 'page') navigate(r.id);
  else if (r.type === 'document') { navigate('documents'); setTimeout(() => { if (typeof showDocDetail === 'function') showDocDetail(r.id); }, 300); }
  else if (r.type === 'asset' && r.assetType) showAssetDetail(r.id, r.assetType);
}

// Hook into showProjectDetail to track recents
(function() {
  const _origSPD = window.showProjectDetail || (typeof showProjectDetail === 'function' ? showProjectDetail : null);
  if (typeof showProjectDetail === 'function') {
    const orig = showProjectDetail;
    window.showProjectDetail = function(id) {
      const p = (AppState.data.projects || []).find(x => x.id === id);
      if (p) _trackRecentItem('project', id, p.name, p.id + ' · ' + (p.status || ''));
      return orig.apply(this, arguments);
    };
  }
})();


// ═══════════════════════════════════════════════════════════