@echo off
:LOOP
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 start "TASK API - KEEP OPEN" /min cmd /k "cd /d C:\Users\Chakor\task-management-system\apps\api ^&^& set CLIENT_URL=http://localhost:3000 ^&^& npm.cmd run dev"
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 start "TASK WEB - KEEP OPEN" /min cmd /k "cd /d C:\Users\Chakor\task-management-system\apps\web ^&^& node node_modules\next\dist\bin\next dev --webpack -H localhost -p 3000"
timeout /t 20 /nobreak >nul
goto LOOP
