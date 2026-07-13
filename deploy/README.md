# ProMaster Local Server — Deployment Package

For the SY3 IT team. This package sets up a local (LAN) database and API
server that ProMaster will talk to alongside SharePoint. The app keeps
working through internet outages because the local server is on your own
network.

## Architecture in one picture

```
   ┌────────────────────┐          ┌────────────────────┐
   │  ProMaster (HTML)  │          │  ProMaster (HTML)  │
   │  on user's laptop  │  ······  │  on user's laptop  │
   └──────────┬─────────┘          └──────────┬─────────┘
              │ HTTPS on LAN                  │
              ▼                               ▼
        ┌────────────────────────────────────────────┐
        │  procmaster.local  (this deployment)       │
        │  ┌──────────────────────────────────────┐  │
        │  │ Caddy 2 (443 → 3000, auto-HTTPS)     │  │
        │  └──────────────────────────────────────┘  │
        │  ┌──────────────────────────────────────┐  │
        │  │ Node 20 + Fastify API (port 3000)    │  │
        │  └──────────────────────────────────────┘  │
        │  ┌──────────────────────────────────────┐  │
        │  │ PostgreSQL 16                        │  │
        │  └──────────────────────────────────────┘  │
        └──────────────┬─────────────────────────────┘
                       │ nightly pg_dump
                       ▼
              ┌────────────────────┐
              │  Azure Blob backup │
              │  (or external HDD) │
              └────────────────────┘

   Cloud path (unchanged): app also syncs to SharePoint for
   external access and disaster recovery.
```

## What IT needs to do — checklist

- [ ] **1.** Provision a machine (specs below)
- [ ] **2.** Install OS + Node.js + PostgreSQL + Caddy
- [ ] **3.** Import the initial schema (`sql/001-init-schema.sql`)
- [ ] **4.** Configure `.env` for the API server
- [ ] **5.** Register the API as a service (systemd or Windows Service)
- [ ] **6.** Configure Caddy with the internal hostname and cert
- [ ] **7.** Open port 443 on the LAN firewall — nothing else
- [ ] **8.** Schedule the nightly backup
- [ ] **9.** Smoke-test from a user machine
- [ ] **10.** Hand the URL and one test credential back to the ProMaster team

Each of these has a section below.

---

## 1. Machine specs

Minimum: **4-core CPU · 16 GB RAM · 500 GB SSD · Gigabit NIC · UPS**.

Either physical box in the server room or a VM on your existing
hypervisor is fine. If you have to pick between the two, prefer
a dedicated VM — snapshots make disaster recovery trivial.

**OS choice:**
- **Recommended:** Ubuntu Server 24.04 LTS. Cleaner service model
  (systemd), zero-touch security updates, `apt` package manager.
- **Alternative:** Windows Server 2022 if that's what your IT team
  runs. All commands in this guide have a Windows equivalent.

## 2. Install the stack

### Ubuntu 24.04 LTS

```bash
# Base
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ufw fail2ban unattended-upgrades

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib

# Caddy 2 (reverse proxy with automatic HTTPS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Verify
node --version    # v20.x
psql --version    # psql (PostgreSQL) 16.x
caddy version     # v2.x
```

### Windows Server 2022

```powershell
# Install Node 20 LTS
winget install OpenJS.NodeJS.LTS

# Install PostgreSQL 16 (interactive installer — set superuser password)
winget install PostgreSQL.PostgreSQL.16

# Install Caddy
winget install CaddyServer.Caddy

# Install NSSM (for running Node as a Windows Service)
winget install NSSM.NSSM
```

## 3. Create the database and schema

```bash
# Ubuntu
sudo -u postgres createuser --pwprompt procmaster       # set a strong password
sudo -u postgres createdb --owner=procmaster procmaster
sudo -u postgres psql -d procmaster -f sql/001-init-schema.sql
```

```powershell
# Windows — from the PostgreSQL bin folder
createuser -U postgres --pwprompt procmaster
createdb -U postgres --owner=procmaster procmaster
psql -U postgres -d procmaster -f sql\001-init-schema.sql
```

Save the password you set — it goes into `server/.env` next.

## 4. Install the API server

