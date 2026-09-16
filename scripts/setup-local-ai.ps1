# Farm2Fork Local AI Setup Script (100% Free, Zero API Keys, 24/7 Offline)
# Trains and compiles the custom 'farm2fork' Ollama domain model.

Write-Host "======================================================================" -ForegroundColor Green
Write-Host "   Farm2Fork Local AI Setup (100% Free, Zero API Keys, 24/7 Offline)  " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green

# 1. Locate Ollama
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    $userOllama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $userOllama) {
        $ollamaPath = $userOllama
    } else {
        Write-Host "`n[!] Ollama was not detected on your system." -ForegroundColor Yellow
        Write-Host "    Downloading official 1-click Windows installer from ollama.com..." -ForegroundColor Cyan
        Start-Process "https://ollama.com/download/OllamaSetup.exe"
        Write-Host "`nOnce the OllamaSetup finishes, press any key to continue..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        $ollamaPath = "ollama"
    }
} else {
    $ollamaPath = "ollama"
}

# 2. Pull base model
Write-Host "`n[1/3] Pulling base model (llama3.2)..." -ForegroundColor Yellow
& $ollamaPath pull llama3.2

# 3. Create custom Farm2Fork model from Modelfile
Write-Host "`n[2/3] Training and building custom 'farm2fork' domain model..." -ForegroundColor Yellow
& $ollamaPath create farm2fork -f Modelfile

# 4. Update backend/.env
Write-Host "`n[3/3] Verifying backend environment..." -ForegroundColor Yellow
$envPath = "backend/.env"
if (Test-Path $envPath) {
    $content = Get-Content $envPath -Raw
    if ($content -match "AI_PROVIDER=") {
        $content = $content -replace "AI_PROVIDER=.*", "AI_PROVIDER=ollama"
    } else {
        $content += "`nAI_PROVIDER=ollama"
    }
    if ($content -match "OLLAMA_MODEL=") {
        $content = $content -replace "OLLAMA_MODEL=.*", "OLLAMA_MODEL=farm2fork"
    } else {
        $content += "`nOLLAMA_MODEL=farm2fork"
    }
    Set-Content -Path $envPath -Value $content
    Write-Host "Configured backend/.env: AI_PROVIDER=ollama and OLLAMA_MODEL=farm2fork" -ForegroundColor Green
}

Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host "   SUCCESS! Local Farm2Fork AI Model is Ready!                        " -ForegroundColor Green
Write-Host "   Model Name: farm2fork                                              " -ForegroundColor Green
Write-Host "   Provider:   Local Ollama (Zero API Key, Works 24/7 Offline)        " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "`nTo test directly: ollama run farm2fork 'What is Farm2Fork?'"
