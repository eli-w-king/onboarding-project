#!/bin/bash
# /Users/elijahking/Library/CloudStorage/OneDrive-Microsoft/Documents/GitHub/onboarding-project/run_all_bridges_and_logs.sh
# Run all bridge services and tail their logs in one terminal

set -e

# Set production mode for Node.js services
export NODE_ENV=production

# Kill any existing processes
pkill -f "node.*mcp-client-bridge.js" || true
pkill -f "node.*blender-mcp-bridge.js" || true
pkill -f "python.*server.py" || true

# Start MCP Python server
cd "$(dirname "$0")/comprehensive-setup-guide.md/blender-mcp"
echo "Starting MCP server..."
python -m src.blender_mcp.server > ../../blender-mcp-server.log 2>&1 &
cd "$(dirname "$0")"

# Start Blender MCP Bridge (from project root)
echo "Starting Blender MCP Bridge..."
node --max-old-space-size=512 ./blender-mcp-bridge.js > blender-mcp-bridge.log 2>&1 &
echo "Started Blender MCP Bridge"

# Start MCP Client Bridge (from project root)
echo "Starting MCP Client Bridge..."
node --max-old-space-size=512 ./mcp-client-bridge.js > mcp-client-bridge.log 2>&1 &
echo "Started MCP Client Bridge"

# Note: remote_script_server.py is run manually in Blender scripting

echo "All bridge services started. Tailing logs:"
echo "  - blender-mcp-server.log"
echo "  - blender-mcp-bridge.log"
echo "  - mcp-client-bridge.log"

tail -n 50 -f blender-mcp-server.log blender-mcp-bridge.log mcp-client-bridge.log
