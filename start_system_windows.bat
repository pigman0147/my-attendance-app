@echo off
setlocal enabledelayedexpansion
title Attendance System Auto-Start

echo ========================================
echo [1/2] Starting Node.js Server...
echo ========================================
REM แก้ไขคำสั่ง start node ตามที่คุณใช้อยู่จริง
start /b node server.js

echo.
echo ========================================
echo [2/2] Connecting to Cloudflare Tunnel...
echo ========================================

if exist tunnel.log del tunnel.log

REM start Cloudflare และส่งค่าลง log
start /b cloudflared tunnel --url http://localhost:3000 > tunnel.log 2>&1

echo Waiting for domain generation...

:WaitForUrl
REM รอ 2 วินาที
timeout /t 2 /nobreak >nul

REM --- จุดที่แก้ไข ---
REM ค้นหาบรรทัดที่มีทั้ง "https://" และ ".trycloudflare.com" พร้อมกัน
REM เพื่อให้แน่ใจว่าเป็นบรรทัดที่มี Link จริงๆ ไม่ใช่บรรทัด Requesting
findstr /C:"trycloudflare.com" tunnel.log | findstr /C:"https://" >nul
if %errorlevel% neq 0 (
    echo ...Still waiting for URL...
    goto WaitForUrl
)

REM ดึง URL ออกมา
set "MY_DOMAIN="
REM ใช้ findstr กรองอีกรอบเพื่อให้ loop for ทำงานกับบรรทัดที่ถูกต้องแน่ๆ
for /f "tokens=2 delims=|" %%a in ('type tunnel.log ^| findstr /C:"trycloudflare.com" ^| findstr /C:"https://"') do (
    set "MY_DOMAIN=%%a"
)

REM ลบช่องว่างหัวท้าย
set "MY_DOMAIN=%MY_DOMAIN: =%"

cls
echo ========================================
echo [1/2] Node.js Server       : Running
echo [2/2] Cloudflare Tunnel    : Connected
echo ========================================
echo.
echo Domain: %MY_DOMAIN%
echo Domain: %MY_DOMAIN%/kiosk.html
echo.
echo ========================================
echo Log Output (Last 8 lines):
echo ----------------------------------------
powershell -command "Get-Content tunnel.log -Tail 8"
echo ========================================

pause
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1