@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 ou superior nao foi encontrado.
  echo Instale o Node.js e execute este arquivo novamente.
  pause
  exit /b 1
)
start "Vertice Climax - Web local" cmd /k "cd /d ""%~dp0"" && node serve-local.mjs"
start "Vertice Climax - WhatsApp" powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0whatsapp-service\setup-local.ps1"
timeout /t 4 >nul
start "" "http://127.0.0.1:8080/business.html"
echo.
echo Abra WhatsApp Web no painel, informe http://127.0.0.1:8787 e o token de whatsapp-service\.env.
echo Mantenha as duas janelas abertas para o conector funcionar.
pause
