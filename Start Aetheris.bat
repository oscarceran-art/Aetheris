@echo off
setlocal
cd /d "%~dp0"
title Aetheris - local server

echo.
echo   Aetheris
echo   ----------------------------------------------------------
echo   Starting the local server...
echo   Google Chrome will open http://localhost:5173 when it is up.
echo.
echo   Keep this window open while you use the app.
echo   Press Ctrl+C here to stop the server.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js was not found. Install it from https://nodejs.org
  echo       then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   First run - installing dependencies ^(this takes a minute^)...
  echo.
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo   [X] npm install failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
)

start "" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-browser.ps1"

call npm.cmd run dev

echo.
echo   Server stopped.
pause
