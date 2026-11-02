@echo off
title Chua Online - server (dung tat cua so nay)
cd /d "%~dp0..\.."
:loop
node server\index.js
echo Server dung lai - khoi dong lai sau 5 giay...
timeout /t 5 /nobreak >nul
goto loop
