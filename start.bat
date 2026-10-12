@echo off
echo Starting Urban Incident Fusion Full-Stack Application...
start "Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 127.0.0.1 --port 5173"
echo.
echo Application starting!
echo Backend:  http://localhost:8000/docs
echo Frontend: http://localhost:5173/
