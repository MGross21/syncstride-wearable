#!/bin/bash

# Cross-platform local server script with auto-reload and cleanup
cd "$(dirname "$0")"

DEFAULT_PORT=8000
PORT="${1:-$DEFAULT_PORT}"
BIND_ADDRESS="0.0.0.0"
SERVER_PID=0

# Start Python HTTP server
start_server() {
    echo "Starting Python HTTP server on http://localhost:$PORT ..."
    python -m http.server "$PORT" --bind "$BIND_ADDRESS" &
    SERVER_PID=$!
    echo "Server started with PID $SERVER_PID"
}

# Stop Python HTTP server
stop_server() {
    if [ "$SERVER_PID" -ne 0 ] && ps -p "$SERVER_PID" > /dev/null; then
        echo "Stopping server with PID $SERVER_PID..."
        kill "$SERVER_PID" 2>/dev/null
        wait "$SERVER_PID" 2>/dev/null
        SERVER_PID=0
    fi
}

# Cleanup on script exit
cleanup() {
    echo ""
    echo "Caught exit signal. Cleaning up..."
    stop_server
    echo "Server stopped."
    exit 0
}

# Trap termination signals
trap cleanup SIGINT SIGTERM EXIT

# Watch for file changes and restart server on updates
watch_and_reload() {
    echo "Watching for changes in .html, .css, .js files..."
    LAST_HASH=""

    while true; do
        CURRENT_HASH=$(find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) -exec cat {} + 2>/dev/null | md5sum)
        if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
            echo "Change detected. Reloading server..."
            LAST_HASH="$CURRENT_HASH"
            stop_server
            start_server
        fi
        sleep 2
    done
}

# Start server and watch loop
start_server
watch_and_reload