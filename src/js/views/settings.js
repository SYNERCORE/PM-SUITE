function renderSettings(){
AppState.ensureData();
  // Inject offline status into placeholder
  setTimeout(()=>{const osc=document.getElementById('offlineStatusContainer');if(osc)osc.innerHTML=getOfflineStatusHTML();},80);
  setTimeout(()=>{const b=document.getElementById('storageUsageBar');if(b&&typeof _storageUsageHTML==='function')b.innerHTML=_storageUsageHTML();},100);
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
        <label class="toggle" style="width:38px;height:20px"><input type="checkbox" id="sAutoBackup" ${settings.autoBackup!==false?'checked':''}><span class="toggle-slider"></span></label>
        Daily auto-backup to Downloads (default on)
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
    <div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-item-info"><div class="title"><i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:5px"></i>SLA Escalation Email</div><div class="desc">Fallback email for SLA breach alerts. Leave blank to notify only step approvers.</div></div>
      <input class="form-input" id="sEscalationEmail" placeholder="manager@company.com" value="${settings.escalationEmail||''}" style="width:100%;font-size:11px">
    </div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div><div style="font-size:14px;font-weight:600"><i class="fas fa-users-cog" style="color:var(--accent-purple);margin-right:7px"></i>Approver Roles</div>
      <div style="font-size:11px;color:var(--text-secondary)">Define named groups for workflow steps. Changes apply to new routes only.</div></div>
      <button class="btn btn-primary btn-sm" onclick="_arAddRole()"><i class="fas fa-plus"></i> Add Role</button>
    </div>
    <div id="approverRolesWrap">${_renderApproverRoles()}</div>
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
      <button class="btn btn-danger" onclick="clearAllData()"><i class="fas fa-trash"></i> Clear All Data</button>
      <button class="btn btn-secondary" onclick="showPatchImport()"><i class="fas fa-bolt"></i> Apply Update Patch</button>
      <button class="btn btn-secondary" onclick="cleanUpStorage()" style="border-color:var(--accent-amber);color:var(--accent-amber)" title="Remove soft-deleted records from local storage to free up space"><i class="fas fa-broom"></i> Clean Up Storage</button>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-secondary" onclick="archiveProjects()" style="border-color:var(--accent-cyan);color:var(--accent-cyan)" title="Export completed projects older than threshold to JSON and remove from active data"><i class="fas fa-archive"></i> Archive Old Projects</button>
        <button class="btn btn-secondary" onclick="_restoreArchiveFile()" style="border-color:var(--accent-green);color:var(--accent-green)" title="Restore previously archived projects from JSON file"><i class="fas fa-upload"></i> Restore Archive</button>
        <span style="font-size:10px;color:var(--text-muted)">after</span>
        <input class="form-input" id="sArchiveDays" type="number" min="30" value="${settings.archiveAfterDays||180}" style="width:60px;height:28px;font-size:11px">
        <span style="font-size:10px;color:var(--text-muted)">days</span>
      </div>
      <button class="btn btn-secondary" onclick="restorePreSyncSnapshot()" title="Undo the last SharePoint sync merge — restores your data to the state just before it"><i class="fas fa-clock-rotate-left"></i> Restore Pre-Sync Snapshot</button>
      <button class="btn btn-secondary" onclick="showSnapshotRestore()" title="Restore data from one of the last 3 automatic local snapshots"><i class="fas fa-history"></i> Restore from Snapshot</button>
      <div id="storageUsageBar" style="margin-top:4px"></div>
      <button class="btn btn-secondary" onclick="requestNotifPermission()"><i class="fas fa-bell" style="margin-right:6px;color:var(--accent-blue)"></i> Enable Desktop Notifications</button>
      <button class="btn btn-secondary" onclick="clearDemoData()" style="border-color:var(--accent-amber);color:var(--accent-amber)"><i class="fas fa-broom" style="margin-right:6px"></i> Clear Demo Data &amp; Start Fresh</button>
      <div id="adminOnlyBtns" style="display:none;flex-direction:column;gap:8px">
        <div style="font-size:10px;color:var(--accent-amber);padding:6px 10px;background:rgba(248,81,73,.07);border-radius:6px;border-left:3px solid var(--accent-amber)">
          <i class="fas fa-shield-alt" style="margin-right:5px"></i><strong>Admin Only</strong> — affects all team members
        </div>
        <button class="btn btn-secondary" onclick="showAuditLogPanel()"><i class="fas fa-history" style="margin-right:6px;color:var(--accent-blue)"></i> Audit Trail</button>
        <button class="btn btn-secondary" onclick="showDropdownManager()"><i class="fas fa-list-ul" style="margin-right:6px;color:var(--accent-blue)"></i> Manage Dropdown Options</button>
        <button class="btn btn-secondary" onclick="showOrgChartImporter()"><i class="fas fa-sitemap" style="margin-right:6px;color:var(--accent-blue)"></i> Import Org Chart (Reports-To)</button>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg-hover);border-radius:6px;font-size:10px;color:var(--text-secondary);line-height:1.7">
      <strong>Where is my data?</strong><br>
      Data is stored in your browser's <strong>localStorage</strong> on this device.<br>
      It persists across browser restarts but is <strong>device-specific</strong>.<br>
      Use <strong>SharePoint sync</strong> (M365) or OneDrive sync above, or Export JSON to back up across devices.
    </div>
  </div>
  <div class="card" style="grid-column:1/-1;border:1px solid rgba(56,139,253,.25)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#0ea5e9,#0369a1);border-radius:9px;display:flex;align-items:center;justify-content:center"><i class="fas fa-server" style="color:#fff"></i></div>
        <div>
          <div style="font-size:14px;font-weight:600">Local Server (LAN)</div>
          <div style="font-size:11px;color:var(--text-secondary)">Optional in-house PostgreSQL + API. Runs alongside SharePoint.</div>
        </div>
        <span id="localSrvDot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--text-muted);margin-left:6px" title="Not tested"></span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_localSrvTestConnection()"><i class="fas fa-plug"></i> Test Connection</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:11px">Server URL <span style="color:var(--text-muted);font-weight:400">(e.g. https://procmaster.local)</span></label>
        <input class="form-input" id="localSrvUrl" placeholder="https://procmaster.local" value="${(settings.localServerUrl||'').replace(/"/g,'&quot;')}">
      </div>
      <button class="btn btn-primary" onclick="_localSrvSave()"><i class="fas fa-save"></i> Save</button>
    </div>
    <div id="localSrvStatus" style="font-size:11px;color:var(--text-muted);margin-top:10px;min-height:16px"></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:10px;line-height:1.6">
      Leave blank to disable. When set, the app will call <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">GET /health</code> to verify. See <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">deploy/README.md</code> for IT setup.
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
AppState.data.settings.escalationEmail=(document.getElementById('sEscalationEmail')?.value||'').trim().toLowerCase();
AppState.data.settings.archiveAfterDays=parseInt(document.getElementById('sArchiveDays')?.value)||180;
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





