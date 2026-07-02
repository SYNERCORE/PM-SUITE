// ── APP VERSION & BUILD INFO ──────────────────────────────
const APP_VERSION='2.1.1';
const APP_BUILD='20260528b';
const APP_NAME='SHIC Enterprise PM Suite';
const APP_CODENAME='Syncore';
// CHANGELOG — add new entries at the top when patching
const APP_CHANGELOG=[
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

const AppState={currentPage:'dashboard',theme:localStorage.getItem('pm_theme')||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'),data:null,
save(){
  if(!this.data)this.data=getDefaultData();
  try{
    const json=JSON.stringify(this.data);
    if(_cryptoKey){
      _encryptAndStore(json).catch(()=>{
        try{localStorage.setItem('pm_data',json);}catch(qe){_handleStorageFull(qe,json);}
      });
    }else{
      try{localStorage.setItem('pm_data',json);}catch(qe){_handleStorageFull(qe,json);}
    }
  }catch(e){console.warn('[SHIC] Save error:',e.message);}
},
load(){
  try{
    const s=localStorage.getItem('pm_data');
    if(s){
      const p=JSON.parse(s);
      if(p.__enc){
        // Encrypted — cannot decode synchronously before login; start with defaults.
        // _decryptFromStorage() + AppState.data reassignment happens in doM365Login().
        this.data=getDefaultData();
      }else{
        this.data=p;
      }
    }else{
      this.data=getDefaultData();
    }
  }catch(e){this.data=getDefaultData();}
  if(!this.data)this.data=getDefaultData();
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
  // Cannot save — notify user once per session
  if(!_storageFull_notified){
    _storageFull_notified=true;
    const msg='⚠️ Local storage is full. Your latest changes could not be saved locally.\n\nGo to Settings → Storage → Clean Up to free space, or export a backup.';
    setTimeout(()=>{if(typeof showToast==='function')showToast('Storage full — changes not saved locally. Go to Settings → Storage to clean up.','error',8000);else alert(msg);},200);
  }
}

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

// Module-level state variables
let mlTab='all', mlSearch='', mlStatusFilter='all', mlProjectFilter='all';
let procTab='list', procSearch='', procStatusFilter='all', procProjFilter='all';
let detailProjectId=null, detailTab='overview';
let docSearch='', docStatusFilter='all', docProjFilter='all', docCatFilter='all';
let ganttZoom=100, ganttFrom='', ganttTo='', ganttProjFilter='all', ganttStatusFilter='all';


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

function _setDropdown(key,values){
  if(!AppState.data.settings)AppState.data.settings={};
  if(!AppState.data.settings.dropdowns)AppState.data.settings.dropdowns={};
  AppState.data.settings.dropdowns[key]=values;
  AppState.save();
}

function getDefaultData(){
  // Returns empty data structure — NO demo records
  // Demo data is in getDemoData(); only used when user explicitly resets
  const y=new Date().getFullYear();
  return{
    projects:[],tasks:[],resources:[],equipment:[],tools:[],vehicles:[],
    consumables:[],materials:[],manpower:[],procurement:[],procurementLogs:[],
    warehouseItems:[],stockTransactions:[],issuanceRequests:[],
    resourceAllocations:[],resourceUsageLogs:[],costs:[],qaqc:[],risks:[],
    actions:[],documents:[],progress:[],kpiData:[],calendar:[],
    assetHistory:[],assetUtilization:[],thirdParty:[],projectTeam:[],activities:[],notifications:[],
    trades:[],
    settings:{companyName:'SHIC',currency:'PHP',timezone:'Asia/Manila'},
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


function getDemoData(){
const y=new Date().getFullYear();
return{
projects:[
{id:'PRJ-001',name:'Offshore Platform Module Fabrication',client:'Gulf Energy Corp',location:'Jubail Industrial City',startDate:`${y}-01-10`,endDate:`${y}-08-30`,budget:12500000,spent:7200000,pm:'Ahmed Al-Rashid',status:'active',priority:'high',discipline:'Structural/Mechanical',description:'Design and fabrication of offshore platform modules.',progress:58,riskLevel:'high',phase:'Fabrication'},
{id:'PRJ-002',name:'Refinery Turnaround Maintenance',client:'PetroSaudi Ltd',location:'Yanbu Refinery',startDate:`${y}-03-01`,endDate:`${y}-04-15`,budget:4800000,spent:4200000,pm:'Sarah Mitchell',status:'active',priority:'critical',discipline:'Maintenance',description:'Scheduled turnaround maintenance.',progress:87,riskLevel:'medium',phase:'Execution'},
{id:'PRJ-003',name:'Wastewater Treatment Plant Construction',client:'National Water Authority',location:'Riyadh North',startDate:`${y-1}-09-01`,endDate:`${y}-12-31`,budget:28000000,spent:11500000,pm:'David Chen',status:'active',priority:'high',discipline:'Civil/Process',description:'EPC of 150,000 m3/day WWTP.',progress:41,riskLevel:'medium',phase:'Civil Works'},
{id:'PRJ-004',name:'Gas Compression Station Upgrade',client:'Saudi Gas Co.',location:'Dammam Industrial',startDate:`${y}-02-15`,endDate:`${y}-07-30`,budget:6700000,spent:1800000,pm:'Mohammed Khalil',status:'active',priority:'medium',discipline:'Mechanical/Electrical',description:'Upgrade of four gas compression trains.',progress:27,riskLevel:'low',phase:'Engineering'},
{id:'PRJ-005',name:'Corporate HQ Fit-Out',client:'Al-Faisal Holdings',location:'KAFD',startDate:`${y-1}-11-01`,endDate:`${y}-03-31`,budget:9200000,spent:9200000,pm:'Elena Rodriguez',status:'completed',priority:'medium',discipline:'Interior/MEP',description:'Complete fit-out of 45-floor HQ.',progress:100,riskLevel:'low',phase:'Closeout'},
{id:'PRJ-006',name:'Pipeline Integrity Assessment',client:'Trans-Arabian Pipeline',location:'Multiple Sites',startDate:`${y}-04-01`,endDate:`${y}-09-30`,budget:3400000,spent:0,pm:'James Wilson',status:'planned',priority:'medium',discipline:'Pipeline/Inspection',description:'Smart pig inspection of 800km pipeline.',progress:0,riskLevel:'medium',phase:'Mobilization'}
],
tasks:[
{id:'TSK-001',projectId:'PRJ-001',wbs:'1.1.1',name:'Structural Steel Procurement',assignee:'Ali Hassan',dept:'Procurement',startDate:`${y}-01-10`,endDate:`${y}-02-28`,plannedHrs:120,actualHrs:115,status:'done',priority:'high',progress:100,milestone:false},
{id:'TSK-002',projectId:'PRJ-001',wbs:'1.2.1',name:'Foundation Design Review',assignee:'Sarah Mitchell',dept:'Engineering',startDate:`${y}-01-15`,endDate:`${y}-02-10`,plannedHrs:80,actualHrs:88,status:'done',priority:'critical',progress:100,milestone:false},
{id:'TSK-003',projectId:'PRJ-001',wbs:'1.3.1',name:'Module Assembly Phase 1',assignee:'Ahmed Al-Rashid',dept:'Production',startDate:`${y}-03-01`,endDate:`${y}-05-30`,plannedHrs:800,actualHrs:650,status:'inprogress',priority:'high',progress:72,milestone:false},
{id:'TSK-004',projectId:'PRJ-001',wbs:'1.4.1',name:'NDT Inspection Campaign',assignee:'Robert Kim',dept:'QA/QC',startDate:`${y}-04-01`,endDate:`${y}-06-30`,plannedHrs:200,actualHrs:90,status:'inprogress',priority:'high',progress:45,milestone:false},
{id:'TSK-005',projectId:'PRJ-001',wbs:'1.5.1',name:'Piping Installation',assignee:'Carlos Mendez',dept:'Production',startDate:`${y}-04-15`,endDate:`${y}-07-30`,plannedHrs:600,actualHrs:180,status:'inprogress',priority:'medium',progress:30,milestone:false},
{id:'TSK-006',projectId:'PRJ-001',wbs:'1.6.1',name:'Electrical Terminations',assignee:'Mohammed Khalil',dept:'Electrical',startDate:`${y}-06-01`,endDate:`${y}-08-15`,plannedHrs:300,actualHrs:0,status:'todo',priority:'medium',progress:0,milestone:false},
{id:'TSK-007',projectId:'PRJ-001',wbs:'1.7.1',name:'Final Load-Out Inspection',assignee:'Ahmed Al-Rashid',dept:'QA/QC',startDate:`${y}-08-20`,endDate:`${y}-08-28`,plannedHrs:40,actualHrs:0,status:'todo',priority:'critical',progress:0,milestone:true},
{id:'TSK-008',projectId:'PRJ-002',wbs:'2.1.1',name:'Pre-Shutdown Planning',assignee:'Sarah Mitchell',dept:'Planning',startDate:`${y}-02-01`,endDate:`${y}-02-28`,plannedHrs:160,actualHrs:155,status:'done',priority:'critical',progress:100,milestone:false},
{id:'TSK-009',projectId:'PRJ-002',wbs:'2.2.1',name:'Equipment Blinding & Isolation',assignee:'David Chen',dept:'Operations',startDate:`${y}-03-01`,endDate:`${y}-03-07`,plannedHrs:240,actualHrs:248,status:'done',priority:'critical',progress:100,milestone:false},
{id:'TSK-010',projectId:'PRJ-002',wbs:'2.3.1',name:'Heat Exchanger Cleaning',assignee:'Ali Hassan',dept:'Maintenance',startDate:`${y}-03-08`,endDate:`${y}-03-20`,plannedHrs:400,actualHrs:420,status:'done',priority:'high',progress:100,milestone:false},
{id:'TSK-011',projectId:'PRJ-002',wbs:'2.4.1',name:'Column Internal Inspection',assignee:'Robert Kim',dept:'Inspection',startDate:`${y}-03-15`,endDate:`${y}-04-01`,plannedHrs:320,actualHrs:305,status:'inprogress',priority:'high',progress:95,milestone:false},
{id:'TSK-012',projectId:'PRJ-002',wbs:'2.5.1',name:'Catalyst Replacement',assignee:'Carlos Mendez',dept:'Process',startDate:`${y}-04-01`,endDate:`${y}-04-10`,plannedHrs:200,actualHrs:0,status:'todo',priority:'critical',progress:0,milestone:false},
{id:'TSK-013',projectId:'PRJ-003',wbs:'3.1.1',name:'Site Preparation & Clearing',assignee:'Elena Rodriguez',dept:'Civil',startDate:`${y-1}-09-01`,endDate:`${y-1}-11-30`,plannedHrs:1200,actualHrs:1200,status:'done',priority:'high',progress:100,milestone:false},
{id:'TSK-014',projectId:'PRJ-003',wbs:'3.2.1',name:'Foundation Works',assignee:'James Wilson',dept:'Civil',startDate:`${y-1}-12-01`,endDate:`${y}-02-28`,plannedHrs:2400,actualHrs:2200,status:'inprogress',priority:'high',progress:85,milestone:false},
{id:'TSK-015',projectId:'PRJ-003',wbs:'3.3.1',name:'Bioreactor Installation',assignee:'David Chen',dept:'Mechanical',startDate:`${y}-03-01`,endDate:`${y}-07-31`,plannedHrs:3000,actualHrs:400,status:'inprogress',priority:'high',progress:15,milestone:false}
],
resources:[
{id:'RES-001',name:'Ahmed Al-Rashid',role:'Project Manager',dept:'Management',skills:['Leadership','Planning','Risk Mgmt'],certifications:['PMP','PRINCE2'],utilization:95,availability:'busy',hourlyRate:180},
{id:'RES-002',name:'Sarah Mitchell',role:'Senior Engineer',dept:'Engineering',skills:['Structural','Welding','QA/QC'],certifications:['PE','AWS-CWI'],utilization:88,availability:'busy',hourlyRate:150},
{id:'RES-003',name:'David Chen',role:'Construction Manager',dept:'Construction',skills:['Civil','MEP','Safety'],certifications:['PMP','OSHA-30'],utilization:72,availability:'available',hourlyRate:160},
{id:'RES-004',name:'Mohammed Khalil',role:'Mechanical Engineer',dept:'Engineering',skills:['Rotating Eq.','Piping','HVAC'],certifications:['PE','API-510'],utilization:65,availability:'available',hourlyRate:140},
{id:'RES-005',name:'Elena Rodriguez',role:'Interior Architect',dept:'Architecture',skills:['Interior Design','AutoCAD','BIM'],certifications:['LEED AP','NCIDQ'],utilization:100,availability:'unavailable',hourlyRate:135},
{id:'RES-006',name:'Robert Kim',role:'QA/QC Inspector',dept:'Quality',skills:['NDT','Weld Inspection','Pressure Testing'],certifications:['CSWIP-3.1','PCN-UT'],utilization:80,availability:'available',hourlyRate:120},
{id:'RES-007',name:'James Wilson',role:'Pipeline Engineer',dept:'Engineering',skills:['Pipeline Design','Smart Pig','RSTRENG'],certifications:['PE','ASNT-III'],utilization:30,availability:'available',hourlyRate:145},
{id:'RES-008',name:'Carlos Mendez',role:'Piping Supervisor',dept:'Piping',skills:['Piping Layout','Stress Analysis','ASME B31.3'],certifications:['API-570','CWI'],utilization:90,availability:'busy',hourlyRate:125}
],
manpower:[
{id:'MP-001',projectId:'PRJ-001',trade:'Structural Fitter',planned:45,actual:42,week:'W18',cost:52500,shift:'Day',overtime:120},
{id:'MP-002',projectId:'PRJ-001',trade:'Pipe Welder',planned:30,actual:28,week:'W18',cost:42000,shift:'Day',overtime:80},
{id:'MP-003',projectId:'PRJ-001',trade:'Electrician',planned:20,actual:18,week:'W18',cost:21600,shift:'Day',overtime:40},
{id:'MP-004',projectId:'PRJ-002',trade:'Mechanical Fitter',planned:60,actual:65,week:'W18',cost:71500,shift:'Day/Night',overtime:240},
{id:'MP-005',projectId:'PRJ-002',trade:'Scaffolder',planned:25,actual:22,week:'W18',cost:22000,shift:'Day',overtime:60},
{id:'MP-006',projectId:'PRJ-003',trade:'Concrete Crew',planned:80,actual:75,week:'W18',cost:67500,shift:'Day',overtime:100},
{id:'MP-007',projectId:'PRJ-003',trade:'Rebar Fixer',planned:40,actual:38,week:'W18',cost:30400,shift:'Day',overtime:60},
{id:'MP-008',projectId:'PRJ-004',trade:'Instrument Tech',planned:15,actual:12,week:'W18',cost:16800,shift:'Day',overtime:0}
],
materials:[
{id:'MAT-001',projectId:'PRJ-001',name:'A36 Structural Steel Plates',qty:850,unit:'MT',unitCost:920,status:'delivered',deliveryDate:`${y}-02-15`,supplier:'ArcelorMittal',critical:true},
{id:'MAT-002',projectId:'PRJ-001',name:'CS Seamless Pipe 6" Sch80',qty:1200,unit:'M',unitCost:185,status:'partial',deliveryDate:`${y}-04-30`,supplier:'Nippon Steel',critical:true},
{id:'MAT-003',projectId:'PRJ-001',name:'Structural Bolts Grade A325',qty:12000,unit:'PCS',unitCost:4.5,status:'delivered',deliveryDate:`${y}-03-01`,supplier:'Fastenal ME',critical:false},
{id:'MAT-004',projectId:'PRJ-002',name:'Gaskets - Spiral Wound ASME',qty:450,unit:'PCS',unitCost:85,status:'delivered',deliveryDate:`${y}-02-20`,supplier:'Flexitallic',critical:true},
{id:'MAT-005',projectId:'PRJ-002',name:'Catalyst - Reforming Type A',qty:12,unit:'MT',unitCost:85000,status:'pending',deliveryDate:`${y}-03-25`,supplier:'BASF Catalysts',critical:true},
{id:'MAT-006',projectId:'PRJ-003',name:'Cement OPC 52.5N',qty:8500,unit:'MT',unitCost:85,status:'partial',deliveryDate:`${y}-03-15`,supplier:'LafargeHolcim',critical:false},
{id:'MAT-007',projectId:'PRJ-003',name:'HDPE Membrane 2mm',qty:45000,unit:'M2',unitCost:12,status:'pending',deliveryDate:`${y}-05-01`,supplier:'GSE Environmental',critical:true},
{id:'MAT-008',projectId:'PRJ-004',name:'Compressor Rotor Assembly',qty:4,unit:'SETS',unitCost:320000,status:'ordered',deliveryDate:`${y}-05-30`,supplier:'Siemens Energy',critical:true}
],
procurement:[
{id:'PO-001',projectId:'PRJ-001',description:'Structural Steel Supply Phase 1',vendor:'ArcelorMittal',budgetAmount:899299,amount:782000,status:'delivered',poDate:`${y}-01-20`,deliveryDate:`${y}-02-15`,category:'Materials'},
{id:'PO-002',projectId:'PRJ-001',description:'Piping Materials Package',vendor:'Nippon Steel',budgetAmount:255299,amount:222000,status:'partial',poDate:`${y}-02-10`,deliveryDate:`${y}-04-30`,category:'Materials'},
{id:'PO-003',projectId:'PRJ-002',description:'Turnaround Manpower Contract',vendor:'Gulf Manpower Services',budgetAmount:1437500,amount:1250000,status:'active',poDate:`${y}-02-01`,deliveryDate:`${y}-04-30`,category:'Services'},
{id:'PO-004',projectId:'PRJ-002',description:'Catalyst Supply Package',vendor:'BASF Catalysts',budgetAmount:1173000,amount:1020000,status:'pending',poDate:`${y}-03-01`,deliveryDate:`${y}-03-25`,category:'Materials'},
{id:'PO-005',projectId:'PRJ-003',description:'Civil Subcontract Phase 1',vendor:'Saudi Binladin Group',budgetAmount:9775000,amount:8500000,status:'active',poDate:`${y-1}-09-15`,deliveryDate:`${y}-08-31`,category:'Subcontract'},
{id:'PO-006',projectId:'PRJ-004',description:'Gas Compressor Package',vendor:'Siemens Energy',budgetAmount:1472000,amount:1280000,status:'ordered',poDate:`${y}-03-15`,deliveryDate:`${y}-05-30`,category:'Equipment'},
{id:'PO-007',projectId:'PRJ-001',description:'NDT & Inspection Services',vendor:'Bureau Veritas',budgetAmount:212749,amount:185000,status:'active',poDate:`${y}-02-15`,deliveryDate:`${y}-08-30`,category:'Services'}
],
costs:[
{id:'CST-001',projectId:'PRJ-001',category:'Labor',planned:3500000,actual:2100000,description:'Direct Labor'},
{id:'CST-002',projectId:'PRJ-001',category:'Materials',planned:6800000,actual:3900000,description:'Materials & Equipment'},
{id:'CST-003',projectId:'PRJ-001',category:'Subcontract',planned:1500000,actual:900000,description:'Subcontracted Works'},
{id:'CST-004',projectId:'PRJ-001',category:'OH&P',planned:700000,actual:300000,description:'Overhead & Profit'},
{id:'CST-005',projectId:'PRJ-002',category:'Labor',planned:1800000,actual:1750000,description:'Turnaround Labor'},
{id:'CST-006',projectId:'PRJ-002',category:'Materials',planned:1500000,actual:1420000,description:'Consumables & Spares'},
{id:'CST-007',projectId:'PRJ-002',category:'Equipment',planned:800000,actual:780000,description:'Equipment Rental'},
{id:'CST-008',projectId:'PRJ-003',category:'Civil',planned:12000000,actual:4800000,description:'Civil Works'},
{id:'CST-009',projectId:'PRJ-003',category:'Mechanical',planned:10000000,actual:2800000,description:'Mechanical Works'},
{id:'CST-010',projectId:'PRJ-003',category:'Engineering',planned:3000000,actual:2100000,description:'Engineering Services'}
],
qaqc:[
{id:'IR-001',projectId:'PRJ-001',type:'Inspection',description:'Structural Weld Visual Inspection Module A1',inspector:'Robert Kim',date:`${y}-03-15`,status:'approved',result:'Pass',discipline:'Structural'},
{id:'IR-002',projectId:'PRJ-001',type:'Test',description:'Hydrostatic Test Piping Line 6P-012',inspector:'Carlos Mendez',date:`${y}-04-10`,status:'pending',result:'',discipline:'Piping'},
{id:'IR-003',projectId:'PRJ-001',type:'NCR',description:'Weld Joint W-245 Undercut exceeds ASME limit',inspector:'Robert Kim',date:`${y}-03-28`,status:'open',result:'Fail',discipline:'Structural'},
{id:'IR-004',projectId:'PRJ-002',type:'Inspection',description:'Column T-101 Tray Inspection',inspector:'Sarah Mitchell',date:`${y}-03-18`,status:'approved',result:'Pass',discipline:'Vessel'},
{id:'IR-005',projectId:'PRJ-002',type:'Punch',description:'Punch List Control Room Instrumentation',inspector:'Mohammed Khalil',date:`${y}-04-02`,status:'open',result:'B-Punch',discipline:'Instrument'},
{id:'IR-006',projectId:'PRJ-003',type:'Inspection',description:'Foundation Rebar Placement Inspection',inspector:'David Chen',date:`${y}-02-20`,status:'approved',result:'Pass',discipline:'Civil'},
{id:'IR-007',projectId:'PRJ-001',type:'Audit',description:'Document Control Audit Rev 02',inspector:'Elena Rodriguez',date:`${y}-04-05`,status:'closed',result:'Minor Findings',discipline:'Admin'},
{id:'IR-008',projectId:'PRJ-002',type:'NCR',description:'Torque specification deviation on flange bolting',inspector:'Robert Kim',date:`${y}-04-01`,status:'open',result:'Fail',discipline:'Mechanical'}
],
risks:[
{id:'RSK-001',projectId:'PRJ-001',description:'Delayed delivery of structural steel from Korea',probability:4,impact:4,mitigation:'Secured alternative supplier in UAE; buffer stock 10%',owner:'Ahmed Al-Rashid',dueDate:`${y}-03-31`,status:'active',category:'Procurement'},
{id:'RSK-002',projectId:'PRJ-001',description:'Skilled welder shortage during peak production',probability:3,impact:3,mitigation:'Pre-qualified subcontractor on standby',owner:'Carlos Mendez',dueDate:`${y}-05-31`,status:'mitigated',category:'Resources'},
{id:'RSK-003',projectId:'PRJ-002',description:'Catalyst delivery delay critical path impact',probability:3,impact:5,mitigation:'Expediting agent engaged; airfreight option evaluated',owner:'Sarah Mitchell',dueDate:`${y}-03-20`,status:'active',category:'Procurement'},
{id:'RSK-004',projectId:'PRJ-002',description:'Extended equipment inspection findings',probability:4,impact:3,mitigation:'Contingency schedule floats; pre-ordered spares on site',owner:'David Chen',dueDate:`${y}-04-10`,status:'active',category:'Technical'},
{id:'RSK-005',projectId:'PRJ-003',description:'Ground water table higher than design assumption',probability:2,impact:4,mitigation:'Dewatering system installed; design revised',owner:'James Wilson',dueDate:`${y}-04-30`,status:'closed',category:'Technical'},
{id:'RSK-006',projectId:'PRJ-003',description:'Permit delays from Environmental Authority',probability:3,impact:3,mitigation:'Dedicated regulatory liaison',owner:'Elena Rodriguez',dueDate:`${y}-06-30`,status:'active',category:'Regulatory'},
{id:'RSK-007',projectId:'PRJ-004',description:'Compressor delivery lead time 6 months',probability:2,impact:5,mitigation:'PO issued early; factory visits monthly',owner:'Mohammed Khalil',dueDate:`${y}-05-30`,status:'active',category:'Procurement'},
{id:'RSK-008',projectId:'PRJ-001',description:'HSE incident during heavy lift operations',probability:2,impact:5,mitigation:'Third-party lift study; dedicated safety observer',owner:'Ahmed Al-Rashid',dueDate:`${y}-07-31`,status:'active',category:'HSE'}
],
actions:[
{id:'ACT-001',projectId:'PRJ-001',description:'Issue revised structural drawing Rev-04 to contractor',assignee:'Sarah Mitchell',dueDate:`${y}-04-15`,priority:'high',status:'open',source:'Review Meeting'},
{id:'ACT-002',projectId:'PRJ-001',description:'Submit NCR-003 closure report to client',assignee:'Robert Kim',dueDate:`${y}-04-05`,priority:'critical',status:'overdue',source:'QA/QC'},
{id:'ACT-003',projectId:'PRJ-002',description:'Expedite catalyst delivery confirmation from BASF',assignee:'Sarah Mitchell',dueDate:`${y}-04-08`,priority:'critical',status:'open',source:'Risk Meeting'},
{id:'ACT-004',projectId:'PRJ-002',description:'Complete hydrostatic test for Loop 2 piping',assignee:'Carlos Mendez',dueDate:`${y}-04-20`,priority:'high',status:'inprogress',source:'Schedule'},
{id:'ACT-005',projectId:'PRJ-003',description:'Submit bioreactor procurement package to client',assignee:'David Chen',dueDate:`${y}-04-25`,priority:'high',status:'open',source:'Client Request'},
{id:'ACT-006',projectId:'PRJ-001',description:'Update project schedule baseline to Rev-03',assignee:'Ahmed Al-Rashid',dueDate:`${y}-04-18`,priority:'medium',status:'open',source:'PMO'},
{id:'ACT-007',projectId:'PRJ-004',description:'Confirm Siemens FAT dates for compressor package',assignee:'Mohammed Khalil',dueDate:`${y}-04-30`,priority:'high',status:'open',source:'Procurement'}
],
documents:[
{id:'DOC-001',projectId:'PRJ-001',name:'Structural Design Basis',number:'001-SDB-001',rev:'C',category:'Engineering',status:'approved',author:'Sarah Mitchell',date:`${y}-02-01`,size:'4.2 MB'},
{id:'DOC-002',projectId:'PRJ-001',name:'Welding Procedure Specification',number:'001-WPS-001',rev:'B',category:'QA/QC',status:'approved',author:'Robert Kim',date:`${y}-01-25`,size:'1.8 MB'},
{id:'DOC-003',projectId:'PRJ-001',name:'Piping & Instrumentation Diagram',number:'001-PID-001',rev:'D',category:'Engineering',status:'review',author:'Carlos Mendez',date:`${y}-03-15`,size:'12.4 MB'},
{id:'DOC-004',projectId:'PRJ-002',name:'Turnaround Scope of Work',number:'002-SOW-001',rev:'A',category:'Management',status:'approved',author:'Sarah Mitchell',date:`${y}-01-15`,size:'2.1 MB'},
{id:'DOC-005',projectId:'PRJ-002',name:'Equipment Condition Report',number:'002-ECR-001',rev:'B',category:'Inspection',status:'issued',author:'David Chen',date:`${y}-03-22`,size:'8.6 MB'},
{id:'DOC-006',projectId:'PRJ-003',name:'Site Investigation Report',number:'003-SIR-001',rev:'A',category:'Civil',status:'approved',author:'James Wilson',date:`${y-1}-10-01`,size:'22.5 MB'},
{id:'DOC-007',projectId:'PRJ-003',name:'Environmental Impact Assessment',number:'003-EIA-001',rev:'C',category:'Environmental',status:'review',author:'Elena Rodriguez',date:`${y}-03-01`,size:'18.2 MB'},
{id:'DOC-008',projectId:'PRJ-004',name:'Compressor Data Sheet Package',number:'004-DS-001',rev:'A',category:'Equipment',status:'issued',author:'Mohammed Khalil',date:`${y}-03-20`,size:'6.4 MB'}
],
notifications:[
{id:'NTF-001',title:'Action Item Overdue',message:'ACT-002: NCR closure report overdue',type:'error',time:'2h ago',read:false},
{id:'NTF-002',title:'Risk Alert',message:'RSK-003: Catalyst delivery risk escalated',type:'warning',time:'4h ago',read:false},
{id:'NTF-003',title:'Milestone Approaching',message:'PRJ-001: Load-Out Inspection in 18 days',type:'info',time:'6h ago',read:false},
{id:'NTF-004',title:'NCR Opened',message:'New NCR IR-008 opened on PRJ-002',type:'warning',time:'8h ago',read:false},
{id:'NTF-005',title:'Budget Variance Alert',message:'PRJ-002: CPI = 0.94',type:'warning',time:'1d ago',read:true},
{id:'NTF-006',title:'Task Completed',message:'TSK-010 Heat Exchanger Cleaning done',type:'success',time:'1d ago',read:true}
],
activities:[
{user:'Ahmed Al-Rashid',action:'Updated Module Assembly progress to 72%',time:'10 min ago',type:'update',project:'PRJ-001'},
{user:'Robert Kim',action:'Opened NCR-008: Torque deviation on flange bolting',time:'1h ago',type:'alert',project:'PRJ-002'},
{user:'Sarah Mitchell',action:'Submitted Turnaround Week 6 progress report',time:'2h ago',type:'report',project:'PRJ-002'},
{user:'David Chen',action:'Added 3 new risks to Risk Register',time:'3h ago',type:'risk',project:'PRJ-003'},
{user:'Carlos Mendez',action:'Completed hydrostatic test Loop 1 - PASS',time:'5h ago',type:'success',project:'PRJ-002'},
{user:'Mohammed Khalil',action:'Placed PO-006 with Siemens Energy',time:'6h ago',type:'procurement',project:'PRJ-004'}
],
equipment:[
{id:'EQP-001',name:'Crawler Crane 150T',type:'Equipment',category:'Lifting',make:'Liebherr',model:'LTM 1150-5.1',serialNo:'LBH-2019-001',regNo:'N/A',status:'in-use',projectId:'PRJ-001',location:'Jubail Industrial City',lastMaint:'2026-03-15',nextMaint:'2026-06-15',maintInterval:'3 months',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Lifting Certificate',certBody:'SGS Philippines',certExpiry:'2026-12-31',dailyRate:45000,notes:'Annual inspection due Q4'},
{id:'EQP-002',name:'Air Compressor 500CFM',type:'Equipment',category:'Pneumatic',make:'Atlas Copco',model:'XAHS 476',serialNo:'AC-2020-447',regNo:'N/A',status:'available',projectId:'PRJ-002',location:'Yanbu Refinery',lastMaint:'2026-04-01',nextMaint:'2026-07-01',maintInterval:'3 months',lastCal:'2026-01-10',nextCal:'2026-07-10',calBody:'Bureau Veritas',cert:'Pressure Vessel Cert',certBody:'DOLE',certExpiry:'2026-09-30',dailyRate:3500,notes:''},
{id:'EQP-003',name:'Hydraulic Torque Wrench Set',type:'Equipment',category:'Mechanical',make:'Enerpac',model:'W-Series 3500Nm',serialNo:'ENP-2021-TW3',regNo:'N/A',status:'available',projectId:'PRJ-002',location:'Yanbu Refinery',lastMaint:'2026-02-01',nextMaint:'2026-08-01',maintInterval:'6 months',lastCal:'2026-02-01',nextCal:'2026-08-01',calBody:'SGS Philippines',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:1200,notes:'Calibration cert included'},
{id:'EQP-004',name:'Concrete Pump Truck 52m',type:'Equipment',category:'Civil',make:'Putzmeister',model:'M52-5',serialNo:'PMB-2022-5241',regNo:'PLT-7821',status:'in-use',projectId:'PRJ-003',location:'Riyadh North',lastMaint:'2026-04-10',nextMaint:'2026-07-10',maintInterval:'3 months',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Operating Certificate',certBody:'MOMRAH',certExpiry:'2026-11-30',dailyRate:18000,notes:''},
{id:'EQP-005',name:'Welding Machine Lincoln 400A',type:'Equipment',category:'Welding',make:'Lincoln Electric',model:'Vantage 400',serialNo:'LNC-WLD-2020-08',regNo:'N/A',status:'maintenance',projectId:'PRJ-001',location:'Workshop',lastMaint:'2026-04-15',nextMaint:'2026-05-15',maintInterval:'1 month',lastCal:'2026-01-20',nextCal:'2026-07-20',calBody:'Bureau Veritas',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:800,notes:'Under preventive maintenance'}
],
tools:[
{id:'TOL-001',name:'Ultrasonic Thickness Gauge',type:'Tool',category:'NDT',make:'Olympus',model:'38DL PLUS',serialNo:'OLY-UTG-2021-14',regNo:'N/A',status:'available',projectId:'PRJ-001',location:'QA/QC Lab',lastMaint:'N/A',nextMaint:'N/A',maintInterval:'N/A',lastCal:'2026-01-15',nextCal:'2026-07-15',calBody:'SGS Philippines',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:500,notes:'NIST traceable calibration'},
{id:'TOL-002',name:'Vibration Analyzer Fluke 810',type:'Tool',category:'Condition Monitoring',make:'Fluke',model:'810',serialNo:'FLK-VA-2022-33',regNo:'N/A',status:'in-use',projectId:'PRJ-004',location:'Dammam Industrial',lastMaint:'N/A',nextMaint:'N/A',maintInterval:'N/A',lastCal:'2026-02-20',nextCal:'2026-08-20',calBody:'Bureau Veritas',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:800,notes:''},
{id:'TOL-003',name:'Laser Level Set Leica',type:'Tool',category:'Survey',make:'Leica',model:'Rugby 840',serialNo:'LCA-LL-2020-07',regNo:'N/A',status:'available',projectId:'PRJ-003',location:'Site Office',lastMaint:'N/A',nextMaint:'N/A',maintInterval:'N/A',lastCal:'2026-03-01',nextCal:'2026-09-01',calBody:'BCIS Calibration',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:400,notes:''},
{id:'TOL-004',name:'4-Gas Detector ISC Ventis',type:'Tool',category:'Safety',make:'Industrial Scientific',model:'Ventis MX4',serialNo:'ISC-GD-2023-22',regNo:'N/A',status:'available',projectId:'PRJ-002',location:'Safety Store',lastMaint:'2026-04-01',nextMaint:'2026-05-01',maintInterval:'1 month',lastCal:'2026-04-01',nextCal:'2026-05-01',calBody:'On-site',cert:'N/A',certBody:'N/A',certExpiry:'N/A',dailyRate:250,notes:'Daily bump test required'}
],
vehicles:[
{id:'VEH-001',name:'Service Pickup Toyota Hilux',type:'Vehicle',category:'Light Vehicle',make:'Toyota',model:'Hilux 4x4',serialNo:'ENG-2021-HLX',regNo:'ABC-1234',status:'available',projectId:'PRJ-001',location:'Jubail Base',lastMaint:'2026-03-20',nextMaint:'2026-06-20',maintInterval:'3 months / 5000km',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Vehicle Registration',certBody:'LTO',certExpiry:'2026-12-31',dailyRate:2500,notes:'Odometer: 45,230 km'},
{id:'VEH-002',name:'Flatbed Trailer 40T',type:'Vehicle',category:'Heavy Transport',make:'Goldhofer',model:'STZ-L8-68/80',serialNo:'GHF-FBT-2019-02',regNo:'TLR-5678',status:'in-use',projectId:'PRJ-001',location:'Jubail Port',lastMaint:'2026-02-10',nextMaint:'2026-05-10',maintInterval:'3 months',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Heavy Haulage Permit',certBody:'MOT',certExpiry:'2026-06-30',dailyRate:15000,notes:'Permit renewal due next month'},
{id:'VEH-003',name:'Man Lift JLG 18m',type:'Vehicle',category:'Aerial Work Platform',make:'JLG',model:'860SJ',serialNo:'JLG-ML-2020-11',regNo:'N/A',status:'available',projectId:'PRJ-003',location:'Riyadh Site',lastMaint:'2026-04-05',nextMaint:'2026-07-05',maintInterval:'3 months',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Operator Certificate',certBody:'DOLE/OSSD',certExpiry:'2026-08-15',dailyRate:4500,notes:'Daily pre-use inspection'},
{id:'VEH-004',name:'Water Tanker Hino 10,000L',type:'Vehicle',category:'Support Vehicle',make:'Hino',model:'500 Series',serialNo:'HNO-WT-2021-05',regNo:'WTR-9012',status:'available',projectId:'PRJ-003',location:'Riyadh North',lastMaint:'2026-03-01',nextMaint:'2026-06-01',maintInterval:'3 months',lastCal:'N/A',nextCal:'N/A',calBody:'N/A',cert:'Vehicle Registration',certBody:'LTO',certExpiry:'2026-10-31',dailyRate:3500,notes:''}
],
consumables:[
{id:'CON-001',name:'Welding Electrodes E7018 3.2mm',type:'Consumable',category:'Welding',unit:'KG',qtyOnHand:850,minStock:200,reorderQty:500,unitCost:180,projectId:'PRJ-001',supplier:'ESAB Philippines',status:'in-stock',notes:'Store in dry cabinet'},
{id:'CON-002',name:'Safety Helmets Class E',type:'Consumable',category:'PPE',unit:'PCS',qtyOnHand:120,minStock:50,reorderQty:100,unitCost:450,projectId:'PRJ-001',supplier:'3M Philippines',status:'in-stock',notes:'Replace every 3 years'},
{id:'CON-003',name:'Scaffolding Boards 3.6m',type:'Consumable',category:'Scaffolding',unit:'PCS',qtyOnHand:80,minStock:100,reorderQty:200,unitCost:850,projectId:'PRJ-003',supplier:'SGB Philippines',status:'low-stock',notes:'Inspect before each use'},
{id:'CON-004',name:'Form Release Oil (Concrete)',type:'Consumable',category:'Civil',unit:'L',qtyOnHand:180,minStock:100,reorderQty:300,unitCost:120,projectId:'PRJ-003',supplier:'Local Supplier',status:'in-stock',notes:''},
{id:'CON-005',name:'Grinding Discs 125mm',type:'Consumable',category:'Welding',unit:'PCS',qtyOnHand:45,minStock:100,reorderQty:200,unitCost:85,projectId:'PRJ-001',supplier:'Norton Philippines',status:'low-stock',notes:'Reorder urgently'}
],
thirdParty:[
{id:'TP-001',name:'Bureau Veritas Philippines',type:'Third Party',category:'Inspection & Testing',service:'NDT, Visual Inspection, Hydro Test Witness',contactPerson:'Mark Santos',contactNo:'+63-917-555-0101',projectId:'PRJ-001',status:'active',contractStart:'2026-01-01',contractEnd:'2026-12-31',monthlyRate:285000,accreditation:'ISO/IEC 17020',accreditationExpiry:'2027-01-15',notes:'On-site inspector 3 days/week'},
{id:'TP-002',name:'Gulf Manpower Services',type:'Third Party',category:'Labour Supply',service:'Skilled trades: welders, fitters, electricians',contactPerson:'Ahmad Reyes',contactNo:'+63-917-555-0202',projectId:'PRJ-002',status:'active',contractStart:'2026-02-01',contractEnd:'2026-05-31',monthlyRate:1250000,accreditation:'POEA Licensed',accreditationExpiry:'2027-06-30',notes:'100 workers supplied'},
{id:'TP-003',name:'BASF Technical Support',type:'Third Party',category:'Technical Consultancy',service:'Catalyst handling, process optimization',contactPerson:'Dr. Werner Koch',contactNo:'+49-621-555-9900',projectId:'PRJ-002',status:'active',contractStart:'2026-03-01',contractEnd:'2026-04-30',monthlyRate:520000,accreditation:'ISO 9001:2015',accreditationExpiry:'2028-03-01',notes:'Remote + 2 site visits'},
{id:'TP-004',name:'SGS Philippines Inc.',type:'Third Party',category:'Calibration Services',service:'Instrument calibration, certification',contactPerson:'Rose Manalo',contactNo:'+63-2-8555-0303',projectId:'PRJ-001',status:'active',contractStart:'2026-01-15',contractEnd:'2026-12-31',monthlyRate:85000,accreditation:'ISO/IEC 17025',accreditationExpiry:'2027-06-30',notes:'Monthly calibration schedule'}
],
utilizationLog:[
{id:'UL-001',resourceId:'EQP-001',resourceName:'Crawler Crane 150T',resourceType:'Equipment',projectId:'PRJ-001',date:'2026-05-20',startTime:'07:00',endTime:'17:00',hoursUsed:10,operator:'Ahmed Al-Rashid',activity:'Module A1 structural lift',utilization:100,fuelConsumed:180,notes:''},
{id:'UL-002',resourceId:'EQP-002',resourceName:'Air Compressor 500CFM',resourceType:'Equipment',projectId:'PRJ-002',date:'2026-05-20',startTime:'06:00',endTime:'14:00',hoursUsed:8,operator:'Carlos Mendez',activity:'Piping leak test support',utilization:80,fuelConsumed:90,notes:''},
{id:'UL-003',resourceId:'VEH-001',resourceName:'Service Pickup Toyota Hilux',resourceType:'Vehicle',projectId:'PRJ-001',date:'2026-05-21',startTime:'07:30',endTime:'16:30',hoursUsed:9,operator:'Ali Hassan',activity:'Material delivery runs',utilization:90,fuelConsumed:35,notes:'Odometer: 45,230 km'},
{id:'UL-004',resourceId:'TOL-001',resourceName:'Ultrasonic Thickness Gauge',resourceType:'Tool',projectId:'PRJ-001',date:'2026-05-21',startTime:'08:00',endTime:'12:00',hoursUsed:4,operator:'Robert Kim',activity:'Weld thickness verification',utilization:100,fuelConsumed:0,notes:'30 weld joints inspected'},
{id:'UL-005',resourceId:'EQP-004',resourceName:'Concrete Pump Truck 52m',resourceType:'Equipment',projectId:'PRJ-003',date:'2026-05-22',startTime:'05:00',endTime:'15:00',hoursUsed:10,operator:'James Wilson',activity:'Foundation slab pour - Grid C',utilization:95,fuelConsumed:220,notes:'120m3 concrete placed'},
{id:'UL-006',resourceId:'VEH-003',resourceName:'Man Lift JLG 18m',resourceType:'Vehicle',projectId:'PRJ-003',date:'2026-05-22',startTime:'07:00',endTime:'17:00',hoursUsed:10,operator:'David Chen',activity:'Elevated rebar inspection',utilization:70,fuelConsumed:15,notes:''}
],
assetHistory:[
{id:'AH-001',assetId:'EQP-001',assetName:'Crawler Crane 150T',assetType:'Equipment',action:'Deployment',detail:'Deployed to PRJ-001 Module A1 heavy lift operations',performedBy:'Ahmed Al-Rashid',date:'2026-05-20',projectId:'PRJ-001',beforeValue:'available',afterValue:'in-use'},
{id:'AH-002',assetId:'EQP-001',assetName:'Crawler Crane 150T',assetType:'Equipment',action:'Maintenance',detail:'Quarterly preventive maintenance completed. Greased all slewing ring and replaced wire rope section.',performedBy:'Workshop Team',date:'2026-03-15',projectId:'PRJ-001',beforeValue:'in-use',afterValue:'available'},
{id:'AH-003',assetId:'TOL-001',assetName:'Ultrasonic Thickness Gauge',assetType:'Tool',action:'Calibration',detail:'Annual calibration completed by SGS Philippines. NIST traceable certificate issued.',performedBy:'SGS Philippines',date:'2026-01-15',projectId:'PRJ-001',beforeValue:'due for calibration',afterValue:'calibrated'},
{id:'AH-004',assetId:'VEH-002',assetName:'Flatbed Trailer 40T',assetType:'Vehicle',action:'Permit Renewal',detail:'Heavy haulage permit renewed with MOT. Valid until 2026-06-30.',performedBy:'Admin Team',date:'2025-06-28',projectId:'PRJ-001',beforeValue:'expiring',afterValue:'renewed'},
{id:'AH-005',assetId:'EQP-004',assetName:'Concrete Pump Truck 52m',assetType:'Equipment',action:'Deployment',detail:'Mobilized to PRJ-003 Riyadh North for foundation slab pour operations.',performedBy:'David Chen',date:'2026-04-01',projectId:'PRJ-003',beforeValue:'available',afterValue:'in-use'},
{id:'AH-006',assetId:'EQP-005',assetName:'Welding Machine Lincoln 400A',assetType:'Equipment',action:'Maintenance',detail:'Carbon brush replacement and electrode holder repair. Machine back in service.',performedBy:'Workshop Team',date:'2026-04-15',projectId:'PRJ-001',beforeValue:'available',afterValue:'maintenance'},
{id:'AH-007',assetId:'TOL-004',assetName:'4-Gas Detector ISC Ventis',assetType:'Tool',action:'Calibration',detail:'Monthly bump test and full calibration. Calibration gas: O2, CO, H2S, LEL.',performedBy:'Safety Officer',date:'2026-04-01',projectId:'PRJ-002',beforeValue:'due',afterValue:'calibrated'},
{id:'AH-008',assetId:'VEH-001',assetName:'Service Pickup Toyota Hilux',assetType:'Vehicle',action:'Maintenance',detail:'15,000km service: oil change, air filter, brake pads, tire rotation.',performedBy:'Workshop Team',date:'2026-03-20',projectId:'PRJ-001',beforeValue:'in-use',afterValue:'available'}
],
activities:[],
  notifications:[],
  settings:{companyName:'SHIC',currency:'PHP',dateFormat:'YYYY-MM-DD',timezone:'Asia/Manila',notificationsEmail:true,notificationsPush:true,autoSave:true}
}
}

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
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
