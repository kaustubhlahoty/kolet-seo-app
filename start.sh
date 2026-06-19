#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping any existing servers..."
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

echo "Starting Kolet SEO app..."

cd "$ROOT/frontend"
npm run dev &
PID=$!
echo "✓ App → http://localhost:3000 (PID $PID)"
echo ""
echo "Press Ctrl+C to stop."
trap "kill $PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
