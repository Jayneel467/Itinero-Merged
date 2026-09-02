# Start all 3 Itinero services locally on Windows PowerShell
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Starting Itinero Local Environment (3 Services)  " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

Write-Host "[1/3] Starting Supervisor Backend on Port 8000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Root`"; python -m uvicorn supervisor.main:app --host 127.0.0.1 --port 8000 --reload"

Start-Sleep -Seconds 2

Write-Host "[2/3] Starting Vero Agent on Port 8001..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Root`"; python -m uvicorn general_agent.run:app --host 127.0.0.1 --port 8001 --reload"

Start-Sleep -Seconds 2

Write-Host "[3/3] Starting Frontend Dev Server on Port 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Root\itinero`"; npm run dev"

Write-Host ""
Write-Host "All 3 services launched successfully!" -ForegroundColor Yellow
Write-Host " - Frontend: http://localhost:5173/itinero/"
Write-Host " - Supervisor API: http://127.0.0.1:8000/docs"
Write-Host " - Vero Chatbot: http://127.0.0.1:8001"
