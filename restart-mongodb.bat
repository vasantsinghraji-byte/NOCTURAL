@echo off
echo Restarting MongoDB service...
echo.

net stop MongoDB
timeout /t 3 >nul
net start MongoDB

echo.
echo MongoDB restarted successfully!
echo.
pause
