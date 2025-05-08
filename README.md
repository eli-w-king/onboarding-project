# Blender MCP Minimal Workflow

## Usage

1. Start the Blender MCP add-on (should be running and listening on port 9876).
2. Start the backend bridge:
   ```sh
   export OPENROUTER_API_KEY=sk-...yourkey...
   node blender-mcp-bridge.js
   ```
3. Open `index.html` in your browser.
4. Use the UI to send natural language requests (LLM agent) or Blender Python code. The backend will relay code to Blender MCP and return results.

## Minimal Workflow (Recommended)

**Only run one backend bridge: `blender-mcp-bridge.js`**

1. Start Blender MCP add-on (port 9876)
2. Start backend bridge:
   ```sh
   export OPENROUTER_API_KEY=sk-...yourkey...
   node blender-mcp-bridge.js
   ```
3. Open `index.html` and use the UI.

**Do NOT run `mcp-client-bridge.js` unless you need advanced LLM/Perplexity routing.**

## Troubleshooting

- Make sure only one backend bridge is running (`blender-mcp-bridge.js`).
- The UI should send requests to `http://localhost:3001/blender-mcp` (for direct code) or `/llm-agent` (for LLM-to-code).
- The Blender MCP add-on must be running and listening on port 9876.

## Cleaning Up

If you do not need LLM/Perplexity routing, you can delete `mcp-client-bridge.js`.
