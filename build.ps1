# ── SHIC Build Script ─────────────────────────────────────────
# Combines all src/ files into a single promaster.html
# Double-click to run, OR right-click → "Run with PowerShell"
# No Node.js or installs required.
# ──────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
trap {
  Write-Host ""
  Write-Host "ERROR: $_" -ForegroundColor Red
  Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Press any key to close..." -ForegroundColor Gray
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 1
}

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = "$base\src"
$enc  = [System.Text.UTF8Encoding]::new($false)

function ReadFile($rel) {
  [System.IO.File]::ReadAllText("$src\$rel", $enc)
}

Write-Host "Building promaster.html..." -ForegroundColor Cyan

$idx = ReadFile('index.html')
$css = ReadFile('css\main.css')
$out = $idx.Replace('<link rel="stylesheet" href="src/css/main.css">', "<style>`n$css`n</style>")

# Bundle order comes from src\bundle.json — single source of truth
# shared with build.js. Add new modules there, not here.
$bundleJson = [System.IO.File]::ReadAllText("$src\bundle.json", $enc)
$jsFiles = @(($bundleJson | ConvertFrom-Json).js | ForEach-Object { $_ -replace '/', '\' })

foreach ($f in $jsFiles) {
  $fwd  = $f -replace '\\', '/'
  $tag  = "<script src=`"src/$fwd`"></script>"
  $code = ReadFile($f)
  $out  = $out.Replace($tag, "<script>`n$code`n</script>")
}

[System.IO.File]::WriteAllText("$base\promaster.html", $out, $enc)

# -- Auto-generate version.json from APP_VERSION / APP_CHANGELOG in core.js --
$coreJs = ReadFile('js\core.js')
$ver  = if ($coreJs -match "APP_VERSION='([^']+)'")   { $Matches[1] } else { '0.0.0' }
$note = if ($coreJs -match "APP_RELEASE_NOTE='([^']+)'") { $Matches[1] } else { '' }
$verJson = '{"version":"' + $ver + '","note":"' + ($note -replace '"','\"') + '","released":"' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '"}'
[System.IO.File]::WriteAllText("$base\version.json", $verJson, $enc)
Write-Host "  version.json -> v$ver" -ForegroundColor Cyan

$size  = [Math]::Round((Get-Item "$base\promaster.html").Length / 1MB, 2)
$lines = ([System.IO.File]::ReadAllLines("$base\promaster.html", $enc)).Count

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "  File : promaster.html"
Write-Host "  Size : $size MB"
Write-Host "  Lines: $lines"
Write-Host ""
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
