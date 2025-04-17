#!/bin/bash

# Cross-platform local server script for HTML/JS/CSS with auto-reload (no inotify)

cd "$(dirname "$0")"

DEFAULT_PORT=8000
PORT="${1:-$DEFAULT_PORT}"
BIND_ADDRESS="0.0.0.0"

# Track server PID globally
SERVER_PID=0

# Kill any server on this port
if lsof -i :"$PORT" &>/dev/null; then
    echo "Shutting down previous server on port $PORT..."
    fuser -k "$PORT"/tcp
    sleep 1
fi

# Start Python server
start_server() {
    echo "Starting server on port $PORT..."
    python3 -m http.server "$PORT" --bind "$BIND_ADDRESS" &
    SERVER_PID=$!
    echo "Server PID: $SERVER_PID"
}

# Stop server
stop_server() {
    if [ $SERVER_PID -ne 0 ]; then
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
        SERVER_PID=0
    fi
}

# Poll for file changes (Windows-friendly)
watch_files() {
    echo "Watching for .html, .css, .js file changes..."
    LAST_CHECKSUM=""

    while true; do
        CURRENT_CHECKSUM=$(find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) -exec md5sum {} + 2>/dev/null | sort | md5sum)

        if [ "$CURRENT_CHECKSUM" != "$LAST_CHECKSUM" ]; then
            echo "Change detected. Restarting server..."
            LAST_CHECKSUM=$CURRENT_CHECKSUM
            stop_server
            start_server
        fi

        sleep 2
    done
}

# Trap CTRL+C to clean up
trap stop_server EXIT

start_server
watch_files