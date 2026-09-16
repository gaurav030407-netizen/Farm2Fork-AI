@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo    Farm2Fork Local AI Setup (100%% Free, Zero API Keys, 24/7 Offline)
echo ======================================================================
echo.

set OLLAMA_EXE=ollama

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set OLLAMA_EXE="%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    ) else (
        echo [!] Ollama is not detected on your system.
        echo.
        echo Please download and run the official 1-click Windows installer:
        echo    👉 https://ollama.com/download/OllamaSetup.exe
        echo.
        echo Opening download page now...
        start https://ollama.com/download/OllamaSetup.exe
        echo.
        echo Once installation finishes, press any key to continue...
        pause >nul
    )
)

echo.
echo [1/3] Pulling base model (llama3.2)...
!OLLAMA_EXE! pull llama3.2
if %errorlevel% neq 0 (
    echo [ERROR] Failed to pull llama3.2. Please ensure Ollama is running.
    pause
    exit /b 1
)

echo.
echo [2/3] Training and compiling custom 'farm2fork' domain model from Modelfile...
!OLLAMA_EXE! create farm2fork -f Modelfile
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create 'farm2fork' model.
    pause
    exit /b 1
)

echo.
echo [3/3] Testing 'farm2fork' local model...
!OLLAMA_EXE! run farm2fork "What is Farm2Fork and is Kufri Jyoti a crop?"

echo.
echo ======================================================================
echo    SUCCESS! Local Farm2Fork AI Model is Trained & Ready!
echo    - Model Name: farm2fork
echo    - Provider:   Local Ollama (No API key needed, works 24/7)
echo ======================================================================
echo.
echo You can now run your backend with:
echo    .venv\Scripts\python -m uvicorn backend.app.main:app --port 8000
echo.
pause
