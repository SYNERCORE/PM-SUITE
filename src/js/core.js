// ── APP VERSION & BUILD INFO ──────────────────────────────
const APP_VERSION='2.9.0';
const APP_BUILD='20260707b';
// One-line summary of this release — shown in the update banner on other users' screens
const APP_RELEASE_NOTE='SLA auto-escalation, role-based workflow approvers, project archiving';
const APP_NAME='SHIC Enterprise PM Suite';
const APP_CODENAME='Syncore';
// CHANGELOG — add new entries at the top when patching
const APP_CHANGELOG=[
  {version:'2.9.0',date:'2026-07-07',type:'major',notes:[
    'SLA auto-escalation: overdue workflow steps trigger notifications + webhook',
    'Role-based approver steps: define approver roles in Settings, assign to workflow steps',
    'Project archiving: export completed projects to JSON, remove from active data',
    'Escalation email setting for fallback SLA breach alerts',
  ]},
  {version:'2.1.1',date:'2026-05-28',type:'patch',notes:[
    'Module access control: admins can restrict modules per user',
    'Procurement: added Disapproved status, renamed Stage → Status, PO Issued flow',
    'Version migration guard — no longer downgrades stored version on reload',
    'GitHub update check URL fix — no more 404 console errors',
  ]},
  {version:'2.1.0',date:'2026-05-28',type:'major',notes:[
    'Full procurement module: 13-stage workflow, activity log, history timeline',
    'Login system: admin approval, user management',
    'Offline mode: works without internet, auto-syncs when restored',
    'OneDrive cloud sync integration',
    'Asset History: auto-updates tracking table from history events',
    'Resource Allocation: qty-based with Issue/Return transaction log',
    'Gantt chart per project with resource allocation bars',
    'PWA installable as app on mobile and desktop',
  ]},
  {version:'2.0.0',date:'2026-05-26',type:'major',notes:[
    'Asset Masterlist with full CRUD for all asset types',
    'Excel/CSV import for all asset types',
    'Project Detail: 10 tabs including Cost Control, Allocation, Gantt',
    'EVM metrics (CPI, SPI, EAC) in Cost Control tab',
    'Real-time currency changed to Philippine Peso (₱)',
    'safeDate() utility to prevent N/A in date inputs',
  ]},
  {version:'1.0.0',date:'2026-05-20',type:'initial',notes:[
    'Initial release: 18 modules including Dashboard, Projects, Tasks, Gantt',
    'Resources: Personnel, Equipment, Tools, Vehicles, Consumables, Materials, 3rd Party',
    'LocalStorage persistence with auto-save every 30s',
  ]},
];
// Migration registry — add new migration functions here when adding new data structures
const DATA_MIGRATIONS={
  '2.7.0': function(data){
    if(!data.workflowDefs)data.workflowDefs=[];
    return data;
  },
  '2.4.0': function(data){
    if(!data.warehouseItems)data.warehouseItems=[];
    if(!data.stockTransactions)data.stockTransactions=[];
    if(!data.issuanceRequests)data.issuanceRequests=[];
    return data;
  },
  '2.3.0': function(data){
    // Baseline fields: ensure all projects have baselines array and activeBaseline
    (data.projects||[]).forEach(p=>{
      if(!p.baselines)p.baselines=[];
      if(p.activeBaseline===undefined)p.activeBaseline=null;
    });
    return data;
  },
  '2.2.0': function(data){
    // CPM fields: ensure predecessors and durationHrs exist on all tasks
    (data.tasks||[]).forEach(t=>{
      if(t.predecessors===undefined)t.predecessors='';
      if(!t.durationHrs||t.durationHrs<=0){
        // Derive from existing date span (calendar days * 8hr default)
        if(t.startDate&&(t.endDate||t.dueDate)){
          const s=new Date(t.startDate);
          const e=new Date(t.endDate||t.dueDate);
          const calDays=Math.max(1,Math.round((e-s)/86400000));
          t.durationHrs=calDays*8;
        }else{
          t.durationHrs=8; // default 1 day
        }
      }
    });
    // Ensure all projects have a calendar field
    (data.projects||[]).forEach(p=>{
      if(!p.calendar){
        p.calendar={workDays:[1,2,3,4,5],hoursPerDay:8,mode:'standard'};
      }
    });
    return data;
  },
  '2.1.0': function(data){
    if(!data.procurementLogs)data.procurementLogs=[];
    // Migrate old 'ordered' status to 'po_issued'
    (data.procurement||[]).forEach(p=>{if(p.status==='ordered')p.status='po_issued';});
    if(!data.projectTeam)data.projectTeam=[];
    if(!data.resourceUsageLogs)data.resourceUsageLogs=[];
    // Ensure all procurement records have new fields
    // Add default trades list if missing
    if(!data.activities)data.activities=[];
    if(!data.notifications)data.notifications=[];
    if(!data.trades||!data.trades.length){
      data.trades=[
        'Structural Fitter','Pipe Welder','TIG Welder','SMAW Welder','Pipe Fitter',
        'Rigger/Signalman','Scaffolder','Electrician','Instrumentation Tech',
        'Mechanical Fitter','Millwright','Insulation Worker','Painter/Blaster',
        'Civil/Concrete Worker','Rebar Fixer','Carpenter','Heavy Equipment Operator',
        'Crane Operator','Forklift Operator','Safety Officer','QC Inspector',
        'Document Controller','Storekeeper','Driver','Helper/Laborer',
      ];
    }
    (data.procurement||[]).forEach((p,i)=>{
      if(!p.requestedBy)p.requestedBy='';
      if(!p.responsiblePerson)p.responsiblePerson='';
      if(!p.prNumber)p.prNumber='';
      if(!p.requestNumber)p.requestNumber='REQ-'+String(i+1).padStart(3,'0');
      if(!p.budgetAmount)p.budgetAmount=p.amount||0;
      if(!p.attachments)p.attachments=[];
      // poNumber left blank if not explicitly set — don't auto-assign PR id as PO number
      if(!p.priority)p.priority='normal';
      if(!p.paymentTerms)p.paymentTerms='';
      if(!p.deliveryAddress)p.deliveryAddress='';
      if(!p.prDate)p.prDate=p.poDate||'';
    });
    return data;
  },
};
// Track which version the stored data was last migrated to
function getStoredDataVersion(){return localStorage.getItem('shic_data_version')||'1.0.0';}
function setStoredDataVersion(v){localStorage.setItem('shic_data_version',v);}

// ── AES-GCM localStorage encryption ─────────────────────────
// Key is derived per-user from M365 UID via PBKDF2. Null before login.
let _cryptoKey = null;

async function _initEncryption(uid) {
  try {
    const saltKey = 'shic_enc_salt_' + uid;
    let saltHex = localStorage.getItem(saltKey);
    let salt;
    if (saltHex) {
      salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      saltHex = Array.from(salt).map(b => b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(saltKey, saltHex);
    }
    const km = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(uid + 'shic_v1'), 'PBKDF2', false, ['deriveKey']
    );
    _cryptoKey = await crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
      km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
    );
    console.log('[SHIC] Local data encryption active');
  } catch(e) {
    console.warn('[SHIC] Encryption init failed:', e.message);
    _cryptoKey = null;
  }
}

async function _encryptAndStore(json) {
  if (!_cryptoKey) return false;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv}, _cryptoKey, new TextEncoder().encode(json));
    const ivHex = Array.from(iv).map(b=>b.toString(16).padStart(2,'0')).join('');
    const u8=new Uint8Array(ct);let bin='';for(let i=0;i<u8.length;i++)bin+=String.fromCharCode(u8[i]);
    const ctB64 = btoa(bin);
    const enc = JSON.stringify({__enc:1,iv:ivHex,ct:ctB64});
    localStorage.setItem('pm_data', enc);
    // Encryption is active — remove any stale PLAINTEXT copies of the data
    try{const b=localStorage.getItem('shic_data_backup');if(b&&b.indexOf('"__enc"')<0)localStorage.removeItem('shic_data_backup');}catch(e){}
    try{const o=localStorage.getItem('shic_offline_data');if(o&&o.indexOf('"__enc"')<0)localStorage.removeItem('shic_offline_data');}catch(e){}
    return true;
  } catch(e) { console.warn('[SHIC] Encrypt failed:', e.message); return false; }
}

