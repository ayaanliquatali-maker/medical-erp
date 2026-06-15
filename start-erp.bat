@echo off
set PATH=C:\Program Files\nodejs;C:\Users\Dell\AppData\Roaming\npm;%PATH%
set PORT=8080
set BASE_PATH=/
set CI=true
cd /d P:\Projects\Medical Store
pnpm --filter @workspace/erp run dev
