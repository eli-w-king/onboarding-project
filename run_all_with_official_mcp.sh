#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting all services...${NC}"

# Start blender-mcp in a new terminal
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo -e \"'${BLUE}'Starting blender-mcp server...'${NC}'\" && source .venv/bin/activate && blender-mcp"'

# Give the blender-mcp server a moment to start
sleep 3

# Start the proxy in a new terminal
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo -e \"'${BLUE}'Starting blender-mcp proxy server...'${NC}'\" && node blender-mcp-proxy.js"'

# Start the client bridge in a new terminal
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo -e \"'${BLUE}'Starting client bridge...'${NC}'\" && node mcp-client-bridge.js"'

# Start the UI server in a new terminal
osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && echo -e \"'${BLUE}'Starting UI server...'${NC}'\" && open index.html"'

echo -e "${GREEN}All services started! Connect to Blender to begin.${NC}"
echo -e "${GREEN}Please make sure you have:${NC}"
echo -e "1. Installed the Blender addon.py file in Blender"
echo -e "2. Started Blender and enabled the addon in preferences"
echo -e "3. Connected to Claude by clicking 'Connect to Claude' in the BlenderMCP tab in Blender"

# Keep this script running to make it easy to terminate all processes
echo -e "${GREEN}Press Ctrl+C to terminate all services${NC}"
wait
