@echo off
chcp 65001 >nul
title Padaria Vitoria - gerar pedido de demonstracao
cd /d "%~dp0"
node scripts\pedido-completo.mjs
pause
