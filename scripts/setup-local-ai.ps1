# Farm2Fork Local AI Setup Script (100% Free, No API Keys, No Credit Card)
# Builds and registers the custom 'farm2fork' Ollama model locally.

Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Farm2Fork Local Ollama AI Setup (100% Free)     " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# 1. Check if Ollama is installed
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Host "`n[1/4] Ollama is not installed. Installing via Windows Package Manager..." -ForegroundColor Yellow
    winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
    
    # Refresh PATH environment variable
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "`n[1/4] Ollama is already installed." -ForegroundColor Cyan
}

# 2. Pull base model (llama3.2)
Write-Host "`n[2/4] Downloading base model (llama3.2)..." -ForegroundColor Yellow
ollama pull llama3.2

# 3. Create the custom Farm2Fork model from Modelfile
Write-Host "`n[3/4] Building custom 'farm2fork' domain model..." -ForegroundColor Yellow
ollama create farm2fork -f Modelfile

# 4. Configure backend environment
Write-Host "`n[4/4] Updating backend environment to use local Ollama model..." -ForegroundColor Yellow
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
    Write-Host "Updated backend/.env with AI_PROVIDER=ollama and OLLAMA_MODEL=farm2fork" -ForegroundColor Green
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Farm2Fork Local AI Model is Ready!     " -ForegroundColor Green
Write-Host "  Model Name: farm2fork                           " -ForegroundColor Green
Write-Host "  Provider:   Ollama (100% Offline, Zero API Key) " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "`nTo test your model in terminal: ollama run farm2fork 'What is Farm2Fork?'"
