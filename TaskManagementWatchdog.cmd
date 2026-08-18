@echo off
:LOOP
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 start "TASK API" /min cmd /c call "C:\Users\Chakor\task-management-system\StartTaskApi.cmd"
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 start "TASK WEB" /min cmd /c call "C:\Users\Chakor\task-management-system\StartTaskWeb.cmd"
timeout /t 20 /nobreak >nul
goto LOOP
