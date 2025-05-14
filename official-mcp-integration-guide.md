# Blender MCP Integration Guide

This guide explains how to integrate your custom web UI with the official Blender Model Context Protocol (MCP) implementation.

## Overview

This integration uses a hybrid approach that:
1. Uses the official `blender-mcp` package for reliable communication with Blender
2. Keeps your custom web UI and OpenRouter integration
3. Uses a proxy server to bridge between the two systems

## Setup Instructions

### 1. Install the Official Blender MCP

The official Blender MCP has been installed via pip:

```bash
pip install blender-mcp
```

### 2. Install the Blender Addon

1. Open Blender
2. Go to Edit > Preferences > Add-ons
3. Click "Install..." and select the `addon.py` file downloaded from the GitHub repository
4. Enable the addon by checking the box next to "Interface: Blender MCP"

### 3. Start the System

Run the new script to start all components:

```bash
chmod +x run_all_with_official_mcp.sh
./run_all_with_official_mcp.sh
```

This script will:
1. Start the official blender-mcp server
2. Start the proxy server that connects your UI with the official implementation
3. Start your client bridge and web UI

### 4. Connect Blender to the MCP Server

1. In Blender, go to the 3D View sidebar (press N if not visible)
2. Find the "BlenderMCP" tab
3. Click "Connect to Claude"
4. Your custom web UI should now be able to communicate with Blender through the official MCP implementation

## How It Works

1. Your web UI communicates with your client bridge (mcp-client-bridge.js)
2. The client bridge connects to our proxy server (blender-mcp-proxy.js)
3. The proxy server forwards messages to the official blender-mcp server
4. The official blender-mcp server communicates with the Blender addon

This approach gives you the reliability and features of the official implementation while keeping your custom UI with OpenRouter API key support.

## Troubleshooting

If you encounter issues:

1. **Blender not responding**: Make sure the Blender addon is installed and enabled, and the "Connect to Claude" button has been clicked in the BlenderMCP tab.

2. **Connection errors**: Check that all servers are running correctly. Look at the terminal outputs for any error messages.

3. **No response from commands**: The official MCP implementation may have different expectations for command formatting. Check the proxy server logs for clues.

4. **System seems slow**: The proxy introduces a small amount of overhead. For better performance, consider eventually migrating fully to the official implementation.

## Future Improvements

As you become more familiar with the official implementation, you might want to:

1. Directly integrate your web UI with the official blender-mcp
2. Contribute your improvements back to the official project
3. Remove the proxy layer for better performance
