# Simple MCP UI

A streamlined interface for connecting directly to Blender's Model Context Protocol (MCP) server.

## Overview

The Simple MCP UI provides a direct connection to Blender's MCP server, allowing you to:

- Execute Python code in Blender
- Retrieve scene information
- Use pre-built code examples
- Get immediate feedback from Blender

## Requirements

- Node.js (v12 or higher)
- Blender with the MCP addon installed and running
- Required npm packages: express, body-parser

## Installation

1. Ensure the Blender MCP addon (`addon.py`) is installed in Blender
2. Install required npm packages:

```bash
npm install express body-parser
```

## Usage

### Starting the Server

1. Start Blender and ensure the MCP addon is enabled
2. Run the server script:

```bash
# Option 1: Using the run script
./run_simple_mcp_ui.sh

# Option 2: Running directly with Node
node simple-mcp-server.js
```

3. Open your browser and navigate to: http://localhost:3030

### Using the Interface

1. Click "Connect" to establish a connection with Blender's MCP server
2. Enter Python code in the editor or select a code example
3. Click "Execute Code" to run the code in Blender
4. Use "Get Scene Info" to retrieve information about the current scene
5. View results in the results area at the bottom

### Code Examples

The interface includes several code examples:
- Basic Cube: Create a simple red cube
- Shiny Sphere: Create a glossy blue sphere
- Suzanne: Create Blender's monkey mascot
- 3D Text: Create extruded 3D text
- Simple Animation: Create a rotating cube animation
- Material Nodes: Create a cube with procedural material
- Scene Info: Get active scene information
- Clean Scene: Delete all objects in the scene

## Troubleshooting

- **Connection fails**: Make sure Blender is running and the MCP addon is enabled
- **No response from server**: Check that the server is running (should be on port 3030)
- **Code execution errors**: Check the results area for error messages
- **MCP addon not found**: Ensure the addon.py file is properly installed in Blender

## Architecture

This tool consists of two main components:

1. **simple-mcp-server.js**: Node.js server that handles communication between the web UI and Blender's MCP server
2. **simple-mcp-ui.html**: Web interface for sending commands and viewing results

The server creates a direct socket connection to Blender's MCP server (running on port 1234 by default) and proxies commands from the web UI.

## Notes

- This is a minimal implementation focused on direct code execution
- For AI-assisted code generation, use the blender-mcp-bridge.js implementation instead
- Ensure only one connection to MCP is active at a time
