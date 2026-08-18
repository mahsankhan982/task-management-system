@echo off
:LOOP
cd /d C:\Users\Chakor\task-management-system\apps\api
set CLIENT_URL=http://localhost:3000
npm.cmd run dev >> C:\Users\Chakor\task-management-system\api-server.log 2>&1
timeout /t 5 /nobreak >nul
goto LOOP