```bash
# Ubuntu — install to /opt/procmaster
sudo mkdir -p /opt/procmaster
sudo cp -r server/* /opt/procmaster/
cd /opt/procmaster
sudo cp .env.example .env
sudo nano .env                    # set DATABASE_URL and TENANT_ID
sudo npm ci --omit=dev
sudo useradd -r -s /usr/sbin/nologin procmaster
sudo chown -R procmaster:procmaster /opt/procmaster
```

```powershell
# Windows — install to C:\procmaster
New-Item -ItemType Directory C:\procmaster -Force | Out-Null
Copy-Item -Recurse server\* C:\procmaster\
cd C:\procmaster
Copy-Item .env.example .env
notepad .env                       # set DATABASE_URL and TENANT_ID
npm ci --omit=dev
```

**Test it starts:** `node server.js` should print
`ProMaster API listening on 3000`. Ctrl-C to stop, then register
as a service in step 5.

## 5. Register as a service

### Ubuntu (systemd)

```bash
sudo cp config/procmaster-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now procmaster-api
sudo systemctl status procmaster-api
```

### Windows (NSSM)

```powershell
# From C:\procmaster
& "C:\Program Files\nssm\nssm.exe" install ProMasterAPI `
  "C:\Program Files\nodejs\node.exe" `
  "C:\procmaster\server.js"
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppDirectory C:\procmaster
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppStdout C:\procmaster\logs\api.log
& "C:\Program Files\nssm\nssm.exe" set ProMasterAPI AppStderr C:\procmaster\logs\err.log
Start-Service ProMasterAPI
```

## 6. Caddy reverse proxy

Set the hostname on your LAN DNS (or `/etc/hosts` on each client) so
`procmaster.local` resolves to this server's IP.

For internal-only HTTPS Caddy uses its own root CA — install it on
each client machine (Caddy prints where to find it on first boot).
For a real cert, if this box is reachable from the internet, drop
in a real domain name and Caddy will get one from Let's Encrypt
automatically.

```bash
# Ubuntu
sudo cp config/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

```powershell
# Windows
Copy-Item config\Caddyfile 'C:\Program Files\Caddy\Caddyfile'
Restart-Service caddy
```

## 7. Firewall

Only port 443 should be reachable from the LAN. Everything else stays
closed. Do **not** expose port 5432 (Postgres) or 3000 (Node) to the
network — Caddy is the only door.

```bash
# Ubuntu — ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 443    # adjust CIDR to your LAN
sudo ufw allow OpenSSH                                # keep SSH open
sudo ufw enable
```

```powershell
# Windows Server
New-NetFirewallRule -DisplayName "ProMaster HTTPS" -Direction Inbound `
  -Protocol TCP -LocalPort 443 -RemoteAddress LocalSubnet -Action Allow
```

## 8. Nightly backup

Encrypted `pg_dump` to a mounted external drive or Azure Blob.

- Linux: `scripts/backup.sh` + cron entry inside the script header
- Windows: `scripts\backup.ps1` + Task Scheduler entry

Both keep 30 daily rotations by default. Test the restore path once
before you consider this done — a backup you've never restored isn't
a backup.

## 9. Smoke test

From any user's machine on the LAN:

```
https://procmaster.local/health
```

Expected response:
```json
{ "status": "ok", "db": "connected", "version": "0.1.0" }
```

If that works, you're done. Hand the URL to the ProMaster team and
they'll point the app at it via the Settings → Local Server pane.

## 10. Hardening checklist (post-install)

- [ ] Automatic security updates enabled (unattended-upgrades / Windows Update)
- [ ] Postgres `listen_addresses = 'localhost'` in `postgresql.conf` (default; don't change)
- [ ] `.env` file mode 600, owned by the service user
- [ ] Backup drive mounted read/write only during the backup window
- [ ] Log rotation configured (`journalctl --vacuum-time=90d` or logrotate)
- [ ] UPS attached, tested
- [ ] Machine documented in your CMDB with hostname, IP, purpose, owner
- [ ] SSH key-only auth (Linux); RDP restricted to admin group (Windows)

## Support

Questions to the ProMaster development team. Server-side incidents
during business hours: check `journalctl -u procmaster-api -n 100`
(Linux) or `C:\procmaster\logs\err.log` (Windows) before escalating.
