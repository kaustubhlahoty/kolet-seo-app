#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Kill anything already on these ports
echo "Stopping any existing servers..."
lsof -ti :8000 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

echo "Starting Kolet SEO app..."

# Backend
cd "$ROOT/backend"
python3 -m uvicorn main:app --port 8000 &
BACKEND_PID=$!
echo "✓ Backend → http://localhost:8000 (PID $BACKEND_PID)"

# Frontend
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "✓ Frontend → http://localhost:3000 (PID $FRONTEND_PID)"

echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