async function _decryptFromStorage() {
  if (!_cryptoKey) return null;
  try {
    const s = localStorage.getItem('pm_data') || localStorage.getItem('shic_data_backup');
    if (!s) return null;
    const p = JSON.parse(s);
    if (!p.__enc) return s; // plaintext — return as-is for migration
    const iv = new Uint8Array(p.iv.match(/../g).map(h=>parseInt(h,16)));
    const ct = Uint8Array.from(atob(p.ct), c=>c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({name:'AES-GCM',iv}, _cryptoKey, ct);
    return new TextDecoder().decode(pt);
  } catch(e) { console.warn('[SHIC] Decrypt failed — using fallback:', e.message); return null; }
}

// ── Per-record modified timestamps (_mAt) ────────────────────
// Stamped centrally on every save for any record whose content changed.
// Sync merges use _mAt so the NEWEST edit wins, not whoever syncs last.
let _mAtHashes={}; // { arrayKey: { recordId: contentHash } }
function _mAtHash(r){
  // Hash record content EXCLUDING volatile/merge fields so stamping is stable
  const{_mAt,_newlyCreated,_localCreatedAt,...rest}=r;
  const s=JSON.stringify(rest);
  let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
  return h.toString(36);
}
function _stampModifiedRecords(data){
  try{
    Object.keys(data).forEach(k=>{
      const arr=data[k];
      if(!Array.isArray(arr))return;
      if(!_mAtHashes[k])_mAtHashes[k]={};
      const map=_mAtHashes[k];
      arr.forEach(r=>{
        if(!r||!r.id)return;
        const h=_mAtHash(r);
        if(map[r.id]===undefined){map[r.id]=h;return;} // first sight (load) — baseline, no stamp
        if(map[r.id]!==h){r._mAt=new Date().toISOString();map[r.id]=h;}
      });
    });
  }catch(e){}
}
// Re-baseline after a sync merge applies REMOTE records — otherwise the next save
// would see "content changed" and falsely stamp remote records as locally modified.
function _rebaselineMAtHashes(){
  try{
    Object.keys(AppState.data||{}).forEach(k=>{
      const arr=AppState.data[k];
      if(!Array.isArray(arr))return;
      _mAtHashes[k]={};
      arr.forEach(r=>{if(r&&r.id)_mAtHashes[k][r.id]=_mAtHash(r);});
    });
  }catch(e){}
}

const AppState={currentPage:'dashboard',theme:localStorage.getItem('pm_theme')||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'),data:null,
save(){
  if(!this.data)this.data=getDefaultData();
  _stampModifiedRecords(this.data);
  try{
    const json=JSON.stringify(this.data);
    if(_cryptoKey){
      _encryptAndStore(json).catch(()=>{
        try{localStorage.setItem('pm_data',json);}catch(qe){_handleStorageFull(qe,json);}
      });
    }else{
      try{localStorage.setItem('pm_data',json);}catch(qe){_handleStorageFull(qe,json);}
    }
    // Rolling IndexedDB snapshot (throttled to one per 10 min, keeps last 3)
    const _rc=typeof _dataRecordCount==='function'?_dataRecordCount(this.data):0;
    try{_idbSaveSnapshot(json,_rc);}catch(e){}
    // Full-data mirror in IndexedDB — quota-proof authoritative local copy
    try{_idbDataSave(json,_rc);}catch(e){}
  }catch(e){console.warn('[SHIC] Save error:',e.message);}
},
load(){
  let parsed=null,corrupt=false;
  try{
    const s=localStorage.getItem('pm_data');
    if(s){try{parsed=JSON.parse(s);}catch(pe){corrupt=true;console.warn('[SHIC] pm_data is corrupted:',pe.message);}}
  }catch(e){}
  if(parsed&&parsed.__enc){
    // Encrypted — cannot decode synchronously before login; start with defaults.
    // _decryptFromStorage() + AppState.data reassignment happens in doM365Login().
    this.data=getDefaultData();
  }else if(parsed){
    this.data=parsed;
  }else{
    // pm_data missing or corrupt — try the backup key before giving up
    let recovered=false;
    try{
      const b=localStorage.getItem('shic_data_backup');
      if(b){
        const bp=JSON.parse(b);
        if(bp&&!bp.__enc){this.data=bp;recovered=true;console.warn('[SHIC] Recovered data from shic_data_backup');}
      }
    }catch(e){}
    if(!recovered)this.data=getDefaultData();
    if(corrupt){
      // Tell the user instead of silently starting empty — snapshots may hold their data
      setTimeout(()=>{
        try{showToast(recovered
          ?'Local data was corrupted — recovered from backup. Verify your records.'
          :'Local data was corrupted and could not be read. Go to Settings → Restore from Snapshot, or Pull from SharePoint.','warning',10000);}catch(e){}
      },1500);
    }
  }
  if(!this.data)this.data=getDefaultData();
  // Restore dedicated dropdown backup if any (survives quota trimming, stale
  // IDB adopt, and SP overwrites that skipped the newer local edits).
  try{if(typeof _restoreDropdownBackup==='function')_restoreDropdownBackup();}catch(e){}
},
ensureData(){if(!this.data)this.load();if(!this.data)this.data=getDefaultData();return this.data;}};
// ── localStorage quota handler ──────────────────────────────
let _storageFull_notified=false;
function _handleStorageFull(err,json){
  if(!err||!(err.name==='QuotaExceededError'||err.name==='NS_ERROR_DOM_QUOTA_REACHED'||err.code===22))return;
  // Try freeing space: remove the duplicate backup key and any MSAL cache
  try{localStorage.removeItem('shic_data_backup');}catch(e){}
  try{Object.keys(localStorage).filter(k=>k.startsWith('msal.')).forEach(k=>localStorage.removeItem(k));}catch(e){}
  // Retry save after cleanup
  try{localStorage.setItem('pm_data',json);_storageFull_notified=false;return;}catch(e){}
  // Still full — try a lean version without soft-deleted records
  try{
    const lean=JSON.parse(json);
    const arrays=['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
      'resourceAllocations','dailyMeetingLogs','procurement','procurementLogs','materials',
      'manpower','equipment','tools','vehicles','consumables','thirdParty',
      'warehouseItems','stockTransactions','issuanceRequests','notifications','activities'];
    arrays.forEach(k=>{if(lean[k])lean[k]=lean[k].filter(r=>!r||!r._deleted);});
    localStorage.setItem('pm_data',JSON.stringify(lean));
    _storageFull_notified=false;
    return;
  }catch(e){}
  // localStorage is full — but the FULL dataset is still saved in the
  // IndexedDB mirror (no quota), so nothing is lost. Notify once per session.
  if(!_storageFull_notified){
    _storageFull_notified=true;
    setTimeout(()=>{if(typeof showToast==='function')showToast('Browser storage is full — your data is safe (kept in IndexedDB + SharePoint). Settings → Clean Up Storage to clear the warning.','warning',8000);},200);
  }
}

// ── ROLLING LOCAL SNAPSHOTS (IndexedDB) ──────────────────────
// Keeps the last 3 saves outside localStorage (no quota impact).
// Snapshots are AES-encrypted when the user key is available.
const _SNAP_DB='shic_snapshots',_SNAP_STORE='snaps',_SNAP_KEEP=3,_SNAP_MIN_GAP=10*60*1000;
let _snapLastTs=0;
function _idbOpen(){
  return new Promise((res,rej)=>{
    if(!window.indexedDB)return rej(new Error('IndexedDB unavailable'));
    const q=indexedDB.open(_SNAP_DB,1);
    q.onupgradeneeded=()=>{q.result.createObjectStore(_SNAP_STORE,{keyPath:'ts'});};
    q.onsuccess=()=>res(q.result);
    q.onerror=()=>rej(q.error);
  });
}
async function _snapEncrypt(json){
  if(!_cryptoKey)return{plain:json};
  try{
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},_cryptoKey,new TextEncoder().encode(json));
    return{iv:Array.from(iv),ct:new Uint8Array(ct)};
  }catch(e){return{plain:json};}
}
async function _snapDecrypt(rec){
  if(rec.plain!==undefined)return rec.plain;
  if(!_cryptoKey)throw new Error('Snapshot is encrypted — sign in first, then retry');
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(rec.iv)},_cryptoKey,rec.ct);
  return new TextDecoder().decode(pt);
}
async function _idbSaveSnapshot(json,recordCount,force){
  if(!force&&Date.now()-_snapLastTs<_SNAP_MIN_GAP)return;
  _snapLastTs=Date.now();
  try{
    const db=await _idbOpen();
    const payload=await _snapEncrypt(json);
    const tx=db.transaction(_SNAP_STORE,'readwrite');
    const st=tx.objectStore(_SNAP_STORE);
    st.put(Object.assign({ts:Date.now(),count:recordCount||0},payload));
    const kq=st.getAllKeys();
    kq.onsuccess=()=>{const keys=(kq.result||[]).sort((a,b)=>b-a);keys.slice(_SNAP_KEEP).forEach(k=>st.delete(k));};
    tx.oncomplete=()=>db.close();
  }catch(e){/* IDB unavailable — non-fatal */}
}
async function _idbListSnapshots(){
  try{
    const db=await _idbOpen();
    return await new Promise(res=>{
      const st=db.transaction(_SNAP_STORE,'readonly').objectStore(_SNAP_STORE);
      const q=st.getAll();
      q.onsuccess=()=>{db.close();res((q.result||[]).filter(s=>typeof s.ts==='number').sort((a,b)=>b.ts-a.ts));};
      q.onerror=()=>{db.close();res([]);};
    });
  }catch(e){return[];}
}

