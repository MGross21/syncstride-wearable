#!/bin/bash

# This script spins up a local server on a specified port

PORT=8000  # Default port

# Check if a port number is provided as an argument
if [ $# -eq 1 ]; then
    PORT=$1
fi

echo "Starting local server on port $PORT..."
echo "Server will be accessible at: http://localhost:$PORT"

python3 -m http.server "$PORT"

echo "Server is running at: http://localhost:$PORT"

# Note: Ensure Python is installed and available in your PATH