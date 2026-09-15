<#
.SYNOPSIS
  Backup source Sales Canvassing ke folder lain berdasarkan VERSION.

.DESCRIPTION
  Menyalin source (tanpa node_modules/vendor/.env/dist) ke:
    <BackupRoot>\sales_canvassing\v{VERSION}_{yyyyMMdd_HHmmss}\

  Default BackupRoot: C:\cursor\project\mazzoni\backups

.PARAMETER Version
  Override versi (default baca file VERSION di root project).

.PARAMETER BackupRoot
  Folder induk backup.

.EXAMPLE
  .\scripts\backup-version.ps1
  .\scripts\backup-version.ps1 -Version 1.0.0
#>
param(
    [string]$Version = "",
    [string]$BackupRoot = "C:\cursor\project\mazzoni\backups"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$versionFile = Join-Path $ProjectRoot "VERSION"
if (-not $Version) {
    if (-not (Test-Path $versionFile)) { throw "File VERSION tidak ditemukan: $versionFile" }
    $Version = (Get-Content $versionFile -Raw).Trim()
}
if (-not $Version) { throw "VERSION kosong." }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destName = "v$Version" + "_$stamp"
$destDir = Join-Path $BackupRoot "sales_canvassing\$destName"

Write-Host "Project : $ProjectRoot"
Write-Host "Version : $Version"
Write-Host "Backup  : $destDir"

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$robocopyArgs = @(
    $ProjectRoot,
    $destDir,
    "/E",
    "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
    "/XD", "node_modules", "vendor", "dist", ".git",
    "/XF", ".env", ".env.local", "database.sqlite"
)
& robocopy @robocopyArgs | Out-Null
$code = $LASTEXITCODE
if ($code -ge 8) { throw "Robocopy gagal (exit $code)." }

$meta = @(
    "version=$Version",
    "backed_up_at=$stamp",
    "source=$ProjectRoot"
) -join "`r`n"
Set-Content -Path (Join-Path $destDir "BACKUP_INFO.txt") -Value $meta -Encoding UTF8

if (Test-Path $versionFile) {
    Copy-Item $versionFile (Join-Path $destDir "VERSION") -Force
}

Write-Host "OK - backup tersimpan di:"
Write-Host "  $destDir"
Write-Host "Gunakan folder ini sebagai source lama jika perlu rollback."
