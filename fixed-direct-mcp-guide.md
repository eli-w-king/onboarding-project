# Updated Direct MCP Integration Guide

This guide explains how to use the new direct MCP bridge that works with your existing web UI.

## What's Fixed

1. **Connection Issues**: The integration now properly connects your UI to the Blender MCP
2. **HTML Support**: The system now serves your HTML file properly
3. **API Key Validation**: Your API key system continues to work as expected
4. **Response Formatting**: Responses are formatted to match what your UI expects

## How to Use

1. **Start the System**
   ```bash
   ./run_direct_mcp.sh
   ```

2. **Set Up Blender**
   - Open Blender
   - Go to the 3D View sidebar (press N)
   - Find the "BlenderMCP" tab
   - Click "Connect to Claude"

3. **Use Your Web UI**
   - Your browser will automatically open to http://localhost:3002
   - Enter your OpenRouter API key as usual
   - Start sending Python code to Blender!

## How It Works

1. **Your Web UI** (`index.html`) connects to the **Direct MCP Bridge** (`direct-mcp-bridge.js`) on port 3002
2. The bridge forwards Python code to the **MCP Proxy** (`blender-mcp-proxy.js`) on port 3100
3. The proxy communicates with the **Official Blender MCP** server
4. Responses are sent back through the chain to your UI

## Important Notes

- Your API key is still used for authentication but the system now passes Python code directly
- The web interface should work exactly as before - the changes are all "under the hood"
- You can type Python code directly in your chat interface

## Troubleshooting

If you have any issues:

1. **Check all terminal windows** for error messages
2. Make sure **Blender is running** and the MCP connection is active
3. Try restarting all components with `./run_direct_mcp.sh`
4. Verify the **ports** (3002 and 3100) are not in use by other applications

## Next Steps

If you want to add back AI code generation:

1. Modify `direct-mcp-bridge.js` to integrate with the OpenRouter API
2. Process natural language through the API before sending Python to Blender
