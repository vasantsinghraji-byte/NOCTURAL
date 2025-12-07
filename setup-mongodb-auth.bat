@echo off
echo ===================================
echo MongoDB Authentication Setup
echo ===================================
echo.
echo This script will create MongoDB users for authentication.
echo Make sure MongoDB is running WITHOUT authentication first.
echo.
pause

echo.
echo Connecting to MongoDB and creating users...
echo.

REM Try using mongo shell if available
where mongo >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    mongo setup-mongodb-auth.js
    goto :done
)

REM Try using mongosh if available
where mongosh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    mongosh --file setup-mongodb-auth.js
    goto :done
)

REM Neither shell found - provide instructions
echo.
echo ERROR: MongoDB shell not found in PATH
echo.
echo Please install MongoDB Shell:
echo 1. Download from: https://www.mongodb.com/try/download/shell
echo 2. Install mongosh
echo 3. Run: mongosh --file setup-mongodb-auth.js
echo.
echo Or manually run the commands in setup-mongodb-auth.js
echo.
pause
exit /b 1

:done
echo.
echo ===================================
echo User creation complete!
echo ===================================
echo.
echo Next Steps:
echo 1. Edit C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg
echo 2. Add these lines:
echo    security:
echo      authorization: enabled
echo 3. Restart MongoDB service:
echo    net stop MongoDB
echo    net start MongoDB
echo 4. Update .env files with actual passwords
echo.
pause
