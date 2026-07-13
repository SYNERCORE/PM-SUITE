# ProMaster nightly backup — Windows.
# Schedule via Task Scheduler to run daily at 02:00 as SYSTEM:
#   schtasks /Create /SC DAILY /TN "ProMaster Backup" /TR ^
#     "powershell -ExecutionPolicy Bypass -File C:\procmaster\scripts\backup.ps1" ^
#     /ST 02:00 /RU SYSTEM

$ErrorActionPreference = 'Stop'

$BackupRoot = $env:BACKUP_ROOT; if (-not $BackupRoot) { $BackupRoot = 'D:\backup\procmaster' }
$KeepDays   = if ($env:KEEP_DAYS) { [int]$env:KEEP_DAYS } else { 30 }
$DbName     = if ($env:DB_NAME) { $env:DB_NAME } else { 'procmaster' }
$DbUser     = if ($env:DB_USER) { $env:DB_USER } else { 'procmaster' }
$PgBin      = if ($env:PG_BIN)  { $env:PG_BIN }  else { 'C:\Program Files\PostgreSQL\16\bin' }

$Stamp   = (Get-Date -Format 'yyyy-MM-dd_HHmm')
$OutDir  = Join-Path $BackupRoot $Stamp
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# 1. Database dump (custom format)
& "$PgBin\pg_dump.exe" `
    --host=localhost `
    --username=$DbUser `
    --dbname=$DbName `
    --format=custom `
    --file="$OutDir\procmaster.dump"

# 2. Config snapshots — copy silently, don't fail if any file's missing
foreach ($src in @(
  'C:\Program Files\Caddy\Caddyfile',
  'C:\procmaster\.env'
)) {
  if (Test-Path $src) { Copy-Item $src -Destination $OutDir }
}

# 3. Checksum manifest
Get-ChildItem $OutDir -File | ForEach-Object {
  $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
  "$h  $($_.Name)"
} | Set-Content -Path (Join-Path $OutDir 'SHA256SUMS') -Encoding utf8

# 4. Rotate
Get-ChildItem $BackupRoot -Directory | Where-Object {
  $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' -and
  $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays)
} | Remove-Item -Recurse -Force

$size = (Get-ChildItem $OutDir -Recurse | Measure-Object Length -Sum).Sum
"$Stamp -> $OutDir  ($([Math]::Round($size/1MB,1)) MB)" | Write-Host
