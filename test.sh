#!/bin/bash -ex
# Run Fappy Bird test suite

PORT=${1:-8080}

echo "Starting test server on http://localhost:$PORT/tests/"
echo "Press Ctrl+C to stop"
echo ""

# Open browser after a short delay
(sleep 1 && open "http://localhost:$PORT/tests/") &

# Start simple HTTP server
python3 -m http.server $PORT 2>/dev/null || python -m SimpleHTTPServer $PORT
