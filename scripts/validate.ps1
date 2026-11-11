$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== JavaScript syntax =="
$jsFiles = @(
  "src/bootstrap.js",
  "src/content/scripts/engines.js",
  "src/content/scripts/dictionary.js",
  "src/content/scripts/preferences.js",
  "src/content/scripts/translate.js"
)
foreach ($file in $jsFiles) {
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Syntax error in $file" }
  Write-Host "  OK $file"
}

Write-Host "== Manifest =="
& node -e @"
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
if (m.manifest_version !== 2) throw new Error('manifest_version must be 2');
const z = m.applications && m.applications.zotero;
if (!z) throw new Error('applications.zotero is required');
if (!z.id) throw new Error('applications.zotero.id is required');
if (!z.update_url) throw new Error('applications.zotero.update_url is required by Zotero 10');
if (!z.strict_max_version) throw new Error('strict_max_version is required by Zotero 10');
if (z.strict_min_version.includes('*')) throw new Error('strict_min_version must not contain *');
console.log('  manifest.json OK');
"@
if ($LASTEXITCODE -ne 0) { throw "Invalid manifest.json" }

Write-Host "== Static smoke test =="
& node "test/smoke.mjs"
if ($LASTEXITCODE -ne 0) { throw "Smoke test failed" }

Write-Host "== Preferences XHTML =="
& python "scripts/validate_xhtml.py" "src/content/preferences.xhtml"
if ($LASTEXITCODE -ne 0) { throw "Invalid preferences.xhtml" }

Write-Host "== Required files =="
$required = @(
  "src/manifest.json",
  "src/bootstrap.js",
  "src/prefs.js",
  "src/content/scripts/translate.js",
  "src/content/scripts/engines.js",
  "src/content/scripts/dictionary.js",
  "src/content/scripts/preferences.js",
  "src/content/styles/translate.css",
  "src/content/styles/preferences.css",
  "src/content/preferences.xhtml",
  "src/content/icons/icon-48.png",
  "src/content/icons/icon-96.png",
  "src/content/icons/icon-128.png"
)
foreach ($file in $required) {
  if (-not (Test-Path $file)) { throw "Missing $file" }
  Write-Host "  OK $file"
}

Write-Host "Validation passed."
