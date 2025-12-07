@echo off
echo Resetting MongoDB to run without authentication...
echo.

REM Stop MongoDB
echo Stopping MongoDB service...
net stop MongoDB
timeout /t 2 >nul

REM Delete admin database (contains user credentials)
echo Removing authentication database...
if exist "C:\Program Files\MongoDB\Server\8.2\data\admin.*" (
    del /Q "C:\Program Files\MongoDB\Server\8.2\data\admin.*"
    echo Admin database files deleted
) else (
    echo No admin database files found
)

REM Start MongoDB
echo Starting MongoDB service...
net start MongoDB
timeout /t 3 >nul

echo.
echo MongoDB is now running without authentication!
echo You can now start your Node.js server with: npm start
echo.
pause
