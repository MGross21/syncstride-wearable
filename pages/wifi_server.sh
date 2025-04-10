#!/bin/bash

# Variables
IP_HOST="$(hostname -I | awk '{print $1}')"
if [[ -z "$IP_HOST" ]]; then
  IP_HOST="127.0.0.1" # Fallback to localhost if no IP is found
fi
PORT="8080"
DIRECTORY="$(pwd)"

# Start a simple HTTP server
echo "Hosting directory '$DIRECTORY' on http://$IP_HOST:$PORT"
if ! python3 -m http.server $PORT --bind $IP_HOST; then
  echo "Failed to start the HTTP server. Please check your network settings."
  exit 1
fi