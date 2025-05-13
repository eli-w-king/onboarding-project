# Blender Remote Script Server

This folder contains a minimal Flask server for running Blender Python scripts remotely and returning rendered images to a web client. It is designed to be compatible with the MCP server and can be used as a backend for browser-based 3D script experiments.

## Features
- Accepts Python scripts via HTTP POST
- Executes scripts in Blender's Python environment
- Returns rendered images or error messages
- Simple HTML frontend for sending scripts and viewing results

## Usage
1. Place this folder in your Blender workspace.
2. Start Blender and run the server script as an add-on or from the Scripting workspace.
3. Open the included HTML file in your browser.

## Security Warning
**Do not expose this server to the public internet without authentication and sandboxing!**
Running arbitrary Python code is dangerous.
