@echo off
set PATH=C:\Program Files\nodejs;C:\Users\Dell\AppData\Roaming\npm;%PATH%
set DATABASE_URL=YOUR_NEON_DATABASE_URL
set NODE_ENV=production
set ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD
set ADMIN_COOKIE_SECRET=YOUR_COOKIE_SECRET
set GROQ_API_KEY=YOUR_GROQ_API_KEY
set PORT=5000
set CI=true
cd /d P:\Projects\Medical Store\artifacts\api-server
node --enable-source-maps ./dist/index.mjs
