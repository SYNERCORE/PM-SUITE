# ── ProMaster nightly backup ──────────────────────────────────
# Dumps the proc_master database, keeps 90 days of backups, and
# optionally mirrors to a second folder (point $MirrorDir at a
# OneDrive/SharePoint-synced folder to get offsite copies for free).
#
# Install (run once as admin on the server):
#   schtasks /Create /TN "ProMaster Nightly Backup" /SC DAILY /ST 01:30 /RU SYSTEM ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProcMaster\backup\backup-nightly.ps1"
#
# Test manually:
#   powershell -ExecutionPolicy Bypass -File backup-nightly.ps1

$ErrorActionPreference = 'Stop'

# ── Config ────────────────────────────────────────────────────
$PgBin       = 'C:\Program Files\PostgreSQL\16\bin'
$DbName      = 'proc_master'
$DbUser      = 'postgres'          # superuser avoids permission surprises
$PasswordFile= 'C:\ProcMaster\backup\.pgpass.txt'  # single line: the postgres password
$BackupDir   = 'C:\ProcMaster\backup\dumps'
$MirrorDir   = ''                  # optional: 'C:\Users\svc\OneDrive - SY3\ProMasterBackups'
$RetainDays  = 90
$LogFile     = 'C:\ProcMaster\backup\backup.log'

function Log($msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

try {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

  if (Test-Path $PasswordFile) {
    $env:PGPASSWORD = (Get-Content $PasswordFile -TotalCount 1).Trim()
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $file  = Join-Path $BackupDir "proc_master-$stamp.dump"

  # Custom format (-Fc): compressed, restorable table-by-table with pg_restore
  & "$PgBin\pg_dump.exe" -U $DbUser -d $DbName -Fc -f $file
  if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }

  $sizeMB = [Math]::Round((Get-Item $file).Length / 1MB, 2)
  Log "OK dump $file ($sizeMB MB)"

  # ── Retention: delete dumps older than $RetainDays ──
  $cutoff = (Get-Date).AddDays(-$RetainDays)
  Get-ChildItem $BackupDir -Filter 'proc_master-*.dump' |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object { Log "Pruning $($_.Name)"; Remove-Item $_.FullName -Force }

  # ── Optional mirror (OneDrive-synced folder → lands in SharePoint) ──
  if ($MirrorDir -and (Test-Path (Split-Path $MirrorDir -Parent))) {
    New-Item -ItemType Directory -Force -Path $MirrorDir | Out-Null
    Copy-Item $file $MirrorDir -Force
    # Apply the same retention to the mirror
    Get-ChildItem $MirrorDir -Filter 'proc_master-*.dump' |
      Where-Object { $_.LastWriteTime -lt $cutoff } |
      ForEach-Object { Remove-Item $_.FullName -Force }
    Log "Mirrored to $MirrorDir"
  }
} catch {
  Log "FAILED: $_"
  exit 1
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
