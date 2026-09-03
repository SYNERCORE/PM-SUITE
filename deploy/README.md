# ProMaster Local Server — Deployment & Operations

For the SY3 IT team. This is the runbook for the **live** ProMaster local
server: a LAN-only PostgreSQL + Fastify API that the app talks to alongside
SharePoint. The app keeps working through internet outages because the
server is on your own network and the browser keeps a local copy.

This document reflects the **actual Windows deployment** (`procmaster.synercore.ph`).
It is Windows-first because that is what is running; Linux equivalents are
noted only where useful.

## Architecture

```
   ┌────────────────────┐          ┌────────────────────┐
   │  ProMaster (HTML)  │  ······  │  ProMaster (HTML)  │   users' laptops
   └──────────┬─────────┘          └──────────┬─────────┘
              │ HTTPS on LAN                  │
              ▼                               ▼
   ┌───────────────────────────────────────────────────────┐
   │  procmaster.synercore.ph  (this server)               │
   │   Caddy 2         443 → 3000, internal-CA HTTPS        │
   │   Fastify API     port 3000  (Windows service:         │
   │                                ProMasterAPI via NSSM)  │
   │   PostgreSQL 16   database: proc_master                │
   └──────────────┬────────────────────────────────────────┘
                  │ nightly pg_dump (custom format, 90-day)
                  ▼   → C:\ProcMaster\backup\dumps
                      → optional OneDrive mirror → SharePoint

   Cloud path (unchanged): the app also mirrors every entity to
   SharePoint for external access and disaster recovery.
```

## On-disk layout (this server)

Three directories, kept separate on purpose:

| Path | What it is |
|------|-----------|
| `C:\ProcMaster-Src` | The git clone. **Never served from.** Pull updates here. |
| `C:\ProcMaster` | The flat API runtime — `server.js`, `routes\`, `auth.js`, `db.js`, `Caddyfile`, `backup\`. This is what the service runs. |
| `C:\ProcMaster-Web` | The web root Caddy serves — holds `promaster.html`. |

Database: **`proc_master`** (database and app role), superuser `postgres`.
Migrations run as `postgres` (the app role intentionally lacks DDL rights).

---

## Part A — First-time install (already done; here for rebuilds)

### 1. Stack

Already installed: **Node 20 LTS**, **PostgreSQL 16**, **Caddy 2**, **NSSM**.
To rebuild on a fresh box:

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.16      # interactive — set the postgres password
winget install CaddyServer.Caddy
winget install NSSM.NSSM
```

### 2. Database + schema

Create the database and role, then apply **every** migration in order.
All are idempotent and safe to re-run.

```powershell
cd 'C:\Program Files\PostgreSQL\16\bin'
createdb  -U postgres proc_master
# apply migrations 001 → 008 in order
$src = 'C:\ProcMaster-Src\deploy\sql'
Get-ChildItem $src -Filter '0*.sql' | Sort-Object Name | ForEach-Object {
  Write-Host "Applying $($_.Name)"; psql -U postgres -d proc_master -f $_.FullName
}
```

The migrations, and the schema_version each registers:

| File | Adds | Version |
|------|------|---------|
| `001-init-schema.sql` | users, projects, tasks, resources, warehouse_items… + `set_updated_at()` | 1 |
| `002-phase2-entities.sql` | Phase 2 entity tables | 2 |
| `003-safe-generated-columns.sql` | rebuilds generated columns as IMMUTABLE | 3 |
| `004-phase3-entities.sql` | qaqc, risks, actions, documents, stock_transactions | 4 |
| `005-batch4-cost-chain.sql` | resource_allocations, resource_usage_logs, manpower, procurement_logs, issuance_requests | 5 |
| `006-batch5-inventory-pools.sql` | equipment, tools, vehicles, consumables, materials | 6 |
| `007-batch5-triggers-and-version.sql` | completion patch for an incomplete 006 (triggers + v6) | — |
| `008-batch6-reference-and-logs.sql` | warehouse_locations, progress, kpi_data, calendar, asset_history, asset_utilization, third_party, project_team, trades, business_units, daily_meeting_logs, library_docs | 7 |
| `009-grant-app-privileges.sql` | grants the app role DML on all tables + `ALTER DEFAULT PRIVILEGES` so future tables auto-grant (fixes "permission denied for table …", SQLSTATE 42501) | — |

After applying, confirm: `psql -U postgres -d proc_master -c "SELECT version FROM schema_version ORDER BY version;"` → **1–7**.

> **Why 009 matters:** tables are created by the `postgres` superuser, so they're owned by `postgres` and the app role (`proc_master`) has no rights on them until granted. Batches 1–5 were granted by hand at install; Batch 6 was missed, so those 12 tables returned `permission denied` on every write. `009` grants all existing tables **and** sets default privileges so no future batch can reintroduce this. It changes no schema structure, so it registers no new `schema_version`.

### 3. API runtime + service

The runtime is the **flat** `C:\ProcMaster` (not the repo). Copy the server
files there, install deps, and register the service:

