# exclude-node-modules.ps1 — saca node_modules de OneDrive via junction.
#
# PROBLEMA: el repo vive en OneDrive\Escritorio. OneDrive intenta sincronizar
# los ~miles de archivos de node_modules y los BLOQUEA durante el sync →
# `npm install`/`vite build` fallan con EBUSY o ERR_MODULE_NOT_FOUND
# (archivos individuales desaparecen a mitad de operación).
#
# FIX: mover el node_modules REAL a C:\tmp (fuera de OneDrive) y dejar un
# JUNCTION en su lugar. OneDrive omite los reparse points (junctions) → no
# los sincroniza → no los corrompe.
#
# ⚠️ LIMITACIÓN: `npm install` (npm 11) REEMPLAZA el junction por un
# directorio real. Por eso DEBES re-ejecutar este script DESPUÉS de cada
# `npm install` / `npm ci` / actualización de dependencias.
#
#   Uso:  cd frontend ;  pwsh -File scripts\exclude-node-modules.ps1
#
# FIX PERMANENTE (recomendado si te cansas de re-ejecutar): mueve TODO el
# proyecto fuera de OneDrive (ej. C:\dev\MealfitRD.IA). Entonces este script
# ya no hace falta.

$ErrorActionPreference = 'Continue'
$proj   = Split-Path -Parent $PSScriptRoot          # ...\frontend
$nm     = Join-Path $proj 'node_modules'
$target = 'C:\tmp\mealfit_frontend_node_modules'
$empty  = 'C:\tmp\__empty_dir__'

function Test-Junction($p) {
    if (-not (Test-Path $p)) { return $false }
    return (((Get-Item $p -Force).Attributes) -match 'ReparsePoint')
}

if (Test-Junction $nm) {
    Write-Host "node_modules YA es un junction → nada que hacer." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $nm)) {
    Write-Host "No existe node_modules. Corre 'npm install' primero, luego este script." -ForegroundColor Yellow
    exit 1
}

Write-Host "Excluyendo node_modules de OneDrive..." -ForegroundColor Cyan

# 1. Pausar OneDrive + matar procesos que puedan bloquear archivos
Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
foreach ($p in 'esbuild','rollup','node','vitest') {
    Get-Process $p -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# 2. Mover el node_modules real a C:\tmp (limpiando target stale primero)
New-Item -ItemType Directory -Force -Path $empty  | Out-Null
if (Test-Path $target) {
    robocopy $empty $target /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null
    cmd /c rmdir /s /q "$target" 2>&1 | Out-Null
}
Write-Host "  moviendo (robocopy /MOVE, maneja long paths)..."
robocopy $nm $target /MOVE /E /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null

# 3. Purgar cualquier leftover del source y removerlo
robocopy $empty $nm /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null
cmd /c rmdir /s /q "$nm" 2>&1 | Out-Null

# 4. Crear el junction
cmd /c mklink /J "$nm" "$target" | Out-Null

# 5. Reiniciar OneDrive
$od = Get-ChildItem "C:\Program Files\Microsoft OneDrive\OneDrive.exe","$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($od) { Start-Process $od.FullName -ArgumentList "/background" }

if (Test-Junction $nm) {
    Write-Host "OK: node_modules → $target (junction, excluido de OneDrive)." -ForegroundColor Green
    Write-Host "Verifica con: npm run build" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FALLO: no se pudo crear el junction. Revisa locks/permisos." -ForegroundColor Red
    exit 1
}