// ═══ APPROVER ROLES CRUD ═════════════════════════════════════
function _renderApproverRoles(){
  const roles=AppState.data.settings?.approverRoles||[];
  if(!roles.length)return'<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:11px"><i class="fas fa-users-cog" style="font-size:20px;display:block;margin-bottom:6px;opacity:.3"></i>No approver roles defined yet.</div>';
  return roles.map((r,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
    <i class="fas fa-users" style="color:var(--accent-purple);font-size:13px"></i>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600">${esc(r.name)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${(r.members||[]).join(', ')||'No members'}</div>
    </div>
    <button class="btn btn-secondary btn-sm btn-icon" onclick="_arEditRole('${r.id}')" title="Edit"><i class="fas fa-edit"></i></button>
    <button class="btn btn-danger btn-sm btn-icon" onclick="_arDeleteRole('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
  </div>`).join('');
}
function _arAddRole(){
  _arShowForm(null);
}
function _arEditRole(id){
  const r=(AppState.data.settings?.approverRoles||[]).find(x=>x.id===id);
  if(r)_arShowForm(r);
}
function _arShowForm(role){
  $('#genericModalTitle').textContent=role?'Edit Approver Role':'New Approver Role';
  $('#genericModalBody').innerHTML=`
    <div class="form-group"><label class="form-label">Role Name</label>
      <input class="form-input" id="arName" value="${role?.name||''}" placeholder="e.g. Finance Approvers"></div>
    <div class="form-group"><label class="form-label">Members (emails, one per line)</label>
      <textarea class="form-input" id="arMembers" rows="4" placeholder="alice@company.com&#10;bob@company.com" style="font-size:11px;font-family:var(--font-mono)">${(role?.members||[]).join('\n')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
      <button class="btn btn-primary" onclick="_arSaveRole('${role?.id||''}')"><i class="fas fa-save"></i> Save</button>
    </div>`;
  openModal('genericModal');
}
function _arSaveRole(id){
  const name=($('#arName')?.value||'').trim();
  if(!name){showToast('Name is required','error');return;}
  const members=($('#arMembers')?.value||'').split(/[\n,]+/).map(s=>s.trim().toLowerCase()).filter(s=>s.includes('@'));
  if(!members.length){showToast('At least one valid email required','error');return;}
  if(!AppState.data.settings.approverRoles)AppState.data.settings.approverRoles=[];
  if(id){
    const r=AppState.data.settings.approverRoles.find(x=>x.id===id);
    if(r){r.name=name;r.members=members;}
  }else{
    AppState.data.settings.approverRoles.push({id:'AR-'+Date.now(),name,members});
  }
  AppState.save();
  closeModal('genericModal');
  showToast('Approver role saved','success');
  const w=$('#approverRolesWrap');if(w)w.innerHTML=_renderApproverRoles();
  if(typeof spWriteAuditLog==='function')spWriteAuditLog('approver_role_saved','settings',id||'new',name,{members:members.join(', ')});
}
function _arDeleteRole(id){
  if(!confirm('Delete this approver role?'))return;
  AppState.data.settings.approverRoles=(AppState.data.settings.approverRoles||[]).filter(x=>x.id!==id);
  AppState.save();
  const w=$('#approverRolesWrap');if(w)w.innerHTML=_renderApproverRoles();
  showToast('Role deleted','warning');
}

// ═══ PROJECT ARCHIVING ═══════════════════════════════════════
function archiveProjects(){
  if(!(typeof isAdminUser==='function'&&isAdminUser())){showToast('Admin only','error');return;}
  const days=AppState.data.settings?.archiveAfterDays||180;
  const cutoff=Date.now()-days*864e5;
  const projects=(AppState.data.projects||[]).filter(p=>!p._deleted&&!p._archived&&(p.status==='completed'||p.status==='archived')&&p.updatedAt&&new Date(p.updatedAt).getTime()<cutoff);
  if(!projects.length){showToast(`No completed/archived projects older than ${days} days found`,'info');return;}
  const pIds=new Set(projects.map(p=>p.id));
  const relKeys=['tasks','costs','qaqc','risks','actions','documents','resourceAllocations','resourceUsageLogs','procurement','procurementLogs','progress','dailyMeetingLogs'];
  const bundle={archivedAt:new Date().toISOString(),version:APP_VERSION,projects:[],related:{}};
  bundle.projects=projects;
  relKeys.forEach(k=>{
    const recs=(AppState.data[k]||[]).filter(r=>r.projectId&&pIds.has(r.projectId)&&!r._archived);
    if(recs.length)bundle.related[k]=recs;
  });
  const totalRecs=bundle.projects.length+Object.values(bundle.related).reduce((s,a)=>s+a.length,0);
  if(!confirm(`Archive ${projects.length} project(s) and ${totalRecs-projects.length} related records?\n\nA JSON file will download first, then records are removed from active data.`))return;
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='archive_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  AppState.data.projects=AppState.data.projects.filter(p=>!pIds.has(p.id));
  relKeys.forEach(k=>{if(!AppState.data[k])return;const before=AppState.data[k].length;AppState.data[k]=AppState.data[k].filter(r=>!r.projectId||!pIds.has(r.projectId));});
  AppState.save();
  if(typeof spWriteAuditLog==='function')spWriteAuditLog('archive_projects','projects','batch',`${projects.length} projects`,{ids:projects.map(p=>p.id).join(', ')});
  showToast(`Archived ${projects.length} project(s) + ${totalRecs-projects.length} records. File downloaded.`,'success',6000);
  const bar=document.getElementById('storageUsageBar');if(bar&&typeof _storageUsageHTML==='function')bar.innerHTML=_storageUsageHTML();
}
function _restoreArchiveFile(){
  if(!(typeof isAdminUser==='function'&&isAdminUser())){showToast('Admin only','error');return;}
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const bundle=JSON.parse(ev.target.result);
        if(!bundle.projects||!Array.isArray(bundle.projects)){showToast('Invalid archive file','error');return;}
        const count={proj:0,rec:0};
        bundle.projects.forEach(p=>{
          const existing=(AppState.data.projects||[]).find(x=>x.id===p.id);
          if(existing)Object.assign(existing,p);
          else{AppState.data.projects.push(p);}
          count.proj++;
        });
        Object.entries(bundle.related||{}).forEach(([k,recs])=>{
          if(!AppState.data[k])AppState.data[k]=[];
          recs.forEach(r=>{
            const existing=AppState.data[k].find(x=>x.id===r.id);
            if(existing)Object.assign(existing,r);
            else AppState.data[k].push(r);
            count.rec++;
          });
        });
        AppState.save();
        if(typeof spWriteAuditLog==='function')spWriteAuditLog('restore_archive','projects','batch',`${count.proj} projects`,{});
        showToast(`Restored ${count.proj} project(s) + ${count.rec} records from archive`,'success',5000);
        try{navigate('settings');}catch(e){}
      }catch(err){showToast('Failed to parse archive: '+err.message,'error');}
    };
    reader.readAsText(file);
  };
  inp.click();
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

// ── Snapshot restore UI (IndexedDB rolling snapshots) ──────
async function showSnapshotRestore(){
  const snaps=await _idbListSnapshots();
  if(!snaps.length){showToast('No snapshots yet — they are created automatically as you work (one per 10 minutes)','info',5000);return;}
  $('#genericModalTitle').textContent='Restore from Snapshot';
  $('#genericModalBody').innerHTML=`
    <div style="padding:10px 12px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:8px;margin-bottom:12px;font-size:11px;color:var(--text-secondary)">
      Snapshots are taken automatically while you work (max one per 10 minutes, last ${snaps.length} kept).
      Restoring replaces your current local data — a snapshot of the current state is saved first, so you can switch back.
    </div>
    ${snaps.map((s,i)=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:7px">
        <i class="fas fa-camera" style="color:var(--accent-blue)"></i>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600">${new Date(s.ts).toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-muted)">${s.count||0} records ${s.plain===undefined?'· <i class="fas fa-lock" style="font-size:9px"></i> encrypted':''} ${i===0?'· newest':''}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="restoreSnapshot(${s.ts})"><i class="fas fa-undo"></i> Restore</button>
      </div>`).join('')}`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

async function restoreSnapshot(ts){
  const snaps=await _idbListSnapshots();
  const snap=snaps.find(s=>s.ts===ts);
  if(!snap){showToast('Snapshot not found','error');return;}
  if(!confirm('Restore data from '+new Date(ts).toLocaleString()+'?\n\nYour current state will be snapshotted first so you can switch back.'))return;
  try{
    const json=await _snapDecrypt(snap);
    const parsed=JSON.parse(json);
    // Save current state as a new snapshot (forced, bypasses throttle) before replacing
    await _idbSaveSnapshot(JSON.stringify(AppState.data),typeof _dataRecordCount==='function'?_dataRecordCount(AppState.data):0,true);
    AppState.data=Object.assign(getDefaultData(),parsed);
    if(typeof migrateData==='function')migrateData();
    if(typeof _rebaselineMAtHashes==='function')_rebaselineMAtHashes();
    AppState.save();
    closeModal('genericModal');
    try{renderPage(AppState.currentPage||'dashboard');}catch(e){}
    try{buildSidebar();}catch(e){}
    showToast('Restored snapshot from '+new Date(ts).toLocaleString()+' — review, then Sync Now to push','success',7000);
  }catch(e){showToast('Restore failed: '+e.message,'error',6000);}
}

function cleanUpStorage(){
  AppState.ensureData();
  const arrays=['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization','idChangeRequests','notifications','activities',
    'warehouseItems','stockTransactions','issuanceRequests'];
  let removed=0;
  arrays.forEach(k=>{
    if(!AppState.data[k])return;
    const before=AppState.data[k].length;
    AppState.data[k]=AppState.data[k].filter(r=>!r||!r._deleted);
    removed+=before-AppState.data[k].length;
  });
  // Remove the old backup key which doubles storage
  try{localStorage.removeItem('shic_data_backup');}catch(e){}
  // Remove stale MSAL cache entries
  const msalKeys=Object.keys(localStorage).filter(k=>k.startsWith('msal.'));
  msalKeys.forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
  AppState.save();
  // Update usage display
  const usedKB=Math.round(JSON.stringify(AppState.data).length/1024);
  showToast(`Storage cleaned — removed ${removed} deleted record(s). Current size: ~${usedKB} KB`,'success',5000);
  const bar=document.getElementById('storageUsageBar');
  if(bar)bar.innerHTML=_storageUsageHTML();
}

function _storageUsageHTML(){
  let used=0;
  try{Object.keys(localStorage).forEach(k=>{used+=((localStorage.getItem(k)||'').length*2);});}catch(e){}
  const usedKB=Math.round(used/1024);
  const pct=Math.min(100,Math.round(usedKB/5120*100));
  const color=pct>80?'var(--accent-red)':pct>60?'var(--accent-amber)':'var(--accent-green)';
  return`<div style="font-size:10px;color:var(--text-secondary);margin-top:6px">
    Local storage: <strong style="color:${color}">${usedKB} KB / ~5,120 KB</strong>
    <div style="height:4px;border-radius:2px;background:var(--border);margin-top:4px">
      <div style="height:4px;border-radius:2px;background:${color};width:${pct}%"></div>
    </div>
  </div>`;
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

// ── Local Server config + health probe ────────────────────────
// Persists settings.localServerUrl and wires the Api facade to it.
// Test button pings /health; result rendered inline with a colored
// dot indicator. When healthy, subsequent app work can flip specific
// entities over to the local server via Store's backend flag.
function _localSrvSave() {
  const raw = (document.getElementById('localSrvUrl')?.value || '').trim().replace(/\/+$/, '');
  AppState.data.settings = AppState.data.settings || {};
  AppState.data.settings.localServerUrl = raw;
  AppState.save();
  if (raw && typeof Api !== 'undefined' && Api.configure) {
    Api.configure({
      baseUrl: raw,
      getToken: async () => {
        try {
          if (typeof _spMsalApp !== 'undefined' && _spMsalApp && _spAccount) {
            const clientId = (typeof _spClientId !== 'undefined') ? _spClientId : '';
            const r = await _spMsalApp.acquireTokenSilent({
              scopes: [ 'api://' + clientId + '/access_as_user' ],
              account: _spAccount,
            });
            return r?.accessToken || '';
          }
        } catch (e) { console.warn('[local-srv] token failed:', e.message); }
        return '';
      },
    });
  }
  showToast(raw ? 'Local server URL saved' : 'Local server disabled', 'success', 2500);
  _localSrvUpdateDot('unknown', 'Saved — click Test Connection');
}

async function _localSrvTestConnection() {
  const raw = (document.getElementById('localSrvUrl')?.value || '').trim().replace(/\/+$/, '');
  if (!raw) { _localSrvUpdateDot('bad', 'Enter a URL first'); return; }
  _localSrvUpdateDot('pending', 'Contacting server…');
  try {
    const started = Date.now();
    const res = await fetch(raw + '/health');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    const ms = Date.now() - started;
    const dbOk = body.db === 'connected';
    _localSrvUpdateDot(dbOk ? 'good' : 'warn',
      `${dbOk ? '✓' : '⚠'} status=${body.status} · db=${body.db} · v${body.version || '?'} · ${ms}ms`);
  } catch (e) {
    _localSrvUpdateDot('bad', 'Unreachable: ' + e.message);
  }
}

function _localSrvUpdateDot(state, msg) {
  const dot = document.getElementById('localSrvDot');
  const status = document.getElementById('localSrvStatus');
  const colors = { good: 'var(--accent-green)', warn: 'var(--accent-amber)', bad: 'var(--accent-red)', pending: 'var(--accent-blue)', unknown: 'var(--text-muted)' };
  if (dot) { dot.style.background = colors[state] || colors.unknown; dot.title = msg || ''; }
  if (status) {
    const colorMap = { good: 'var(--accent-green)', warn: 'var(--accent-amber)', bad: 'var(--accent-red)' };
    status.style.color = colorMap[state] || 'var(--text-muted)';
    status.textContent = msg || '';
  }
}

// Auto-configure Api on app boot from persisted setting.
(function _localSrvBoot() {
  try {
    const url = AppState?.data?.settings?.localServerUrl;
    if (url && typeof Api !== 'undefined' && Api.configure) {
      Api.configure({
        baseUrl: url,
        getToken: async () => {
          try {
            if (typeof _spMsalApp !== 'undefined' && _spMsalApp && _spAccount) {
              const clientId = (typeof _spClientId !== 'undefined') ? _spClientId : '';
              const r = await _spMsalApp.acquireTokenSilent({
                scopes: [ 'api://' + clientId + '/access_as_user' ],
                account: _spAccount,
              });
              return r?.accessToken || '';
            }
          } catch (e) {}
          return '';
        },
      });
    }
  } catch (e) { /* boot best-effort */ }
})();

// ── Org Chart Importer ────────────────────────────────────────
// Paste CSV/TSV with two columns: Name, Reports To. First row can be
// a header (auto-detected). Preview shows exact matches and misses,
// then Apply sets resource.manager on each matched Resource.
function showOrgChartImporter() {
  const title = document.getElementById('genericModalTitle');
  const body  = document.getElementById('genericModalBody');
  const foot  = document.getElementById('genericModalFooter');
  if (!title || !body || !foot) return;
  title.textContent = 'Import Org Chart (Reports-To)';
  body.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.6">
      Paste your org chart below. Two columns per line: <strong>Employee Name</strong>, <strong>Reports To</strong>.
      Separator can be a comma, tab, or semicolon. Names must match Personnel records exactly (case-insensitive).
      Existing Reports-To values are overwritten by this import.
      <details style="margin-top:6px"><summary style="cursor:pointer;color:var(--accent-blue)">Example</summary>
        <pre style="font-size:11px;background:var(--bg-hover);padding:8px;border-radius:6px;margin-top:6px">Name,Reports To
Alice Manager,
Bob Worker,Alice Manager
Carol Dev,Alice Manager
Dave Extern,Alice Manager</pre>
      </details>
    </div>
    <textarea id="_orgChartCsv" class="form-input" style="width:100%;min-height:180px;font-family:var(--font-mono);font-size:12px" placeholder="Paste rows here (name, manager)"></textarea>
    <div id="_orgChartPreview" style="margin-top:10px;font-size:12px"></div>
  `;
  foot.innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-secondary" onclick="_orgChartPreview()"><i class="fas fa-eye"></i> Preview</button>
    <button class="btn btn-primary" onclick="_orgChartApply()" id="_orgChartApplyBtn" disabled><i class="fas fa-check"></i> Apply</button>
  `;
  openModal('genericModal');
}

function _orgChartParse(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return rows;
  // Auto-detect header if first row looks like column names
  const first = lines[0].toLowerCase();
  const hasHeader = /\b(name|employee|person)\b/.test(first) && /\b(reports?|manager|supervisor)\b/.test(first);
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (!parts[0]) continue;
    rows.push({ name: parts[0], manager: parts[1] || '' });
  }
  return rows;
}

function _orgChartResolve(rows) {
  const resources = (AppState.data.resources || []).filter(r => !r._deleted);
  const byLower = new Map(resources.map(r => [String(r.name).toLowerCase(), r]));
  const matches = [];
  const misses  = [];
  const managerMisses = new Set();
  for (const row of rows) {
    const person = byLower.get(row.name.toLowerCase());
    if (!person) { misses.push(row.name); continue; }
    let managerName = '';
    if (row.manager) {
      const mgr = byLower.get(row.manager.toLowerCase());
      if (mgr) managerName = mgr.name;
      else managerMisses.add(row.manager);
    }
    matches.push({ id: person.id, name: person.name, from: person.manager || '', to: managerName });
  }
  return { matches, misses, managerMisses: Array.from(managerMisses) };
}

function _orgChartPreview() {
  const text = document.getElementById('_orgChartCsv')?.value || '';
  const rows = _orgChartParse(text);
  const previewEl = document.getElementById('_orgChartPreview');
  const applyBtn = document.getElementById('_orgChartApplyBtn');
  if (!previewEl || !applyBtn) return;
  if (!rows.length) {
    previewEl.innerHTML = '<div class="empty-state" style="padding:14px;font-size:12px">No rows detected.</div>';
    applyBtn.disabled = true;
    return;
  }
  const { matches, misses, managerMisses } = _orgChartResolve(rows);
  const changes = matches.filter(m => m.from !== m.to);
  applyBtn.disabled = changes.length === 0;
  applyBtn.dataset.rows = JSON.stringify(matches);
  previewEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
      <div class="stat-card" style="padding:8px 10px"><div style="font-size:18px;font-weight:700">${rows.length}</div><div style="font-size:10px;color:var(--text-muted)">ROWS PARSED</div></div>
      <div class="stat-card" style="padding:8px 10px"><div style="font-size:18px;font-weight:700;color:var(--accent-green)">${changes.length}</div><div style="font-size:10px;color:var(--text-muted)">CHANGES</div></div>
      <div class="stat-card" style="padding:8px 10px"><div style="font-size:18px;font-weight:700;color:var(--accent-red)">${misses.length}</div><div style="font-size:10px;color:var(--text-muted)">UNKNOWN PEOPLE</div></div>
      <div class="stat-card" style="padding:8px 10px"><div style="font-size:18px;font-weight:700;color:var(--accent-amber)">${managerMisses.length}</div><div style="font-size:10px;color:var(--text-muted)">UNKNOWN MANAGERS</div></div>
    </div>
    ${changes.length ? `<div style="max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:6px">
      <table class="data-table" style="margin:0"><thead><tr><th>Person</th><th>Current</th><th>New</th></tr></thead>
      <tbody>${changes.map(c => `<tr>
        <td>${c.name}</td>
        <td style="color:var(--text-muted)">${c.from || '—'}</td>
        <td style="font-weight:600">${c.to || '(clear)'}</td>
      </tr>`).join('')}</tbody></table>
    </div>` : '<div style="color:var(--text-muted);font-size:12px">No changes to apply — everyone already matches.</div>'}
    ${misses.length ? `<div style="margin-top:8px;padding:8px;background:rgba(248,81,73,.08);border-left:3px solid var(--accent-red);border-radius:4px;font-size:11px">
      <strong>Unknown people (skipped):</strong> ${misses.slice(0, 20).join(', ')}${misses.length > 20 ? ` … +${misses.length - 20} more` : ''}
    </div>` : ''}
    ${managerMisses.length ? `<div style="margin-top:6px;padding:8px;background:rgba(210,153,34,.08);border-left:3px solid var(--accent-amber);border-radius:4px;font-size:11px">
      <strong>Unknown managers (will be cleared):</strong> ${managerMisses.slice(0, 20).join(', ')}${managerMisses.length > 20 ? ` … +${managerMisses.length - 20} more` : ''}
    </div>` : ''}
  `;
}

function _orgChartApply() {
  const btn = document.getElementById('_orgChartApplyBtn');
  const rows = btn?.dataset?.rows ? JSON.parse(btn.dataset.rows) : [];
  if (!rows.length) return;
  let changed = 0;
  const resources = AppState.data.resources || [];
  for (const row of rows) {
    const rec = resources.find(r => r.id === row.id);
    if (!rec) continue;
    if ((rec.manager || '') === (row.to || '')) continue;
    rec.manager = row.to || '';
    if (typeof _stampEdit === 'function') _stampEdit(rec);
    changed++;
  }
  AppState.save();
  if (typeof Audit !== 'undefined') Audit.record('import', `Org chart applied · ${changed} record${changed === 1 ? '' : 's'} updated`, { changed });
  closeModal('genericModal');
  showToast(`Org chart applied — ${changed} record${changed === 1 ? '' : 's'} updated`, 'success', 4000);
}

// ═══════════════════════════════════════════════════════════