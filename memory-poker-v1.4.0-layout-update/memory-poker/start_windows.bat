@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 이상이 필요합니다: https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo MEMORY POKER 서버 실행: http://localhost:3000
echo 서버를 종료하려면 Ctrl+C를 누르세요.
echo.
start "" "http://localhost:3000"
node server.js
pause
