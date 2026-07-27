# Start supervisor + note web command (Windows PowerShell)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Installing supervisor deps (quiet)..."
pip install -q -r supervisor/requirements.txt

Write-Host "Starting supervisor on :8000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Root`"; uvicorn supervisor.main:app --reload --port 8000"

Start-Sleep -Seconds 2
Write-Host "Starting itinero-web on :3000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Root\itinero-web`"; if (-not (Test-Path node_modules)) { npm install }; npm run dev"

Write-Host ""
Write-Host "Gateway: http://127.0.0.1:8000/api/health"
Write-Host "Web:     http://localhost:3000"
Write-Host "Manual:  http://localhost:3000/book"
Write-Host "AI:      http://localhost:3000/ai"