```powershell
# from the repo
Copy-Item -Recurse 'C:\ProcMaster-Src\deploy\server\*' 'C:\ProcMaster\' -Force
cd C:\ProcMaster
npm ci --omit=dev
# .env — DATABASE_URL (proc_master), PORT=3000, Azure AD app/tenant for token check
notepad .env

# register as a Windows service
& "C:\Program Files\nssm\nssm.exe" install ProMasterAPI "C:\Program Files\nodejs\node.exe" "C:\ProcMaster\server.js"
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppDirectory C:\ProcMaster
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppStdout C:\ProcMaster\logs\api.log
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppStderr C:\ProcMaster\logs\err.log
Start-Service ProMasterAPI
```

### 4. Caddy + web root

Caddy serves `C:\ProcMaster-Web` and reverse-proxies `/api` to port 3000.
Set LAN DNS so `procmaster.synercore.ph` resolves to this server's IP.

```powershell
Copy-Item 'C:\ProcMaster-Src\promaster.html' 'C:\ProcMaster-Web\promaster.html' -Force
Copy-Item 'C:\ProcMaster\Caddyfile' 'C:\Program Files\Caddy\Caddyfile' -Force  # if not already in place
Restart-Service caddy
```

### 5. HTTPS trust — REQUIRED for offline to work

Caddy uses its **own internal root CA** for `procmaster.synercore.ph`. Until
that root is trusted on a client PC, the browser shows **"Not secure"** and —
critically — **the service worker (`sw.js`) will not register, so the offline
PWA is broken**. On unstable internet the offline copy is the whole point, so
this step is not optional.

On the **server**, locate Caddy's root certificate (path when Caddy runs as a
SYSTEM service):

```powershell
dir C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\pki\authorities\local\root.crt
```

Copy `root.crt` to each client PC and, as administrator on each:

```powershell
certutil -addstore -f Root root.crt      # Trusted Root Certification Authorities
```

Fully close and reopen the browser afterward. For many machines, push
`root.crt` to the Trusted Root store via **Group Policy** instead of per-PC.

### 6. Firewall

Only **443** should be reachable on the LAN. Do **not** expose 5432 (Postgres)
or 3000 (Node) — Caddy is the only door.

```powershell
New-NetFirewallRule -DisplayName "ProMaster HTTPS" -Direction Inbound `
  -Protocol TCP -LocalPort 443 -RemoteAddress LocalSubnet -Action Allow
```

### 7. Nightly backup

`backup\backup-nightly.ps1` runs `pg_dump` in custom format, keeps **90 days**,
and optionally mirrors to a OneDrive-synced folder (→ SharePoint offsite).

First deploy the backup folder from the repo into the runtime (it is **not**
part of the `deploy\server\*` copy), then write the password file and schedule:

```powershell
# deploy the backup assets into the runtime
New-Item -ItemType Directory -Force 'C:\ProcMaster\backup' | Out-Null
Copy-Item 'C:\ProcMaster-Src\deploy\backup\backup-nightly.ps1' 'C:\ProcMaster\backup\' -Force
Copy-Item 'C:\ProcMaster-Src\deploy\backup\RESTORE.md'        'C:\ProcMaster\backup\' -Force

# one-time: password file the script reads (single line: the postgres password).
# Use WriteAllText — NOT Set-Content or '>' — so the file is clean UTF-8 with no
# BOM and no trailing newline. A BOM/CRLF here surfaces as
# "FATAL: password authentication failed for user postgres" at backup time even
# though the password is correct.
[System.IO.File]::WriteAllText('C:\ProcMaster\backup\.pgpass.txt', '<postgres-password>')

# test
powershell -ExecutionPolicy Bypass -File C:\ProcMaster\backup\backup-nightly.ps1
# schedule nightly at 01:30
schtasks /Create /TN "ProMaster Nightly Backup" /SC DAILY /ST 01:30 /RU SYSTEM `
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProcMaster\backup\backup-nightly.ps1"
```

The script dumps as the **`postgres` superuser** (`$DbUser` in the script), not
the app role `proc_master` — the tables are owned by `postgres`, so only a
superuser dump is guaranteed complete. `proc_master` connecting fine is expected
and is **not** a reason to point the backup at it. If you don't know the
`postgres` password, reset it locally first — see **Recovering a lost `postgres`
password** in Part C.

Confirm a `proc_master-*.dump` appears in `C:\ProcMaster\backup\dumps`. The
optional OneDrive mirror (`$MirrorDir` in the script) writes into a real user's
synced OneDrive — SYSTEM has none of its own, so point it at an account that
stays signed in on the server. **Test a restore once** (see `backup\RESTORE.md`)
— a backup you have never restored is not a backup.

### 8. Smoke test

From any LAN machine:

```
https://procmaster.synercore.ph/health   →   { "status": "ok", "db": "connected", ... }
```

