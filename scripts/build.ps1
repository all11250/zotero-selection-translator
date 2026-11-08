$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\validate.ps1"
if ($LASTEXITCODE -ne 0) { throw "Validation failed" }

$manifestText = [System.IO.File]::ReadAllText((Join-Path $root "src\manifest.json"), [System.Text.Encoding]::UTF8)
$manifest = $manifestText | ConvertFrom-Json
$version = $manifest.version
$stage = Join-Path $root "build\staging"
$dist = Join-Path $root "dist"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item "src\*" $stage -Recurse -Force
Get-ChildItem $stage -Recurse -File | ForEach-Object {
  Write-Host "  + $($_.FullName.Substring($stage.Length + 1))"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$xpi = Join-Path $dist "zotero-selection-translator-$version.xpi"
if (Test-Path $xpi) { Remove-Item $xpi -Force }
$zip = [System.IO.Compression.ZipFile]::Open($xpi, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  # nsJAR (the jar: protocol used by Services.scriptloader on some Gecko
  # builds) needs directory entries to traverse nested paths. Create those
  # explicitly, then add every file with forward-slash names.
  Get-ChildItem $stage -Recurse -Directory | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1).Replace("\", "/") + "/"
    $zip.CreateEntry($rel) | Out-Null
  }
  Get-ChildItem $stage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $_.FullName,
      $rel,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}
finally {
  $zip.Dispose()
}
Copy-Item $xpi (Join-Path $dist "zotero-selection-translator.xpi") -Force

# Sanity-check the archive itself: Zotero must find manifest.json and the
# main scripts at the XPI root, and nsJAR benefits from explicit directory
# entries for nested paths.
$checkZip = [System.IO.Compression.ZipFile]::OpenRead($xpi)
try {
  $names = @($checkZip.Entries | ForEach-Object { $_.FullName })
  foreach ($requiredEntry in @(
    "manifest.json",
    "bootstrap.js",
    "prefs.js",
    "content/scripts/engines.js",
    "content/scripts/translate.js",
    "content/preferences.xhtml",
    "content/"
  )) {
    if ($names -notcontains $requiredEntry) {
      throw "XPI missing entry: $requiredEntry"
    }
  }
}
finally {
  $checkZip.Dispose()
}

$hash = Get-FileHash $xpi -Algorithm SHA256
$hashLine = "$($hash.Hash.ToLower())  zotero-selection-translator-$version.xpi"
Set-Content -Path (Join-Path $dist "SHA256SUMS.txt") -Value $hashLine -Encoding ASCII

Write-Host ""
Write-Host "Built: $xpi"
Write-Host "SHA256: $($hash.Hash.ToLower())"
Write-Host "Latest copy: $(Join-Path $dist 'zotero-selection-translator.xpi')"
