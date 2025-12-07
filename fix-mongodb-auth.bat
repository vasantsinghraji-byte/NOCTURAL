@echo off
echo Disabling MongoDB Authentication...
echo.

REM Backup the original config
copy "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg" "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg.backup" >nul 2>&1

REM Create new config with auth disabled
(
echo # mongod.conf
echo.
echo # for documentation of all options, see:
echo #   http://docs.mongodb.org/manual/reference/configuration-options/
echo.
echo # Where and how to store data.
echo storage:
echo   dbPath: C:\Program Files\MongoDB\Server\8.2\data
echo.
echo # where to write logging data.
echo systemLog:
echo   destination: file
echo   logAppend: true
echo   path: C:\Program Files\MongoDB\Server\8.2\log\mongod.log
echo.
echo # network interfaces
echo net:
echo   port: 27017
echo   bindIp: 127.0.0.1
echo #processManagement:
echo.
echo #security:
echo #  authorization: enabled
echo.
echo #operationProfiling:
echo.
echo #replication:
echo.
echo #sharding:
echo.
echo ## Enterprise-Only Options:
echo.
echo #auditLog:
echo.
) > "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"

echo Config updated successfully!
echo.
echo Restarting MongoDB service...
net stop MongoDB
timeout /t 2 >nul
net start MongoDB

echo.
echo Done! MongoDB is now running without authentication.
echo Press any key to close...
pause >nul