// ── FULL-DATA MIRROR (IndexedDB) ─────────────────────────────
// A complete, always-current copy of AppState.data lives in IndexedDB
// (no 5MB quota). localStorage remains only a fast synchronous bootstrap;
// if it is lean/trimmed/corrupt, the fuller IDB copy is adopted at boot.
const _IDB_DATA_KEY='pm_data_full';
let _idbDataTimer=null;
function _idbDataSave(json,recordCount){
  clearTimeout(_idbDataTimer);
  _idbDataTimer=setTimeout(async()=>{
    try{
      const db=await _idbOpen();
      const payload=await _snapEncrypt(json);
      const tx=db.transaction(_SNAP_STORE,'readwrite');
      tx.objectStore(_SNAP_STORE).put(Object.assign({ts:_IDB_DATA_KEY,at:Date.now(),count:recordCount||0},payload));
      tx.oncomplete=()=>db.close();
    }catch(e){}
  },1500);
}
async function _idbDataLoad(){
  try{
    const db=await _idbOpen();
    return await new Promise(res=>{
      const q=db.transaction(_SNAP_STORE,'readonly').objectStore(_SNAP_STORE).get(_IDB_DATA_KEY);
      q.onsuccess=()=>{db.close();res(q.result||null);};
      q.onerror=()=>{db.close();res(null);};
    });
  }catch(e){return null;}
}
// Adopt the IndexedDB copy when it holds MORE records than what we booted
// with — catches quota-trimmed, corrupt, or missing localStorage.
async function _idbAdoptIfFuller(){
  try{
    const rec=await _idbDataLoad();
    if(!rec)return false;
    if(rec.plain===undefined&&!_cryptoKey)return false; // encrypted — caller retries after login
    const json=rec.plain!==undefined?rec.plain:await _snapDecrypt(rec);
    const parsed=JSON.parse(json);
    const idbCount=_dataRecordCount(parsed);
    const curCount=_dataRecordCount(AppState.data);
    if(idbCount<=curCount)return false;
    AppState.data=Object.assign(getDefaultData(),parsed);
    if(typeof migrateData==='function')migrateData();
    if(typeof _restoreDropdownBackup==='function')_restoreDropdownBackup();
    AppState.save();
    try{renderPage(AppState.currentPage||'dashboard');}catch(e){}
    try{buildSidebar();}catch(e){}
    console.log('[SHIC] Adopted fuller IndexedDB copy: '+idbCount+' records (bootstrap had '+curCount+')');
    try{showToast('Recovered full dataset from IndexedDB ('+idbCount+' records)','success',5000);}catch(e){}
    return true;
  }catch(e){console.warn('[SHIC] IDB adopt failed:',e.message);return false;}
}
// Boot check shortly after load (pre-login covers plaintext mirrors;
// the login flow re-runs this for encrypted ones)
setTimeout(()=>{try{_idbAdoptIfFuller();}catch(e){}},1500);

// ── UPDATE NOTIFICATION ──────────────────────────────────────
// Checks GitHub for a newer version.json and shows a refresh banner.
const _UPDATE_CHECK_URL='https://raw.githubusercontent.com/SYNERCORE/PM-SUITE/main/version.json';
let _updateBannerShown=false;

function _versionNewer(remote,local){
  // Compare semver-ish strings: '2.2.1' > '2.2.0'
  const r=String(remote).split('.').map(n=>parseInt(n)||0);
  const l=String(local).split('.').map(n=>parseInt(n)||0);
  for(let i=0;i<Math.max(r.length,l.length);i++){
    if((r[i]||0)>(l[i]||0))return true;
    if((r[i]||0)<(l[i]||0))return false;
  }
  return false;
}

async function _checkForAppUpdate(){
  if(_updateBannerShown||!navigator.onLine)return;
  try{
    const res=await fetch(_UPDATE_CHECK_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)return;
    const v=await res.json();
    if(!v||!v.version)return;
    if(_versionNewer(v.version,APP_VERSION))_showUpdateBanner(v);
  }catch(e){/* offline or GitHub unreachable — silent */}
}

function _showUpdateBanner(v){
  if(_updateBannerShown)return;
  _updateBannerShown=true;
  const banner=document.createElement('div');
  banner.id='updateBanner';
  banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;background:linear-gradient(90deg,#1f6feb,#388bfd);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:12px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,.35)';
  banner.innerHTML=`
    <i class="fas fa-arrow-up-from-bracket"></i>
    <span>New version <strong>v${v.version}</strong> is available${v.note?' — '+v.note:''}</span>
    <button onclick="_applyAppUpdate()" style="background:#fff;color:#1f6feb;border:none;border-radius:6px;padding:5px 14px;font-size:11px;font-weight:700;cursor:pointer"><i class="fas fa-rotate-right" style="margin-right:4px"></i>Refresh Now</button>
    <button onclick="document.getElementById('updateBanner').remove()" style="background:transparent;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.4);border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer">Later</button>`;
  document.body.appendChild(banner);
}

function _applyAppUpdate(){
  // Save current data first
  try{AppState.save();}catch(e){}
  // Bust EVERY cache layer: SW caches, SW registration, browser HTTP cache,
  // and the GitHub Pages CDN (unique ?v= query = different cache key)
  const bust=()=>{location.replace(location.origin+location.pathname+'?v='+Date.now());};
  try{
    const jobs=[];
    if(window.caches)jobs.push(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))));
    if('serviceWorker' in navigator)jobs.push(navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.map(r=>r.unregister()))));
    Promise.all(jobs).finally(bust);
    setTimeout(bust,4000); // failsafe if a promise hangs
  }catch(e){bust();}
}

// Check shortly after load, then every 30 minutes
setTimeout(_checkForAppUpdate,15000);
setInterval(_checkForAppUpdate,30*60*1000);

// ── Module-level state variables (declared early to avoid TDZ errors) ──
// ── All global state declared early to prevent TDZ errors ──
// Auth
let _auth=null, _currentUser=null, _currentUserProfile=null, _authRetried=false;
// ── M365 Auth state ──────────────────────────────────────
let _m365Account = null;     // MSAL account after M365 login
let _m365AuthMsal = null;    // Dedicated MSAL app for auth (separate from SP sync)
let _m365LoggedIn = false;   // True when M365 auth completed
const M365_AUTH_SCOPES = ['User.Read', 'https://graph.microsoft.com/Sites.ReadWrite.All'];
const SHIC_USERS_LIST = 'SHIC_Users'; // SharePoint list for user profiles
const SHIC_FORMS_LIST = 'SHIC_FormTemplates'; // SharePoint list for withdrawal form templates

