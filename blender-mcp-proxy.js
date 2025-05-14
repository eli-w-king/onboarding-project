const http = require('http');
const WebSocket = require('ws');
const net = require('net');

// Configuration
const WEB_UI_PORT = 3000; // Port your web UI expects to connect to
const BLENDER_MCP_PORT = 1234; // Default port for blender-mcp server
const PROXY_PORT = 3100; // Port for this proxy server

// Create WebSocket server for the web UI to connect to
const wss = new WebSocket.Server({ port: PROXY_PORT });

console.log(`[Proxy] Started WebSocket server on port ${PROXY_PORT}`);
console.log(`[Proxy] Connect your web UI to ws://localhost:${PROXY_PORT}`);
console.log(`[Proxy] Forwarding messages to blender-mcp on port ${BLENDER_MCP_PORT}`);

// Socket client to connect to the official blender-mcp
let mcpSocketClient = null;

// Connect to the blender-mcp server
function connectToMCPServer() {
  const client = new net.Socket();
  
  client.connect(BLENDER_MCP_PORT, 'localhost', () => {
    console.log('[Proxy] Connected to blender-mcp server');
  });

  client.on('data', (data) => {
    // Forward data from blender-mcp to all connected websocket clients
    const message = data.toString();
    console.log(`[Proxy] Received from blender-mcp: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  client.on('close', () => {
    console.log('[Proxy] Connection to blender-mcp closed');
    // Attempt to reconnect after a delay
    setTimeout(connectToMCPServer, 5000);
  });

  client.on('error', (err) => {
    console.log(`[Proxy] Connection error: ${err.message}`);
    client.destroy();
  });

  return client;
}

// Attempt initial connection to MCP server
function initMCPConnection() {
  try {
    mcpSocketClient = connectToMCPServer();
  } catch (err) {
    console.log(`[Proxy] Failed to connect to blender-mcp: ${err.message}`);
    console.log('[Proxy] Will retry in 5 seconds...');
    setTimeout(initMCPConnection, 5000);
  }
}

// Handle WebSocket connections from the web UI
wss.on('connection', (ws) => {
  console.log('[Proxy] Web UI connected');

  // If we're not connected to the MCP server yet, try to connect
  if (!mcpSocketClient || mcpSocketClient.destroyed) {
    initMCPConnection();
  }

  // Forward messages from web UI to blender-mcp
  ws.on('message', (message) => {
    if (mcpSocketClient && !mcpSocketClient.destroyed) {
      const data = message.toString();
      console.log(`[Proxy] Forwarding to blender-mcp: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
      mcpSocketClient.write(data);
    } else {
      console.log('[Proxy] Not connected to blender-mcp server, attempting to reconnect...');
      initMCPConnection();
    }
  });

  ws.on('close', () => {
    console.log('[Proxy] Web UI disconnected');
  });
});

// Start initial connection attempt
initMCPConnection();

// Handle proxy server shutdown
process.on('SIGINT', () => {
  console.log('[Proxy] Shutting down...');
  if (mcpSocketClient) {
    mcpSocketClient.destroy();
  }
  wss.close();
  process.exit();
});
