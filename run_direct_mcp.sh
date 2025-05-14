#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Starting Direct MCP Integration${NC}"
echo -e "${GREEN}=====================================${NC}"

# Kill any existing processes
echo -e "${BLUE}Terminating any existing services...${NC}"
pkill -f "blender-mcp" || true
pkill -f "node.*direct-mcp-bridge.js" || true
pkill -f "node.*blender-mcp-proxy.js" || true

# Start the official blender-mcp in a new terminal
echo -e "${BLUE}Starting official Blender MCP server...${NC}"
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo \"Starting Blender MCP server...\" && source .venv/bin/activate && blender-mcp"'

# Sleep to ensure MCP server has time to start
echo -e "${YELLOW}Waiting for Blender MCP to initialize...${NC}"
sleep 3

# Start the proxy to connect MCP with our UI
echo -e "${BLUE}Starting MCP Proxy server...${NC}"
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo \"Starting MCP Proxy server...\" && node blender-mcp-proxy.js"'

# Sleep to ensure proxy has time to start
sleep 2

# Start our direct MCP bridge
echo -e "${BLUE}Starting Direct MCP Bridge...${NC}"
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo \"Starting Direct MCP Bridge...\" && node direct-mcp-bridge.js"'

# Open the index.html file directly in the browser
echo -e "${BLUE}Opening web UI...${NC}"
open http://localhost:3002

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}All services started!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Make sure you have installed the Blender addon.py file in Blender"
echo -e "2. Open Blender, find the BlenderMCP tab in the sidebar (press N)"
echo -e "3. Click 'Connect to Claude'"
echo -e "4. Begin using your web UI with direct MCP communication"
echo -e "\n${RED}Press Ctrl+C to terminate this script${NC}"

# Keep script running
while true; do
  sleep 1
done
