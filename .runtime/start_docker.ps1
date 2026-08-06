$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$dataRoot = Join-Path $backendRoot 'data'
$databaseTarget = Join-Path $dataRoot 'pvc_requests.db'
$uploadsTarget = Join-Path $dataRoot 'uploads'

Set-Location -LiteralPath $projectRoot

docker version --format '{{.Server.Version}}' | Out-Null

if (-not (Test-Path -LiteralPath $dataRoot)) {
    New-Item -ItemType Directory -Path $dataRoot | Out-Null
}

$legacyDatabase = Join-Path $backendRoot 'pvc_requests.db'
if (-not (Test-Path -LiteralPath $databaseTarget) -and (Test-Path -LiteralPath $legacyDatabase)) {
    Copy-Item -LiteralPath $legacyDatabase -Destination $databaseTarget
}

$legacyUploads = Join-Path $backendRoot 'uploads'
if (-not (Test-Path -LiteralPath $uploadsTarget)) {
    if (Test-Path -LiteralPath $legacyUploads) {
        Copy-Item -LiteralPath $legacyUploads -Destination $uploadsTarget -Recurse
    } else {
        New-Item -ItemType Directory -Path $uploadsTarget | Out-Null
    }
}

docker compose up -d --build
docker compose ps

Write-Host ''
Write-Host 'Müşteri ekranı:  http://127.0.0.1:4200/'
Write-Host 'Yönetici girişi: http://127.0.0.1:4200/admin/giris'

