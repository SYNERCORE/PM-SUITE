# Register the ProMaster API as a Windows service via NSSM.
# Run as Administrator from C:\procmaster.
#
# Prerequisites installed:
#   winget install OpenJS.NodeJS.LTS
#   winget install NSSM.NSSM

$ErrorActionPreference = 'Stop'

$ServiceName = 'ProMasterAPI'
$AppDir      = 'C:\procmaster'
$NodeExe     = (Get-Command node).Source
$NssmExe     = (Get-Command nssm -ErrorAction SilentlyContinue)?.Source
if (-not $NssmExe) { $NssmExe = 'C:\Program Files\nssm\win64\nssm.exe' }

if (-not (Test-Path $NssmExe)) {
    throw "NSSM not found at $NssmExe. Install with: winget install NSSM.NSSM"
}
if (-not (Test-Path $AppDir)) {
    throw "App folder $AppDir does not exist. Copy deploy\server\* there first."
}

# Log folder
New-Item -ItemType Directory -Force "$AppDir\logs" | Out-Null

# Stop and remove any existing install so we can rerun this script
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    & $NssmExe remove $ServiceName confirm
}

& $NssmExe install $ServiceName $NodeExe "$AppDir\server.js"
& $NssmExe set $ServiceName AppDirectory       $AppDir
& $NssmExe set $ServiceName AppStdout          "$AppDir\logs\api.log"
& $NssmExe set $ServiceName AppStderr          "$AppDir\logs\err.log"
& $NssmExe set $ServiceName AppRotateFiles     1
& $NssmExe set $ServiceName AppRotateBytes     50000000
& $NssmExe set $ServiceName AppExit Default    Restart
& $NssmExe set $ServiceName Start              SERVICE_AUTO_START
& $NssmExe set $ServiceName Description        "ProMaster local API server (Node/Fastify)"

Start-Service $ServiceName
Get-Service $ServiceName | Format-List Name, Status, StartType

Write-Host "ProMaster API installed and started." -ForegroundColor Green
Write-Host "Test:  curl http://localhost:3000/health"
