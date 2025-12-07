@echo off
echo.
echo ====================================
echo   STARTING NOCTURAL FRONTEND
echo ====================================
echo.

cd /d "%~dp0"
npx http-server -p 8080

pause