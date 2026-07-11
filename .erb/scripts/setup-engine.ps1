# 從官方 release 下載 assets/engine (steamcmd、伺服器模板、圖示等)。
# 這些資產被上游 .gitignore 排除,只隨安裝版釋出 —
# 從原始碼建置前必須先執行本腳本 (npm run setup:engine)。
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$engineDir = Join-Path $root 'assets\engine'

if (Test-Path (Join-Path $engineDir 'engine.config.json')) {
  Write-Host 'assets/engine already present - nothing to do.'
  exit 0
}

# 優先查最新 release,API 失敗時退回固定的 1.1.0 連結
$url = 'https://github.com/Dalufishe/palserver-GUI/releases/download/1.1.0/unpack-1.1.0-palserver-gui.zip'
try {
  $assets = (Invoke-RestMethod -Uri 'https://api.github.com/repos/Dalufishe/palserver-GUI/releases/latest').assets
  $unpack = $assets | Where-Object name -like 'unpack*' | Select-Object -First 1
  if ($unpack) { $url = $unpack.browser_download_url }
} catch {
  Write-Host 'GitHub API unavailable, using pinned 1.1.0 URL.'
}

$zip = Join-Path $env:TEMP 'palserver-gui-unpack.zip'
Write-Host "Downloading engine assets (~240 MB) from:`n  $url"
curl.exe -L -o $zip $url --silent --show-error
if ($LASTEXITCODE -ne 0) { throw 'download failed' }

Write-Host 'Extracting assets/engine ...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
  $marker = '/resources/assets/engine/'
  $prefixEntry = $archive.Entries |
    Where-Object { $_.FullName -like "*$marker*" } |
    Select-Object -First 1
  if (-not $prefixEntry) { throw 'engine assets not found inside the zip' }
  $prefix = $prefixEntry.FullName.Substring(0, $prefixEntry.FullName.IndexOf($marker)) + $marker

  foreach ($entry in $archive.Entries) {
    if (-not $entry.FullName.StartsWith($prefix)) { continue }
    $rel = $entry.FullName.Substring($prefix.Length)
    if ($rel -eq '') { continue }
    $dest = Join-Path $engineDir ($rel -replace '/', '\')
    if ($entry.FullName.EndsWith('/')) {
      New-Item -ItemType Directory -Force $dest | Out-Null
    } else {
      New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
    }
  }
} finally {
  $archive.Dispose()
}
Remove-Item $zip -Force
Write-Host 'Done. assets/engine is ready.'
