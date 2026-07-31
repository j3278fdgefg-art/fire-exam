@echo off
rem 消防考試教育系統啟動器：啟動本機伺服器並開啟瀏覽器
cd /d "%~dp0"
start "fire-exam-server" /min python -m http.server 8901
timeout /t 1 /nobreak >nul
start "" http://localhost:8901
