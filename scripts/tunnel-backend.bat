@echo off
echo ======================================================================
echo    Farm2Fork - Connect Netlify to Your Free Local Backend + Ollama
echo ======================================================================
echo.
echo This script gives your local backend (port 3000) a 100%% FREE public HTTPS URL
echo with NO credit card and NO paid subscription required!
echo.
echo Instructions:
echo   1. Copy the public https://xxxx.loca.lt URL printed below.
echo   2. Go to your Netlify Dashboard -> Site configuration -> Environment variables.
echo   3. Add or update:
echo        Key   : VITE_API_BASE_URL
echo        Value : https://xxxx.loca.lt
echo   4. Trigger a Deploy on Netlify.
echo.
echo Starting secure tunnel on port 3000...
npx -y localtunnel --port 3000
