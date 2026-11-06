@echo off
title Envoi de Ebook vers GitHub
cd /d A:\ebook
echo ========================================================
echo   Envoi du projet Ebook vers GitHub (gauthierballot/ebook)
echo ========================================================
echo.
git push -u origin main
echo.
echo Termine ! Tu peux fermer cette fenetre.
pause
