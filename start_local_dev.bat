@echo off
title Itinero Local Development (All Services)
echo ====================================================
echo   Starting Itinero Local Environment (3 Services)
echo ====================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Supervisor Backend (Flights, Hotels, Trains, Packages) on Port 8000...
start "Itinero Supervisor (Port 8000)" cmd /k "cd /d "%~dp0" && python -m uvicorn supervisor.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Vero AI Chatbot Agent on Port 8001...
start "Itinero Vero Agent (Port 8001)" cmd /k "cd /d "%~dp0" && python -m uvicorn general_agent.run:app --host 127.0.0.1 --port 8001 --reload"

timeout /t 2 /nobreak >nul

echo [3/3] Starting Frontend Dev Server on Port 5173...
start "Itinero Frontend (Port 5173)" cmd /k "cd /d "%~dp0itinero" && npm run dev"

echo.
echo ====================================================
echo   All 3 services have started in separate windows!
echo   - Supervisor API: http://127.0.0.1:8000/docs
echo   - Vero AI Agent:  http://127.0.0.1:8001
echo   - Frontend App:   http://localhost:5173/itinero/
echo ====================================================
pause
