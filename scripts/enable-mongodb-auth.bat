@echo off
REM MongoDB Authentication Enabler for Windows
REM This script helps enable authentication in MongoDB

echo ================================================================
echo   MONGODB AUTHENTICATION ENABLER
echo ================================================================
echo.

echo Step 1: Locating MongoDB configuration file...
echo.

set "CONFIG_PATH=C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"

if exist "%CONFIG_PATH%" (
    echo Found MongoDB config at: %CONFIG_PATH%
) else (
    echo Config not found at default location. Checking alternate paths...

    if exist "C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg" (
        set "CONFIG_PATH=C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg"
        echo Found MongoDB config at: %CONFIG_PATH%
    ) else if exist "C:\Program Files\MongoDB\Server\6.0\bin\mongod.cfg" (
        set "CONFIG_PATH=C:\Program Files\MongoDB\Server\6.0\bin\mongod.cfg"
        echo Found MongoDB config at: %CONFIG_PATH%
    ) else (
        echo ERROR: Could not find mongod.cfg
        echo Please manually locate and edit your mongod.cfg file
        echo.
        echo Add the following lines to enable authentication:
        echo.
        echo security:
        echo   authorization: enabled
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Step 2: Backing up current configuration...
copy "%CONFIG_PATH%" "%CONFIG_PATH%.backup" >nul
echo Backup created: %CONFIG_PATH%.backup
echo.

echo Step 3: Checking if authentication is already enabled...
findstr /C:"authorization: enabled" "%CONFIG_PATH%" >nul
if %ERRORLEVEL% EQU 0 (
    echo Authentication is already enabled in mongod.cfg
    echo.
    goto :restart_prompt
)

echo Authentication is not enabled. Adding configuration...
echo.

echo Step 4: Adding authentication configuration...
echo # Security configuration >> "%CONFIG_PATH%"
echo security: >> "%CONFIG_PATH%"
echo   authorization: enabled >> "%CONFIG_PATH%"
echo.
echo Authentication configuration added successfully!
echo.

:restart_prompt
echo Step 5: Restart MongoDB service...
echo.
echo To apply changes, the MongoDB service must be restarted.
echo.
set /p RESTART="Do you want to restart MongoDB service now? (Y/N): "

if /i "%RESTART%"=="Y" (
    echo.
    echo Stopping MongoDB service...
    net stop MongoDB

    echo.
    echo Starting MongoDB service...
    net start MongoDB

    if %ERRORLEVEL% EQU 0 (
        echo.
        echo MongoDB service restarted successfully!
        echo Authentication is now enabled.
    ) else (
        echo.
        echo ERROR: Failed to start MongoDB service.
        echo Please check the MongoDB logs for errors.
    )
) else (
    echo.
    echo Restart skipped. Remember to restart MongoDB manually:
    echo   net stop MongoDB
    echo   net start MongoDB
)

echo.
echo ================================================================
echo   CONFIGURATION COMPLETE
echo ================================================================
echo.
echo IMPORTANT:
echo 1. Run setup-mongodb-security.js to create users
echo 2. Update your .env file with authentication credentials
echo 3. Test the connection with: npm start
echo.
pause
