@echo off
netstat -ano | findstr :5000 | findstr LISTENING >nul
if errorlevel 1 start /min cmd /c C:\Users\Chakor\task-management-system\RunTaskApiForever.cmd
netstat -ano | findstr :3000 | findstr LISTENING >nul
if errorlevel 1 start /min cmd /c C:\Users\Chakor\task-management-system\RunTaskWebForever.cmd
exit /b
