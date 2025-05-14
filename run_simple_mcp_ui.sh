#!/bin/bash

# Exit on any error
set -e

# Kill any existing server processes
echo "Checking for existing server processes..."
pkill -f "node ./simple-mcp-server.js" || true
pkill -f "node ./port-redirect.js" || true
sleep 1

echo "Starting Simple MCP UI Server..."

# Start the MCP Server
node ./simple-mcp-server.js &

# Store the PID to kill it later if needed
SIMPLE_MCP_PID=$!

echo "Starting port redirector (3002 -> 3030)..."
# Start the port redirector
node ./port-redirect.js &

# Store the PID to kill it later if needed
REDIRECT_PID=$!

# Function to clean up on script exit
cleanup() {
    echo "Shutting down servers..."
    kill $SIMPLE_MCP_PID 2>/dev/null || true
    kill $REDIRECT_PID 2>/dev/null || true
    echo "Servers stopped."
}

# Register the cleanup function to be called on exit
trap cleanup EXIT

echo "Simple MCP UI Server started on http://localhost:3030"
echo "Press Ctrl+C to stop the servers"

# Keep the script running to see logs
wait $SIMPLE_MCP_PID
