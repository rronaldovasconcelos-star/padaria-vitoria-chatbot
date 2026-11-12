@echo off
chcp 65001 >nul
title Padaria Vitoria - mantendo o site no ar
cd /d "%~dp0"
node scripts\manter-no-ar.mjs %*
pause