// ── Multi-list configuration ─────────────────────────────────
// Maps data array keys to dedicated SharePoint lists.
// Keeps SHIC_AppData small + scalable for high-volume data.
const SHIC_LIST_CONFIG = {
  // Core project data
  'SHIC_Projects': {
    dataKey: 'projects', idField: 'ProjectId', name: 'Projects', hasProject: false,
    indexCols: [
      { field: 'name',   spCol: 'Name',   spType: 'Text' },
      { field: 'status', spCol: 'Status', spType: 'Text' },
    ],
  },
  'SHIC_Tasks': {
    dataKey: 'tasks', idField: 'TaskId', name: 'Tasks', hasProject: true,
    indexCols: [
      { field: 'status',    spCol: 'Status',    spType: 'Text'     },
      { field: 'startDate', spCol: 'StartDate', spType: 'DateTime' },
      { field: 'milestone', spCol: 'Milestone', spType: 'Boolean'  },
    ],
    // predecessors intentionally excluded — resolved in JS memory, never filtered server-side
  },
  'SHIC_Costs': {
    dataKey: 'costs', idField: 'CostId', name: 'Costs', hasProject: true,
    indexCols: [
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_QAQC': {
    dataKey: 'qaqc', idField: 'QAQCId', name: 'QA/QC', hasProject: true,
    indexCols: [
      { field: 'type',   spCol: 'Type',   spType: 'Text' },
      { field: 'status', spCol: 'Status', spType: 'Text' },
    ],
  },
  'SHIC_Risks': {
    dataKey: 'risks', idField: 'RiskId', name: 'Risks', hasProject: true,
    indexCols: [
      { field: 'status',   spCol: 'Status',   spType: 'Text' },
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_Actions': {
    dataKey: 'actions', idField: 'ActionId', name: 'Actions', hasProject: true,
    indexCols: [
      { field: 'status',  spCol: 'Status',  spType: 'Text'     },
      { field: 'dueDate', spCol: 'DueDate', spType: 'DateTime' },
    ],
  },
  'SHIC_DocsMeta': {
    dataKey: 'documents', idField: 'DocId', name: 'Documents Metadata', hasProject: true,
    indexCols: [
      { field: 'status',   spCol: 'Status',   spType: 'Text' },
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_LibraryDocs': {
    dataKey: 'libraryDocs', idField: 'LibId', name: 'Library Docs', hasProject: false,
    indexCols: [
      { field: 'category', spCol: 'Category', spType: 'Text' },
      { field: 'status',   spCol: 'Status',   spType: 'Text' },
    ],
  },
  'SHIC_Allocations': {
    dataKey: 'resourceAllocations', idField: 'AllocId', name: 'Allocations', hasProject: true,
    indexCols: [
      { field: 'resourceType', spCol: 'ResourceType', spType: 'Text' },
    ],
  },
  // Procurement & supply
  'SHIC_Procurement': {
    dataKey: 'procurement', idField: 'ProcId', name: 'Procurement', hasProject: true,
    indexCols: [
      { field: 'status',   spCol: 'Status',   spType: 'Text' },
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_ProcurementLogs': {
    dataKey: 'procurementLogs', idField: 'LogId', name: 'Procurement Logs', hasProject: true,
    indexCols: [
      { field: 'procId', spCol: 'ProcId', spType: 'Text'     },
      { field: 'date',   spCol: 'LogDate', spType: 'DateTime' },
    ],
  },
  'SHIC_Materials': {
    dataKey: 'materials', idField: 'MatId', name: 'Materials', hasProject: true,
    indexCols: [
      { field: 'status', spCol: 'Status', spType: 'Text' },
    ],
  },
  'SHIC_Manpower': {
    dataKey: 'manpower', idField: 'MpId', name: 'Manpower', hasProject: true,
    indexCols: [
      { field: 'trade', spCol: 'Trade', spType: 'Text' },
    ],
  },
  // Assets
  'SHIC_Equipment': {
    dataKey: 'equipment', idField: 'EqpId', name: 'Equipment', hasProject: false,
    indexCols: [
      { field: 'status',    spCol: 'Status',    spType: 'Text' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text' },
    ],
  },
  'SHIC_Tools': {
    dataKey: 'tools', idField: 'ToolId', name: 'Tools', hasProject: false,
    indexCols: [
      { field: 'status',    spCol: 'Status',    spType: 'Text' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text' },
    ],
  },
  'SHIC_Vehicles': {
    dataKey: 'vehicles', idField: 'VehId', name: 'Vehicles', hasProject: false,
    indexCols: [
      { field: 'status',    spCol: 'Status',    spType: 'Text' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text' },
    ],
  },
  'SHIC_Consumables': {
    dataKey: 'consumables', idField: 'ConId', name: 'Consumables', hasProject: false,
    indexCols: [
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_ThirdParty': {
    dataKey: 'thirdParty', idField: 'TpId', name: 'Third Party', hasProject: false,
    indexCols: [
      { field: 'status',   spCol: 'Status',   spType: 'Text'     },
      { field: 'category', spCol: 'Category', spType: 'Text'     },
      { field: 'contractEnd', spCol: 'ContractEnd', spType: 'DateTime' },
    ],
  },
  'SHIC_AssetHistory': {
    dataKey: 'assetHistory', idField: 'EventId', name: 'Asset History', hasProject: false,
    indexCols: [
      { field: 'assetId',   spCol: 'AssetId',   spType: 'Text'     },
      { field: 'assetType', spCol: 'AssetType', spType: 'Text'     },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text'     },
      { field: 'date',      spCol: 'EventDate', spType: 'DateTime' },
    ],
  },
  'SHIC_AssetUtilization': {
    dataKey: 'assetUtilization', idField: 'UtilId', name: 'Asset Utilization', hasProject: false,
    indexCols: [
      { field: 'resourceId',   spCol: 'ResourceId',   spType: 'Text'     },
      { field: 'resourceType', spCol: 'ResourceType', spType: 'Text'     },
      { field: 'projectId',    spCol: 'ProjectId',    spType: 'Text'     },
      { field: 'date',         spCol: 'UtilDate',     spType: 'DateTime' },
    ],
  },
  // High-volume logs
  'SHIC_UsageLogs': {
    dataKey: 'resourceUsageLogs', idField: 'LogId', name: 'Usage Logs', hasProject: true,
    indexCols: [
      { field: 'date',       spCol: 'LogDate',    spType: 'DateTime' },
      { field: 'resourceId', spCol: 'ResourceId', spType: 'Text'     },
    ],
  },
  'SHIC_DailyLogs': {
    dataKey: 'dailyMeetingLogs', idField: 'LogId', name: 'Daily Logs', hasProject: true,
    indexCols: [
      { field: 'date',   spCol: 'LogDate', spType: 'DateTime' },
      { field: 'status', spCol: 'Status',  spType: 'Text'     },
    ],
  },
  // Warehouse
  'SHIC_WhItems': {
    dataKey: 'warehouseItems', idField: 'ItemId', name: 'Warehouse Items', hasProject: false,
    indexCols: [
      { field: 'category', spCol: 'Category', spType: 'Text' },
    ],
  },
  'SHIC_WhTransactions': {
    dataKey: 'stockTransactions', idField: 'TxId', name: 'Stock Transactions', hasProject: true,
    indexCols: [
      { field: 'type',   spCol: 'TxType', spType: 'Text'     },
      { field: 'itemId', spCol: 'ItemId', spType: 'Text'     },
      { field: 'date',   spCol: 'TxDate', spType: 'DateTime' },
    ],
  },
  'SHIC_WhRequests': {
    dataKey: 'issuanceRequests', idField: 'ReqId', name: 'Issuance Requests', hasProject: true,
    indexCols: [
      { field: 'status', spCol: 'Status', spType: 'Text' },
    ],
  },
  // Workflows & system
  'SHIC_IdChangeRequests': {
    dataKey: 'idChangeRequests', idField: 'ReqId', name: 'ID Change Requests', hasProject: false,
    indexCols: [
      { field: 'status',    spCol: 'Status',    spType: 'Text' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text' },
    ],
  },
  'SHIC_WorkflowDefs': {
    dataKey: 'workflowDefs', idField: 'DefId', name: 'Workflow Definitions', hasProject: false,
    indexCols: [
      { field: 'docType', spCol: 'DocType', spType: 'Text' },
    ],
  },
  'SHIC_UserPerms': {
    dataKey: 'userPerms', idField: 'PermId', name: 'User Permissions', hasProject: false,
    indexCols: [
      { field: 'email', spCol: 'Email', spType: 'Text' },
    ],
  },
  'SHIC_DeletionRequests': {
    dataKey: 'deletionRequests', idField: 'ReqId', name: 'Deletion Requests', hasProject: false,
    indexCols: [
      { field: 'status',             spCol: 'Status',             spType: 'Text' },
      { field: 'requestedByEmail',   spCol: 'RequestedByEmail',   spType: 'Text' },
    ],
  },
  'SHIC_Notifications': {
    dataKey: 'notifications', idField: 'NotifId', name: 'Notifications', hasProject: false,
    indexCols: [
      { field: 'type', spCol: 'Type', spType: 'Text'    },
      { field: 'read', spCol: 'Read', spType: 'Boolean' },
    ],
  },
  'SHIC_Activities': {
    dataKey: 'activities', idField: 'ActId', name: 'Activities', hasProject: false,
    indexCols: [
      { field: 'type',    spCol: 'Type',      spType: 'Text'     },
      { field: 'project', spCol: 'ProjectId', spType: 'Text'     },
      { field: 'time',    spCol: 'ActTime',   spType: 'DateTime' },
    ],
  },
  'SHIC_ProjectIdHistory': {
    dataKey: 'projectIdHistory', idField: 'HistId', name: 'Project ID History', hasProject: false,
    indexCols: [
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text'     },
      { field: 'changedAt', spCol: 'ChangedAt', spType: 'DateTime' },
    ],
  },
  'SHIC_BusinessUnits': {
    dataKey: 'businessUnits', idField: 'BuId', name: 'Business Units', hasProject: false,
    indexCols: [
      { field: 'name',   spCol: 'Name',   spType: 'Text' },
      { field: 'active', spCol: 'Active', spType: 'Boolean' },
    ],
  },
  'SHIC_Resources': {
    dataKey: 'resources', idField: 'ResId', name: 'Resources', hasProject: false,
    indexCols: [
      { field: 'availability', spCol: 'Availability', spType: 'Text' },
      { field: 'trade',        spCol: 'Trade',        spType: 'Text' },
    ],
  },
  'SHIC_Progress': {
    dataKey: 'progress', idField: 'ProgId', name: 'Progress', hasProject: true,
    indexCols: [
      { field: 'date',      spCol: 'ProgDate', spType: 'DateTime' },
      { field: 'milestone', spCol: 'Milestone', spType: 'Text'    },
    ],
  },
  'SHIC_KpiData': {
    dataKey: 'kpiData', idField: 'KpiId', name: 'KPI Data', hasProject: true,
    indexCols: [
      { field: 'period', spCol: 'Period', spType: 'Text' },
    ],
  },
  'SHIC_Calendar': {
    dataKey: 'calendar', idField: 'CalId', name: 'Calendar', hasProject: false,
    indexCols: [
      { field: 'date',      spCol: 'EventDate', spType: 'DateTime' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text'     },
    ],
  },
  'SHIC_ProjectTeam': {
    dataKey: 'projectTeam', idField: 'TeamId', name: 'Project Team', hasProject: true,
    indexCols: [
      { field: 'role',      spCol: 'Role',      spType: 'Text' },
      { field: 'projectId', spCol: 'ProjectId', spType: 'Text' },
    ],
  },
  'SHIC_Trades': {
    dataKey: 'trades', idField: 'TradeId', name: 'Trades', hasProject: false,
    indexCols: [
      { field: 'name', spCol: 'Name', spType: 'Text' },
    ],
  },
};
const SHIC_OFFLOADED_KEYS = Object.values(SHIC_LIST_CONFIG).map(c => c.dataKey);
// Cache for list IDs to avoid re-resolving
const _spListIds = {}; // { 'SHIC_Tasks': 'list-id', ... }
// OneDrive / MSAL
let _msalApp=null, _odAccount=null, _odSyncing=false, _odAutoSync=false;
let _odLastSync=null, _odClientId=localStorage.getItem('pm_od_clientid')||'', _odSyncTimer=null;
// ── App-wide constants (declared early to prevent TDZ) ──
const ADMIN_EMAILS_KEY='shic_admin_emails';
const OD_SCOPES=['Files.ReadWrite','User.Read'];
const OD_FILE='SHIC/shic_data.json';
const OFFLINE_QUEUE_KEY='shic_offline_queue';
const OFFLINE_DATA_KEY='shic_offline_data';
const PERSISTENT_PATCHES_KEY='shic_persistent_patches';
const UPDATE_CHECK_URL=''; // Set your GitHub releases URL here

// ── One-time: archive legacy persistent patches (v2.5.0) ────
// All fixes those patches carried are built into the app now, and their
// injected CSS/JS conflicts with current markup (e.g. the stuck sidebar
// backdrop). Reversible: the raw patches are kept in shic_patches_archived.
try{
  const _rawP=localStorage.getItem(PERSISTENT_PATCHES_KEY);
  if(_rawP&&_rawP!=='{}'&&_rawP!=='[]'&&!localStorage.getItem('shic_patches_archived')){
    localStorage.setItem('shic_patches_archived',_rawP);
    localStorage.removeItem(PERSISTENT_PATCHES_KEY);
    console.warn('[SHIC] Legacy persistent patches archived to shic_patches_archived — their fixes are built into this version');
    setTimeout(()=>{try{showToast('Legacy patches archived — all their fixes are built into this version now.','info',7000);}catch(e){}},3000);
  }
}catch(e){}

// Module-level state variables
let mlTab='all', mlSearch='', mlStatusFilter='all', mlProjectFilter='all';
let procTab='list', procSearch='', procStatusFilter='all', procProjFilter='all';
let detailProjectId=null, detailTab='overview';
let docSearch='', docStatusFilter='all', docProjFilter='all', docCatFilter='all', docGroupBy='status', docCollapsed={};
let ganttZoom=100, ganttFrom='', ganttTo='', ganttProjFilter='all', ganttStatusFilter='all';

// ── Shared time filter for KPI / Analytics / Reports ─────────
// mode: 'year' (whole year) | 'month' (single month within year)
let _tfMode='year', _tfYear=new Date().getFullYear(), _tfMonth=new Date().getMonth()+1;

function _tfRange(){
  const y=_tfYear||new Date().getFullYear();
  if(_tfMode==='month'){
    const m=Math.max(1,Math.min(12,_tfMonth||1));
    const start=new Date(y,m-1,1);
    const end=new Date(y,m,0); // last day of month
    end.setHours(23,59,59,999);
    const label=start.toLocaleString('en',{month:'long'})+' '+y;
    return{start,end,label,ymd:(d)=>d.toISOString().slice(0,10)};
  }
  const start=new Date(y,0,1);
  const end=new Date(y,11,31,23,59,59,999);
  return{start,end,label:String(y),ymd:(d)=>d.toISOString().slice(0,10)};
}

function _tfInRange(dateStr){
  if(!dateStr)return false;
  const d=new Date(dateStr+'T00:00:00');
  if(isNaN(d))return false;
  const r=_tfRange();
  return d>=r.start&&d<=r.end;
}

// A project is "in scope" for the period if its execution window overlaps the range.
function _tfProjectInRange(p){
  if(!p)return false;
  const r=_tfRange();
  const s=p.startDate?new Date(p.startDate+'T00:00:00'):null;
  const e=p.endDate?new Date(p.endDate+'T00:00:00'):(p.completedDate?new Date(p.completedDate+'T00:00:00'):new Date());
  if(!s)return false;
  return s<=r.end&&e>=r.start;
}

function _tfFilterHTML(onchange){
  const years=[];
  const cy=new Date().getFullYear();
  for(let y=cy-5;y<=cy+2;y++)years.push(y);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--text-muted);font-weight:600"><i class="fas fa-filter" style="margin-right:4px"></i>Period</span>
    <select class="form-select" style="height:30px;width:110px;font-size:12px" onchange="_tfMode=this.value;${onchange}">
      <option value="year" ${_tfMode==='year'?'selected':''}>Yearly</option>
      <option value="month" ${_tfMode==='month'?'selected':''}>Monthly</option>
    </select>
    <select class="form-select" style="height:30px;width:100px;font-size:12px" onchange="_tfYear=parseInt(this.value);${onchange}">
      ${years.map(y=>`<option value="${y}" ${y===_tfYear?'selected':''}>${y}</option>`).join('')}
    </select>
    ${_tfMode==='month'?`<select class="form-select" style="height:30px;width:110px;font-size:12px" onchange="_tfMonth=parseInt(this.value);${onchange}">
      ${months.map((m,i)=>`<option value="${i+1}" ${(i+1)===_tfMonth?'selected':''}>${m}</option>`).join('')}
    </select>`:''}
    <span style="font-size:11px;color:var(--text-secondary);margin-left:4px">Showing: <strong>${_tfRange().label}</strong></span>
  </div>`;
}


const NAV_ITEMS=[
{id:'dashboard',label:'Dashboard',icon:'fas fa-chart-pie',section:'Overview'},
{id:'projects',label:'Projects',icon:'fas fa-briefcase',section:'Overview'},
{id:'prospects',label:'Prospects',icon:'fas fa-search-dollar',section:'Overview'},
{id:'tasks',label:'Task Management',icon:'fas fa-tasks',section:'Planning'},
{id:'gantt',label:'Gantt Chart',icon:'fas fa-stream',section:'Planning'},
{id:'resources',label:'Resources',icon:'fas fa-users',section:'Team'},
{id:'manpower',label:'Manpower',icon:'fas fa-hard-hat',section:'Team'},
{id:'materials',label:'Materials',icon:'fas fa-boxes',section:'Supply'},
{id:'procurement',label:'Procurement',icon:'fas fa-shopping-cart',section:'Supply'},
{id:'warehouse',label:'Warehouse',icon:'fas fa-warehouse',section:'Supply'},
{id:'costs',label:'Cost Control',icon:'fas fa-dollar-sign',section:'Finance'},
{id:'qaqc',label:'QA/QC',icon:'fas fa-check-double',section:'Quality'},
{id:'risks',label:'Risk Register',icon:'fas fa-exclamation-triangle',section:'Quality'},
{id:'actions',label:'Action Items',icon:'fas fa-clipboard-list',section:'Control'},
{id:'approvals',label:'My Approvals',icon:'fas fa-stamp',section:'Control'},
{id:'workflows',label:'Workflow Editor',icon:'fas fa-route',section:'Control'},
{id:'documents',label:'Documents',icon:'fas fa-folder-open',section:'Control'},
{id:'library',label:'Reference Library',icon:'fas fa-book',section:'Control'},
{id:'progress',label:'Progress',icon:'fas fa-chart-line',section:'Control'},
{id:'kpi',label:'KPI Analytics',icon:'fas fa-tachometer-alt',section:'Analytics'},
{id:'analytics',label:'Advanced Analytics',icon:'fas fa-chart-bar',section:'Analytics'},
{id:'dailymeeting',label:'Daily Meeting',icon:'fas fa-clipboard-check',section:'Analytics'},
{id:'calendar',label:'Calendar',icon:'fas fa-calendar-alt',section:'Analytics'},
{id:'reports',label:'Reports',icon:'fas fa-file-alt',section:'Analytics'},
{id:'masterlist',label:'Asset Masterlist',icon:'fas fa-clipboard-list',section:'Assets'}];

// ── DROPDOWN REGISTRY ──────────────────────────────────────
// Central defaults for all admin-managed dropdowns
const DROPDOWN_REGISTRY = {
  risk_categories:    { label:'Risk Categories',      icon:'fa-shield-halved',  defaults:['Procurement','Resources','Technical','HSE','Regulatory','Financial','Schedule','Environmental','Contractual'] },
  qaqc_types:         { label:'QA/QC Types',           icon:'fa-clipboard-check',defaults:['Inspection','NCR','Punch','Test','Audit','Safety Walk','Method Statement','RFI'] },
  doc_categories:     { label:'Document Categories',   icon:'fa-file-alt',       defaults:['Engineering','Management','QA/QC','Finance','Legal','Safety','Photos','General','Procurement','As-Built','Drawings','Specifications'] },
  doc_status:         { label:'Document Statuses',     icon:'fa-tag',            defaults:['draft','review','approved','issued','superseded','cancelled'] },
  cost_categories:    { label:'Cost Categories',       icon:'fa-dollar-sign',    defaults:['Mobilization','Demobilization','Manpower Cost','Tools and Equipments','Materials and Consumables','Personal Protective Equipment','Miscellaneous','Subcontract','Overhead'] },
  variation_codes:    { label:'Variation Codes',       icon:'fa-exchange-alt',   defaults:['Design Change','Client Request','Material Unavailable','Site Condition / Field Condition','Emergency / Urgent Requirement','Scope Expansion',"Engineer's Instruction",'Other'] },
  manpower_shifts:    { label:'Manpower Shifts',       icon:'fa-clock',          defaults:['Day','Night','Day/Night','Rotating','Split','Flexi'] },
  action_priority:    { label:'Action Priority',       icon:'fa-flag',           defaults:['critical','high','medium','low'] },
  equipment_status:   { label:'Equipment Status',      icon:'fa-cogs',           defaults:['available','in-use','maintenance','standby','out-of-service'] },
  tool_status:        { label:'Tool Status',           icon:'fa-wrench',         defaults:['available','in-use','maintenance','standby'] },
  vehicle_status:     { label:'Vehicle Status',        icon:'fa-truck',          defaults:['available','in-use','maintenance','standby','out-of-service'] },
  material_status:    { label:'Material Status',       icon:'fa-cubes',          defaults:['pending','ordered','partial','delivered','rejected'] },
  tp_status:          { label:'Third Party Status',    icon:'fa-handshake',      defaults:['active','inactive','expired','pending','suspended'] },
  personnel_avail:    { label:'Personnel Availability',icon:'fa-user',           defaults:['available','busy','unavailable','on-leave'] },
  project_discipline: { label:'Project Disciplines',   icon:'fa-briefcase',      defaults:['Civil','Mechanical','Electrical','Instrumentation','Process','Structural','Piping','HVAC','General'] },
};

function _getDropdown(key){
  const reg=DROPDOWN_REGISTRY[key];
  if(!reg)return[];
  const custom=(AppState.data.settings?.dropdowns||{})[key];
  return(custom&&custom.length>0)?custom:[...reg.defaults];
}

const _DROPDOWN_BACKUP_KEY='shic_dropdowns_backup';

function _setDropdown(key,values){
  if(!AppState.data.settings)AppState.data.settings={};
  if(!AppState.data.settings.dropdowns)AppState.data.settings.dropdowns={};
  AppState.data.settings.dropdowns[key]=values;
  // When an admin edits a dropdown, bump the local _adminPushedAt so a subsequent
  // SP poll doesn't overwrite the just-typed change with the older remote copy.
  // Non-admins keep _adminPushedAt untouched so their local edits will still be
  // superseded by any real admin push from SharePoint.
  if(typeof isAdminUser==='function' && isAdminUser()){
    AppState.data.settings.dropdowns._adminPushedAt=Date.now();
    // Force the offline-queue flag so a future poll takes the merge path (which
    // preserves local settings), even if SP wasn't connected at edit time or a
    // prior push already cleared the flag. Survives hard refresh via localStorage.
    try{ localStorage.setItem('shic_sp_offlinequeue','1'); }catch(e){}
    if(typeof _spOfflineQueue!=='undefined') _spOfflineQueue=true;
  }
  // Dedicated synchronous backup: even if the main data path (localStorage debounce,
  // IndexedDB debounce, encryption, or SP merge) misses this edit, we can restore it
  // from this key on next boot. Written every time, admin or not.
  try{
    const backup={dropdowns:AppState.data.settings.dropdowns,at:Date.now()};
    localStorage.setItem(_DROPDOWN_BACKUP_KEY,JSON.stringify(backup));
  }catch(e){}
  AppState.save();
}

// Restore dropdowns from the dedicated backup key when they've gone missing or
// are older than the backup. Called on boot and after any SP pull replaces
// AppState.data. Safe to call any time — no-ops when live data is fresher.
function _restoreDropdownBackup(){
  try{
    const raw=localStorage.getItem(_DROPDOWN_BACKUP_KEY);
    if(!raw)return;
    const b=JSON.parse(raw);
    if(!b||!b.dropdowns)return;
    if(!AppState.data)AppState.data=getDefaultData();
    if(!AppState.data.settings)AppState.data.settings={};
    const liveAt=AppState.data.settings.dropdowns?._adminPushedAt||0;
    const backupAt=b.dropdowns._adminPushedAt||b.at||0;
    if(backupAt>liveAt){
      AppState.data.settings.dropdowns=b.dropdowns;
      try{AppState.save();}catch(e){}
    }
  }catch(e){}
}

function getDefaultData(){
  // Returns empty data structure — NO demo records
  // Demo data is in getDemoData(); only used when user explicitly resets
  const y=new Date().getFullYear();
  return{
    projects:[],tasks:[],resources:[],equipment:[],tools:[],vehicles:[],
    consumables:[],materials:[],manpower:[],procurement:[],procurementLogs:[],
    warehouseItems:[],stockTransactions:[],issuanceRequests:[],workflowDefs:[],userPerms:[],
    resourceAllocations:[],resourceUsageLogs:[],costs:[],qaqc:[],risks:[],
    actions:[],documents:[],progress:[],kpiData:[],calendar:[],
    assetHistory:[],assetUtilization:[],thirdParty:[],projectTeam:[],activities:[],notifications:[],
    trades:[],
    settings:{companyName:'SHIC',currency:'PHP',timezone:'Asia/Manila',approverRoles:[],escalationEmail:'',archiveAfterDays:180},
    businessUnits:[], // [{id,name,color,description}]
    dailyMeetingLogs:[], // [{id,date,projectId,status,remarks,targetActivity,update,progressSnapshot,flagged,savedBy}]
    idChangeRequests:[], // [{id,projectId,oldId,newId,requestedBy,requestedAt,reason,status,approvedBy,approvedAt,rejectedAt,rejectionReason}]
    deletionRequests:[], // [{id,arrayKey,recordId,recordType,recordLabel,requestedBy,requestedByEmail,requestedAt,reason,status,reviewedBy,reviewedAt,rejectionReason}]
    libraryDocs:[], // [{id,name,number,rev,category,description,tags,fileName,fileType,fileUrl,fileWebUrl,spDriveId,spItemId,size,status,uploadedBy,uploadedAt,supersededBy,revisionOf}]
    projectIdHistory:[], // [{projectId(current),oldId,newId,changedBy,changedAt,reason}]
  };
}

// Count total records across all data arrays — used to pick the richer dataset
const SHIC_DATA_ARRAY_KEYS=['projects','tasks','resources','equipment','tools','vehicles',
  'consumables','materials','manpower','procurement','procurementLogs',
  'resourceAllocations','resourceUsageLogs','costs','qaqc','risks',
  'actions','documents','progress','assetHistory','thirdParties','thirdParty',
  'projectTeam','calendar','activities','notifications','trades',
  'dailyMeetingLogs','businessUnits','assetUtilization'];
function _dataRecordCount(data){
  if(!data)return 0;
  return SHIC_DATA_ARRAY_KEYS.reduce((s,k)=>s+(Array.isArray(data[k])?data[k].length:0),0);
}
// Force reload from localStorage + backup (call before sync on every login)
function _restoreLocalData(){
  AppState.data=null;
  AppState.load();
  const localCount=_dataRecordCount(AppState.data);
  if(localCount>0)return localCount;
  try{
    const backup=localStorage.getItem('shic_data_backup');
    if(backup){
      const parsed=JSON.parse(backup);
      if(_dataRecordCount(parsed)>0){
        AppState.data=Object.assign(getDefaultData(),parsed);
        if(typeof migrateData==='function')migrateData();
        AppState.save();
        console.log('[SHIC] Restored',_dataRecordCount(AppState.data),'records from backup');
        return _dataRecordCount(AppState.data);
      }
    }
  }catch(e){console.warn('[SHIC] Backup restore failed:',e.message);}
  return 0;
}


// (getDemoData removed — demo dataset no longer shipped; app starts empty)

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
// Escape user-entered text before inserting into innerHTML (XSS/layout-break guard)
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtNum=(n,d=0)=>n>=1000000?`${(n/1e6).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:(n||0).toFixed(d);
const fmtCur=n=>'₱'+Number(n||0).toLocaleString('en-PH');
const pColor=p=>p>=80?'var(--accent-green)':p>=50?'var(--accent-blue)':p>=30?'var(--accent-amber)':'var(--accent-red)';
const isOverdue=d=>d&&new Date(d)<new Date();
const daysBetween=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);
// safeDate: returns a yyyy-MM-dd string or '' — prevents type=date from getting 'N/A'
const safeDate=v=>(v&&v!=='N/A'&&/^\d{4}-\d{2}-\d{2}$/.test(String(v)))?v:'';


function getEmptyData(){
  return getDefaultData(); // Same — getDefaultData is now empty by default
}

function sBadge(s){
const m={active:['badge-blue','Active'],completed:['badge-green','Completed'],planned:['badge-purple','Planned'],
done:['badge-green','Done'],inprogress:['badge-blue','In Progress'],todo:['badge-gray','To Do'],
blocked:['badge-red','Blocked'],approved:['badge-green','Approved'],pending:['badge-amber','Pending'],
review:['badge-blue','In Review'],issued:['badge-cyan','Issued'],open:['badge-amber','Open'],
closed:['badge-green','Closed'],mitigated:['badge-purple','Mitigated'],overdue:['badge-red','Overdue'],
partial:['badge-amber','Partial'],ordered:['badge-blue','Ordered'],delivered:['badge-green','Delivered'],
active_po:['badge-blue','Active'],'on-hold':['badge-gray','On Hold']};
const[c,t]=m[s]||['badge-gray',s];
return`<span class="badge ${c}">${t}</span>`;}

function pBadge(p){
const m={critical:['badge-red','Critical'],high:['badge-amber','High'],medium:['badge-blue','Medium'],low:['badge-green','Low']};
const[c,t]=m[p]||['badge-gray',p];return`<span class="badge ${c}">${t}</span>`;}

function avatarH(name,size=26){
const cols=['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#f85149'];
const ini=name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
const col=cols[name.charCodeAt(0)%cols.length];
return`<div class="avatar" style="width:${size}px;height:${size}px;background:${col};font-size:${Math.round(size*.38)}px">${ini}</div>`;}

// -- REPOSITORY PATTERN ---------------------------------------
// Wraps the 5 most-mutated data arrays with a clean API.
// Underlying storage is still AppState.data.X[] � no data model change.

function _repoMake(arrayKey, idField) {
  return {
    _key: arrayKey,
    _id:  idField,

    _arr() { return AppState.data[arrayKey] || (AppState.data[arrayKey] = []); },

    get(id) {
      return this._arr().find(r => r[this._id] === id || r.id === id) || null;
    },

    exists(id) { return !!this.get(id); },

    list(opts = {}) {
      let items = this._arr();
      if (opts.excludeDeleted !== false) items = items.filter(r => !r._deleted);
      if (opts.projectId) items = items.filter(r => r.projectId === opts.projectId);
      return items;
    },

    add(item) {
      if (!item) return null;
      const idVal = item[this._id] || item.id;
      if (!idVal) { console.warn('[Repo] add() called without id on', arrayKey); return null; }
      if (this.exists(idVal)) { console.warn('[Repo] duplicate id:', idVal); return null; }
      item._newlyCreated = true;
      item._createdAt = item._createdAt || new Date().toISOString();
      this._arr().push(item);
      AppState.save();
      return item;
    },

    update(id, fields) {
      const idx = this._arr().findIndex(r => r[this._id] === id || r.id === id);
      if (idx < 0) { console.warn('[Repo] update() � not found:', id); return false; }
      Object.assign(this._arr()[idx], fields);
      AppState.save();
      return true;
    },

    softDelete(id, deletedBy) {
      const rec = this.get(id);
      if (!rec) return false;
      rec._deleted    = true;
      rec._deletedAt  = new Date().toISOString();
      rec._deletedBy  = deletedBy || (typeof _currentUserProfile !== 'undefined' ? (_currentUserProfile?.name || _currentUserProfile?.email) : 'unknown');
      AppState.save();
      if (typeof logAudit === 'function') logAudit('delete', `${arrayKey}:${id} soft-deleted`, { id, arrayKey });
      return true;
    },

    restore(id, restoredBy) {
      const rec = this.get(id);
      if (!rec || !rec._deleted) return false;
      delete rec._deleted;
      delete rec._deletedAt;
      delete rec._deletedBy;
      AppState.save();
      if (typeof logAudit === 'function') logAudit('restore', `${arrayKey}:${id} restored`, { id, arrayKey });
      return true;
    },
  };
}

// The five Repo namespaces
const Repo = {
  projects:     _repoMake('projects',     'id'),
  tasks:        _repoMake('tasks',        'id'),
  actions:      _repoMake('actions',      'id'),
  documents:    _repoMake('documents',    'id'),
  assetHistory: _repoMake('assetHistory', 'id'),
};

// Expose globally so all view files can use it without imports
window.Repo = Repo;

// ── COLOR PALETTES ────────────────────────────────────────────
const PALETTES = {
  dark: {
    label:'Dark', icon:'🌑',
    swatches:['#0d1117','#161b22','#388bfd','#3fb950','#f0a450'],
    vars:{
      '--bg-primary':'#0d1117','--bg-secondary':'#161b22','--bg-card':'#1c2333',
      '--bg-hover':'#21262d','--border':'#30363d',
      '--text-primary':'#e6edf3','--text-secondary':'#8b949e','--text-muted':'#484f58',
      '--accent-blue':'#388bfd','--accent-amber':'#f0a450','--accent-green':'#3fb950',
      '--accent-red':'#f85149','--accent-purple':'#bc8cff','--accent-cyan':'#39d3f2','--accent-orange':'#fb8f44',
    }
  },
  light: {
    label:'Light', icon:'☀️',
    swatches:['#f0f4f8','#ffffff','#0969da','#1a7f37','#9a6700'],
    vars:{
      '--bg-primary':'#f0f4f8','--bg-secondary':'#ffffff','--bg-card':'#ffffff',
      '--bg-hover':'#f6f8fa','--border':'#d0d7de',
      '--text-primary':'#1f2328','--text-secondary':'#57606a','--text-muted':'#9198a1',
      '--accent-blue':'#0969da','--accent-amber':'#9a6700','--accent-green':'#1a7f37',
      '--accent-red':'#cf222e','--accent-purple':'#8250df','--accent-cyan':'#0598bc','--accent-orange':'#bc4c00',
    }
  },
  ocean: {
    label:'Ocean', icon:'🌊',
    swatches:['#020c1b','#0a192f','#64ffda','#57cbff','#f6c90e'],
    vars:{
      '--bg-primary':'#020c1b','--bg-secondary':'#0a192f','--bg-card':'#112240',
      '--bg-hover':'#172a45','--border':'#1d3557',
      '--text-primary':'#ccd6f6','--text-secondary':'#8892b0','--text-muted':'#495670',
      '--accent-blue':'#64ffda','--accent-amber':'#f6c90e','--accent-green':'#57cbff',
      '--accent-red':'#ff6b6b','--accent-purple':'#c792ea','--accent-cyan':'#80ffea','--accent-orange':'#ffb347',
    }
  },
  forest: {
    label:'Forest', icon:'🌿',
    swatches:['#0b1e14','#132a1e','#57cc99','#80ed99','#ffd166'],
    vars:{
      '--bg-primary':'#0b1e14','--bg-secondary':'#132a1e','--bg-card':'#1a3828',
      '--bg-hover':'#1f4230','--border':'#2d5a3d',
      '--text-primary':'#d4f1c0','--text-secondary':'#86b876','--text-muted':'#4a7a54',
      '--accent-blue':'#57cc99','--accent-amber':'#ffd166','--accent-green':'#80ed99',
      '--accent-red':'#ef233c','--accent-purple':'#c77dff','--accent-cyan':'#48cae4','--accent-orange':'#f4845f',
    }
  },
  sunset: {
    label:'Sunset', icon:'🌅',
    swatches:['#1a0a00','#2d1200','#ff6b35','#ffd166','#06d6a0'],
    vars:{
      '--bg-primary':'#1a0a00','--bg-secondary':'#2d1200','--bg-card':'#3d1a00',
      '--bg-hover':'#4a2200','--border':'#6b3300',
      '--text-primary':'#ffe8cc','--text-secondary':'#cc9966','--text-muted':'#7a4a22',
      '--accent-blue':'#ff6b35','--accent-amber':'#ffd166','--accent-green':'#06d6a0',
      '--accent-red':'#ef233c','--accent-purple':'#d8b4fe','--accent-cyan':'#67e8f9','--accent-orange':'#ff6b35',
    }
  },
  midnight: {
    label:'Midnight', icon:'🌌',
    swatches:['#0a0014','#130026','#c084fc','#818cf8','#34d399'],
    vars:{
      '--bg-primary':'#0a0014','--bg-secondary':'#130026','--bg-card':'#1a0033',
      '--bg-hover':'#220040','--border':'#3b0066',
      '--text-primary':'#e8d5ff','--text-secondary':'#b388ff','--text-muted':'#6a3d99',
      '--accent-blue':'#c084fc','--accent-amber':'#fbbf24','--accent-green':'#34d399',
      '--accent-red':'#f87171','--accent-purple':'#818cf8','--accent-cyan':'#67e8f9','--accent-orange':'#fb923c',
    }
  },
};

function applyPalette(name) {
  const palette = PALETTES[name];
  if (!palette) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', name === 'light' ? 'light' : 'dark');
  Object.entries(palette.vars).forEach(([k,v]) => root.style.setProperty(k, v));
  localStorage.setItem('shic_palette', name);
  window._currentPalette = name;
  // Refresh swatch picker if settings page is open
  const picker = document.getElementById('palettePicker');
  if (picker) _renderPalettePicker(picker);
}

function _renderPalettePicker(container) {
  const current = window._currentPalette || localStorage.getItem('shic_palette') || 'dark';
  container.innerHTML = Object.entries(PALETTES).map(([key, p]) => {
    const active = key === current;
    return `<div onclick="applyPalette('${key}')" title="${p.label}" style="
      cursor:pointer;border-radius:10px;padding:12px;border:2px solid ${active?'var(--accent-blue)':'var(--border)'};
      background:${active?'rgba(56,139,253,.1)':'var(--bg-hover)'};
      transition:all .2s;position:relative;text-align:center;min-width:100px;flex:1
    ">
      ${active?`<div style="position:absolute;top:6px;right:6px;width:16px;height:16px;background:var(--accent-blue);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff"><i class="fas fa-check"></i></div>`:''}
      <div style="font-size:20px;margin-bottom:6px">${p.icon}</div>
      <div style="display:flex;gap:3px;justify-content:center;margin-bottom:6px">
        ${p.swatches.map(c=>`<div style="width:14px;height:14px;border-radius:50%;background:${c};border:1px solid rgba(255,255,255,.15)"></div>`).join('')}
      </div>
      <div style="font-size:11px;font-weight:600;color:${active?'var(--accent-blue)':'var(--text-primary)'}">${p.label}</div>
    </div>`;
  }).join('');
}

(function _initPalette() {
  const saved = localStorage.getItem('shic_palette') || 'dark';
  applyPalette(saved);
})();

window.applyPalette = applyPalette;
window.PALETTES = PALETTES;
window._renderPalettePicker = _renderPalettePicker;

// ── UTILITY: debounce ─────────────────────────────────────────
function debounce(fn, ms = 250) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
window.debounce = debounce;

// ── UTILITY: getQtyOnHand / getWAC (Phase A1) ────────────────
// Single source of truth for warehouse stock calculations.
// Replaces duplicate reduce loops in dashboard.js / analytics.js / warehouse.js.
function getQtyOnHand(itemId) {
  const tx = (AppState.data.whTransactions || AppState.data.stockTransactions || []);
  return tx.filter(t => !t._deleted).reduce((q, t) => {
    const lines = t.lines || (t.itemId === itemId ? [t] : []);
    lines.forEach(l => {
      if ((l.itemId || t.itemId) !== itemId) return;
      const qty = parseFloat(l.qty || t.qty || 0);
      if (t.type === 'receive') q += qty;
      else if (t.type === 'issue' || t.type === 'issue-shop' || t.type === 'issue-enduser') q -= qty;
      else if (t.type === 'return') q += qty;
      else if (t.type === 'adjust') q += qty;
    });
    return q;
  }, 0);
}

function getWAC(itemId) {
  const tx = (AppState.data.whTransactions || AppState.data.stockTransactions || []);
  let totalQty = 0, totalCost = 0;
  tx.filter(t => !t._deleted && t.type === 'receive').forEach(t => {
    const lines = t.lines || (t.itemId === itemId ? [t] : []);
    lines.forEach(l => {
      if ((l.itemId || t.itemId) !== itemId) return;
      const qty = parseFloat(l.qty || t.qty || 0);
      const cost = parseFloat(l.unitCost || t.unitCost || 0);
      totalQty += qty;
      totalCost += qty * cost;
    });
  });
  return totalQty > 0 ? totalCost / totalQty : 0;
}

window.getQtyOnHand = getQtyOnHand;
window.getWAC = getWAC;

// ── EVENT BUS (Phase C1) ──────────────────────────────────────
// Lightweight pub/sub for decoupled module communication.
// Usage: AppEvent.on('warehouse:saved', fn) / AppEvent.emit('warehouse:saved', data)
const AppEvent = (() => {
  const _listeners = {};
  return {
    on(event, fn) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== fn);
    },
    emit(event, data) {
      (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.warn('[AppEvent]', event, e); } });
    },
    once(event, fn) {
      const unsub = this.on(event, d => { fn(d); unsub(); });
    },
  };
})();
window.AppEvent = AppEvent;

// ── MODULE REGISTRY (Phase C4) ───────────────────────────────
// Modules self-register instead of needing manual switch-case in renderPage().
// Usage: AppModules.register('warehouse', { render: renderWarehouse, onMount: fn })
const AppModules = (() => {
  const _mods = {};
  return {
    register(id, def) { _mods[id] = def; },
    get(id) { return _mods[id] || null; },
    has(id) { return !!_mods[id]; },
    ids() { return Object.keys(_mods); },
  };
})();
window.AppModules = AppModules;

// ── AppState.mutate() (Phase C2) ─────────────────────────────
// Centralized data mutation: validates, marks dirty, saves, and emits an event.
// Usage: AppState.mutate('projects', arr => [...arr, newProject])
AppState.mutate = function(key, fn) {
  if (!this.data) this.ensureData();
  const prev = this.data[key];
  const next = fn(Array.isArray(prev) ? prev : []);
  this.data[key] = next;
  this.save();
  AppEvent.emit('data:changed', { key, prev, next });
  return next;
};

// ── FORM VALIDATION (Phase D4) ───────────────────────────────
// Usage: const { valid, errors } = validateForm({ name: '', age: '5' }, { name: 'required', age: 'required|number|min:0' })
function validateForm(fields, rules) {
  const errors = {};
  Object.entries(rules).forEach(([field, ruleStr]) => {
    const val = (fields[field] === undefined || fields[field] === null) ? '' : String(fields[field]).trim();
    const parts = ruleStr.split('|');
    for (const rule of parts) {
      const [name, arg] = rule.split(':');
      if (name === 'required' && !val) { errors[field] = 'This field is required'; break; }
      if (name === 'number' && val && isNaN(Number(val))) { errors[field] = 'Must be a number'; break; }
      if (name === 'min' && val && Number(val) < Number(arg)) { errors[field] = `Minimum value is ${arg}`; break; }
      if (name === 'max' && val && Number(val) > Number(arg)) { errors[field] = `Maximum value is ${arg}`; break; }
      if (name === 'minlen' && val && val.length < Number(arg)) { errors[field] = `Minimum ${arg} characters`; break; }
      if (name === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { errors[field] = 'Invalid email address'; break; }
      if (name === 'date' && val && isNaN(new Date(val).getTime())) { errors[field] = 'Invalid date'; break; }
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

// Apply validation errors to form fields — red border + message below each field
function applyFormErrors(errors) {
  // Clear previous
  document.querySelectorAll('.field-error').forEach(el => el.remove());
  document.querySelectorAll('[data-field]').forEach(el => el.style.borderColor = '');
  Object.entries(errors).forEach(([field, msg]) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    el.style.borderColor = 'var(--accent-red)';
    const err = document.createElement('div');
    err.className = 'field-error';
    err.style.cssText = 'color:var(--accent-red);font-size:10px;margin-top:3px';
    err.textContent = msg;
    el.parentNode.insertBefore(err, el.nextSibling);
    el.addEventListener('input', () => { el.style.borderColor = ''; err.remove(); }, { once: true });
  });
}

window.validateForm = validateForm;
window.applyFormErrors = applyFormErrors;

// Lightweight required-field guard — highlights empty fields red, returns false if any empty
function _req(ids) {
  let ok = true;
  ids.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const empty = !String(el.value||'').trim();
    el.style.borderColor = empty ? 'var(--accent-red)' : '';
    if (empty) { ok = false; el.addEventListener('input',()=>el.style.borderColor='',{once:true}); }
  });
  return ok;
}
window._req = _req;
