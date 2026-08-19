@echo off
cd /d C:\Users\Chakor\task-management-system\apps\web
node node_modules\next\dist\bin\next dev --webpack -H localhost -p 3000 >> C:\Users\Chakor\task-management-system\web-server.log 2>&1
