#!/bin/bash
# Test the Azure deployment locally

# Exit on any error
set -e

# Kill any existing server processes
echo "Checking for existing server processes..."
pkill -f "node ./azure-mcp-server.js" || true
pkill -f "node ./local-mcp-bridge.js" || true
sleep 1

echo "Starting Azure MCP Server locally..."

# Install dependencies if they don't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install cors express ws
fi

# Start the Azure MCP Server
node ./azure-mcp-server.js &

# Store the PID to kill it later if needed
AZURE_SERVER_PID=$!

echo "Starting local MCP bridge..."
# Start the local MCP bridge
node ./local-mcp-bridge.js &

# Store the PID to kill it later if needed
BRIDGE_PID=$!

# Function to clean up on script exit
cleanup() {
    echo "Shutting down servers..."
    kill $AZURE_SERVER_PID 2>/dev/null || true
    kill $BRIDGE_PID 2>/dev/null || true
    echo "Servers stopped."
}

# Register the cleanup function to be called on exit
trap cleanup EXIT

echo "Azure MCP Server started on http://localhost:3030"
echo "Local MCP Bridge connected to Blender MCP (port 1234)"
echo "Press Ctrl+C to stop all processes"

# Keep the script running to see logs
wait $AZURE_SERVER_PID
