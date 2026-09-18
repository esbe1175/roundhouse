$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'resources/mpv-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'The pinned MPV checksum is missing or invalid.' }
$cache = Join-Path $root '.cache'
$destination = Join-Path $root 'resources/mpv'
New-Item -ItemType Directory -Force -Path $cache,$destination | Out-Null
$archive = Join-Path $cache ('mpv-' + $manifest.release + '.7z')
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $manifest.url -OutFile $archive }
$stream = [System.IO.File]::OpenRead($archive)
$hasher = [System.Security.Cryptography.SHA256]::Create()
try { $actualHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $hasher.Dispose() }
if ($actualHash -ne $manifest.sha256) { throw 'MPV checksum mismatch. Remove the cached archive and retry.' }
$sevenZip = Join-Path $root 'node_modules/7zip-bin/win/x64/7za.exe'
if (-not (Test-Path -LiteralPath $sevenZip)) { throw 'Run npm ci first to install the archive extractor.' }
& $sevenZip x $archive ('-o' + $destination) -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'MPV extraction failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $destination 'mpv.exe'))) { throw 'Archive did not contain mpv.exe at the expected location.' }
Write-Output ('MPV ready: ' + $manifest.release + ' (SHA-256 verified)')
