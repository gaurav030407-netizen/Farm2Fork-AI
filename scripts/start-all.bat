@echo off
echo ======================================================================
echo    Farm2Fork - Complete Local Stack Launcher
echo ======================================================================
echo.
echo Starting all Farm2Fork services:
echo   1. Express API Server    : http://localhost:3000
echo   2. Python FastAPI AI     : http://localhost:8000
echo   3. React Frontend Web UI : http://localhost:5000
echo.
echo Opening browser at http://localhost:5000 in 5 seconds...
start "" http://localhost:5000
node scripts/dev-all.mjs