Then in the app: **Settings → SharePoint settings** already defaults the
**Tenant ID** to the SHIC tenant, so SY3 and SHIC accounts both sign in
without an "admin approval" prompt. Point the app at the server via the
**Settings → Local Server** pane and tick the entities to route locally.

---

## Part B — Deploying a new release (the routine you'll run most)

Every ProMaster update lands as a commit on `main`. To roll it out:

```powershell
cd C:\ProcMaster-Src
git pull                                  # note the new commit hash

# 1. Frontend — always
Copy-Item 'C:\ProcMaster-Src\promaster.html' 'C:\ProcMaster-Web\promaster.html' -Force

# 2. Database — ONLY if the release added a new deploy\sql\0NN file
psql -U postgres -d proc_master -f deploy\sql\0NN-*.sql   # idempotent

# 3. API — ONLY if deploy\server\* changed
Copy-Item -Recurse 'C:\ProcMaster-Src\deploy\server\*' 'C:\ProcMaster\' -Force
cd C:\ProcMaster; npm ci --omit=dev
Restart-Service ProMasterAPI
```

Most releases are **frontend-only** (step 1, then users hard-reload). SQL and
service restarts are needed only when a migration or the API code changed —
the release notes will say which. New SQL files print their own
schema_version + trigger check at the end, so the psql output is your
verification.

**Migrating data to the server:** after the schema exists, a user opens
**Settings → Local Server**, ticks the entities, and clicks **Migrate now**
per entity. It upserts by id (safe to re-run), paces at ~120 ms/record to stay
under the rate limit, and reports `migrated/failed`. All 33 business entities
across batches 1–6 are server-backed; deliberately left on
localStorage/SharePoint: notifications, activities, idChangeRequests,
projectIdHistory, deletionRequests, userPerms, workflowDefs.

---

## Part C — Operations

- **Service status / restart:** `Get-Service ProMasterAPI` · `Restart-Service ProMasterAPI`
- **API logs:** `C:\ProcMaster\logs\err.log` and `api.log`
- **DB console:** `psql -U postgres -d proc_master`
- **Schema version:** `psql -U postgres -d proc_master -c "SELECT * FROM schema_version ORDER BY version;"`
- **Emergency rollback of routing:** in the app, **Settings → Force SharePoint Mode** disables all local-server routing instantly (reads/writes go to SharePoint only). Use if the server is down mid-day; untick when it's back.

### Recovering a lost `postgres` password

The app role `proc_master` is used day to day, so its password is known. The
`postgres` **superuser** password is only needed for migrations and the nightly
backup, and can drift out of anyone's memory. If `psql -h localhost -U postgres`
returns `FATAL: password authentication failed`, reset it locally — you do not
need the old password. This is the standard PostgreSQL recovery: switch local
auth to `trust`, reset, switch straight back.

```powershell
# 1 — back up pg_hba.conf, then edit it
$hba = 'C:\Program Files\PostgreSQL\16\data\pg_hba.conf'   # datadir may differ; see the service's -D
Copy-Item $hba "$hba.bak" -Force
notepad $hba
#     on the 127.0.0.1/32 and ::1/128 'host all all' lines, change METHOD
#     scram-sha-256  →  trust   (leave every other line alone)

# 2 — reload, connect with no password, set a NEW alphanumeric-only password
Restart-Service postgresql-x64-16          # confirm name: Get-Service *postgres*
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -h localhost -U postgres -d postgres `
  -c "ALTER USER postgres PASSWORD 'ProMaster2026Backup';"   # no $ ; ' or spaces

# 3 — revert pg_hba.conf immediately (trust = anyone on the box is superuser)
Copy-Item "$hba.bak" $hba -Force
Restart-Service postgresql-x64-16

# 4 — verify over TCP, then re-write the backup password file (WriteAllText, no BOM)
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -h localhost -U postgres -d proc_master -c "SELECT current_user"
[System.IO.File]::WriteAllText('C:\ProcMaster\backup\.pgpass.txt', 'ProMaster2026Backup')
```

Record the new password in the password manager — it is now also the one for
every `psql -U postgres` migration. The app keeps running throughout (it uses
`proc_master`, untouched by this).

### Hardening checklist

- [ ] Windows Update / automatic security updates enabled
- [ ] Postgres `listen_addresses = 'localhost'` (default — keep it)
- [ ] `.env` and `.pgpass.txt` readable only by admins/the service account
- [ ] Nightly backup scheduled **and** one restore tested (`backup\RESTORE.md`)
- [ ] OneDrive mirror confirmed syncing (or an external-drive/network-share copy in place)
- [ ] UPS attached and tested
- [ ] Caddy internal root CA trusted on all client PCs (offline PWA works)
- [ ] Server documented in the CMDB — hostname, IP, purpose, owner
- [ ] RDP restricted to the admin group

## Support

Questions to the ProMaster development team. Before escalating a server
incident, check `C:\ProcMaster\logs\err.log` and
`psql -U postgres -d proc_master -c "SELECT 1"`.
