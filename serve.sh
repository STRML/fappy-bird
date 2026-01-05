#!/bin/bash
# Serve Fappy Bird for local development

PORT=${1:-8080}

echo "Starting dev server on http://localhost:$PORT"
echo "Press Ctrl+C to stop"
echo ""

# Open browser after a short delay
(sleep 1 && open "http://localhost:$PORT") &

# Start simple HTTP server
python3 -m http.server $PORT 2>/dev/null || python -m SimpleHTTPServer $PORT
