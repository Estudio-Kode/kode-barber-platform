@echo off
echo Encerrando servidor e tunel...
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
echo Pronto. Site e link encerrados.
pause
