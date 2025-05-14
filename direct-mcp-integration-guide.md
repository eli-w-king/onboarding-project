# Direct MCP Integration Guide

This guide explains the simplified integration between your web UI and the official Blender Model Context Protocol (MCP) implementation.

## Overview

This direct integration approach:
1. Uses the official `blender-mcp` package for reliable communication with Blender
2. Keeps your custom web UI with OpenRouter API key support
3. Eliminates the redundant system prompts and custom MCP bridge
4. Uses a simple proxy to connect the systems

## How It Works

The flow is now greatly simplified:
1. Your web UI sends the code directly to the `direct-mcp-bridge.js`
2. The bridge forwards it to our proxy (`blender-mcp-proxy.js`)
3. The proxy passes it to the official `blender-mcp` server
4. The official MCP communicates with Blender through the addon

This direct connection means:
- No redundant system prompting
- No complex message parsing
- Direct code execution in Blender

## Setup Instructions

1. **Install Blender Addon**
   - Open Blender
   - Go to Edit > Preferences > Add-ons
   - Click "Install..." and select the `addon.py` file
   - Enable the addon by checking the box next to "Interface: Blender MCP"

2. **Start the System**
   ```bash
   ./run_direct_mcp.sh
   ```
   This will start all necessary components in separate terminals.

3. **Connect Blender to MCP**
   - In Blender, open the sidebar (press N)
   - Find the "BlenderMCP" tab
   - Click "Connect to Claude"

4. **Use Your Web UI**
   - Enter your API key as usual
   - Type Python code directly or natural language that should be converted to Python

## Important Notes

1. **Code Execution**:
   - The system now directly executes Python code in Blender
   - No system prompting is done before execution
   - This may require you to adapt how you use the interface

2. **API Usage**:
   - Your OpenRouter API key is still required for authentication but is not currently used for code generation
   - To add AI code generation back, you would need to modify the `direct-mcp-bridge.js` file

3. **Future Improvements**:
   - You could integrate OpenAI/Claude API calls directly in the bridge to convert natural language to Python
   - This would give you the best of both worlds: AI code generation and official MCP reliability

## Troubleshooting

- **No Response from Blender**: Make sure the addon is installed and the "Connect to Claude" button has been pressed.
- **Connection Errors**: Check all terminal windows for error messages.
- **Code Not Executing**: Ensure you're sending valid Blender Python code.

## Advanced Usage

If you want to re-add AI code generation:

1. Modify `direct-mcp-bridge.js` to check if the input is code or natural language
2. For natural language, call OpenRouter/OpenAI/Claude to convert to Python
3. Then send the generated Python to the MCP proxy

This would combine the reliability of the official MCP with the convenience of natural language processing.
