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

$jsFiles = @(
  'js\core.js', 'js\templates.js', 'js\ui.js', 'js\auth.js', 'js\sync.js', 'js\session.js', 'js\hardening.js', 'js\cpm.js', 'js\baseline.js',
  'js\views\dashboard.js', 'js\views\projects.js', 'js\views\prospects.js',
  'js\views\deletionRequests.js', 'js\views\tasks.js', 'js\views\gantt.js', 'js\views\ganttExport.js',
  'js\views\resources.js', 'js\views\manpower.js', 'js\views\materials.js',
  'js\views\procurement.js', 'js\views\costs.js', 'js\views\qaqc.js',
  'js\views\risks.js', 'js\views\actions.js', 'js\views\library.js',
  'js\views\documents.js', 'js\views\progress.js', 'js\views\kpi.js',
  'js\views\analytics.js',
  'js\views\calendar.js', 'js\views\reports.js', 'js\views\settings.js',
  'js\views\warehouse.js', 'js\views\masterlist.js', 'js\views\trash.js'
)

foreach ($f in $jsFiles) {
  $fwd  = $f -replace '\\', '/'
  $tag  = "<script src=`"src/$fwd`"></script>"
  $code = ReadFile($f)
  $out  = $out.Replace($tag, "<script>`n$code`n</script>")
}

[System.IO.File]::WriteAllText("$base\promaster.html", $out, $enc)

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
