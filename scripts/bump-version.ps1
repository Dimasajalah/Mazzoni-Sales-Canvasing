<#
.SYNOPSIS
  Naikkan VERSION lalu backup source versi lama, siap untuk update baru.

.PARAMETER Part
  major | minor | patch (default: patch)

.EXAMPLE
  .\scripts\bump-version.ps1 -Part patch -Message "Perbaikan check-in GPS"
#>
param(
    [ValidateSet("major", "minor", "patch")]
    [string]$Part = "patch",
    [string]$Message = "",
    [string]$BackupRoot = "C:\cursor\project\mazzoni\backups"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $ProjectRoot "VERSION"
$changelog = Join-Path $ProjectRoot "CHANGELOG.md"
$frontendPkg = Join-Path $ProjectRoot "frontend\package.json"
$backupScript = Join-Path $PSScriptRoot "backup-version.ps1"

if (-not (Test-Path $versionFile)) { throw "VERSION tidak ada." }

$old = (Get-Content $versionFile -Raw).Trim()
$seg = $old.Split(".")
if ($seg.Count -ne 3) { throw "VERSION harus semver x.y.z (sekarang: $old)" }
$a = [int]$seg[0]; $b = [int]$seg[1]; $c = [int]$seg[2]

switch ($Part) {
    "major" { $a++; $b = 0; $c = 0 }
    "minor" { $b++; $c = 0 }
    "patch" { $c++ }
}
$new = "$a.$b.$c"

Write-Host "1) Backup source versi lama $old ..."
& $backupScript -Version $old -BackupRoot $BackupRoot

Write-Host "2) Update VERSION -> $new"
[System.IO.File]::WriteAllText($versionFile, $new + "`n")

if (Test-Path $frontendPkg) {
    $raw = Get-Content $frontendPkg -Raw
    $raw = $raw -replace '"version"\s*:\s*"[^"]+"', ('"version": "' + $new + '"')
    [System.IO.File]::WriteAllText($frontendPkg, $raw)
}

$today = Get-Date -Format "yyyy-MM-dd"
$msg = if ($Message) { $Message } else { "Update aplikasi" }
$entry = @"

## [$new] - $today

### Changed
- $msg

"@

if (Test-Path $changelog) {
    $cl = Get-Content $changelog -Raw
    $marker = "`r`n## ["
    $idx = $cl.IndexOf("## [")
    if ($idx -ge 0) {
        $cl = $cl.Substring(0, $idx) + $entry.TrimStart() + $cl.Substring($idx)
    } else {
        $cl = $cl + $entry
    }
    [System.IO.File]::WriteAllText($changelog, $cl)
}

Write-Host "OK - sekarang working copy = v$new"
Write-Host "    Source lama $old sudah di-backup."
Write-Host "    Lanjut coding update di project ini."
