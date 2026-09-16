@echo off
echo ==================================================
echo   Farm2Fork Local Ollama AI Setup (100% Free)
echo ==================================================
echo.

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [1/3] Installing Ollama via winget...
    winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
    echo Please reopen this terminal after installation completes.
    pause
    exit /b
)

echo [1/3] Pulling llama3.2 base model...
ollama pull llama3.2

echo [2/3] Building custom 'farm2fork' domain model...
ollama create farm2fork -f Modelfile

echo [3/3] Testing custom 'farm2fork' model...
ollama run farm2fork "What is Farm2Fork?"

echo.
echo ==================================================
echo   Farm2Fork Local AI Model is Ready!
echo ==================================================
pause
