@echo off
set PATH=C:\Program Files\nodejs;C:\Users\Dell\AppData\Roaming\npm;%PATH%

:: Only set defaults if not already set in environment
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running or edit this file.
  exit /b 1
)
if "%ADMIN_PASSWORD%"=="" (
  echo ERROR: ADMIN_PASSWORD is not set.
  exit /b 1
)
if "%ADMIN_COOKIE_SECRET%"=="" set "ADMIN_COOKIE_SECRET=%ADMIN_PASSWORD%"
if "%PORT%"=="" set "PORT=5000"

set NODE_ENV=production

cd /d P:\Projects\Medical Store\artifacts\api-server
echo Starting API server on port %PORT%...
node --enable-source-maps ./dist/index.mjs
if %ERRORLEVEL% NEQ 0 (
  echo API server exited with code %ERRORLEVEL%
  pause
)
