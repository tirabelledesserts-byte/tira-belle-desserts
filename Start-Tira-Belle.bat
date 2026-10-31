@echo off
title TIRA Belle - Tiramisu Sales & Loyalty Tracking System
echo =====================================================================
echo           TIRA Belle - Little Layers * Big Love
echo    Tiramisu Sales Management & Customer Loyalty Tracking System
echo =====================================================================
echo.
echo Starting TIRA Belle Backend Server (FastAPI + SQLite)...
start "" python run_server.py
timeout /t 2 /nobreak >nul
echo.
echo Launching TIRA Belle in your default browser...
start "" "http://localhost:8001/index.html"
echo.
echo Quick Shortcuts:
echo - Storefront:       http://localhost:8001/index.html
echo - Loyalty Tracker:  http://localhost:8001/tracker.html
echo - Staff POS Desk:   http://localhost:8001/tira-desk.html
echo - API Docs:         http://localhost:8001/docs
echo.
echo Press any key to exit this launcher window (Server will remain running)...
pause >nul
