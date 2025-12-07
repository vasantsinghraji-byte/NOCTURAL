@echo off
REM ================================================================
REM  NOCTURNAL Platform - Database Migration Script
REM  Migrates from noctural_dev to nocturnal_dev
REM ================================================================

echo.
echo ================================================================
echo   NOCTURNAL Platform Migration
echo   noctural_dev --^> nocturnal_dev
echo ================================================================
echo.

REM Check if Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if MongoDB is running
echo [1/5] Checking MongoDB connection...
mongosh --quiet --eval "db.version()" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect to MongoDB
    echo Please ensure MongoDB is running on localhost:27017
    pause
    exit /b 1
)
echo      MongoDB is running
echo.

REM Backup current database
echo [2/5] Creating backup of noctural_dev...
if not exist "backups" mkdir backups
set BACKUP_DIR=backups\noctural_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mongodump --db=noctural_dev --out="%BACKUP_DIR%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      Backup created: %BACKUP_DIR%
) else (
    echo [WARN] Backup failed, but continuing...
)
echo.

REM Run migration script
echo [3/5] Running database migration...
node scripts/rename-database.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Migration failed
    pause
    exit /b 1
)
echo.

REM Test server startup
echo [4/5] Testing server startup...
timeout /t 2 >nul
echo      Starting server for 5 seconds...
start /B node server.js >test-server.log 2>&1
timeout /t 5 >nul
taskkill /F /IM node.exe >nul 2>&1

REM Check if server started successfully
findstr /C:"Server Started Successfully" test-server.log >nul
if %ERRORLEVEL% EQU 0 (
    echo      Server started successfully!
) else (
    echo [WARN] Server startup test inconclusive
    echo      Check test-server.log for details
)
echo.

REM Summary
echo [5/5] Migration Summary
echo ================================================================
echo   OLD Database: noctural_dev (still exists)
echo   NEW Database: nocturnal_dev (created)
echo   Backup Location: %BACKUP_DIR%
echo   Migration Script Log: Check console output above
echo ================================================================
echo.

REM Next steps
echo NEXT STEPS:
echo 1. Verify data in new database:
echo    mongosh
echo    use nocturnal_dev
echo    db.users.countDocuments()
echo.
echo 2. Start the server:
echo    npm start
echo    or
echo    pm2 start ecosystem.config.js --env development
echo.
echo 3. Test in browser:
echo    http://localhost:5000
echo.
echo 4. After 7 days of testing, drop old database:
echo    mongosh
echo    use noctural_dev
echo    db.dropDatabase()
echo.
echo ================================================================

pause
