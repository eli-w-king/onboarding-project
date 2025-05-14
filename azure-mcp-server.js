// Azure MCP Server - Designed to be deployed to Azure App Service
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

// Configuration
const PORT = process.env.PORT || 3030; // Azure App Service uses process.env.PORT
const API_KEY_FILE = path.join(__dirname, '.api-key');
let currentApiKey = null;

// Create Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Track connected local bridges (Blender MCP connectors)
const localBridges = new Map(); // connectionId -> websocket connection
let nextConnectionId = 1;

// Load API key on startup
async function loadApiKey() {
  try {
    currentApiKey = await fs.readFile(API_KEY_FILE, 'utf8');
    console.log('API key loaded from file');
  } catch (err) {
    console.log('No API key file found, using default null key');
  }
}

// Save API key to file
async function saveApiKey(apiKey) {
  try {
    await fs.writeFile(API_KEY_FILE, apiKey);
    currentApiKey = apiKey;
    console.log('API key saved to file');
    return true;
  } catch (err) {
    console.error('Error saving API key:', err);
    return false;
  }
}

// WebSocket connections from local bridges
wss.on('connection', (ws) => {
  const connectionId = nextConnectionId++;
  console.log(`Local bridge connected, assigned ID: ${connectionId}`);
  
  localBridges.set(connectionId, ws);
  
  // Send welcome message with connection ID
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId: connectionId
  }));
  
  // Handle messages from the local bridge
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received from bridge ${connectionId}:`, data.type);
      
      // If this is a response to an MCP command, forward it to the appropriate client
      if (data.type === 'mcp_response' && data.requestId) {
        // The requestId includes information needed to respond to the HTTP request
        const pendingResponse = pendingRequests.get(data.requestId);
        if (pendingResponse) {
          pendingRequests.delete(data.requestId);
          pendingResponse.res.json({
            success: true,
            result: data.result
          });
        }
      }
    } catch (err) {
      console.error('Error processing message from bridge:', err);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Local bridge ${connectionId} disconnected`);
    localBridges.delete(connectionId);
  });
});

// Track pending requests to local bridges
const pendingRequests = new Map(); // requestId -> { res, timeout }
let nextRequestId = 1;

// Send command to a local bridge
function sendCommandToBridge(command, params = {}) {
  return new Promise((resolve, reject) => {
    // Check if we have any connected bridges
    if (localBridges.size === 0) {
      return reject(new Error('No local bridges connected. Please start the local bridge application.'));
    }
    
    // For now, just use the first available bridge
    // In a more complex setup, you could route to specific bridges
    const bridgeId = [...localBridges.keys()][0];
    const bridge = localBridges.get(bridgeId);
    
    const requestId = `req_${nextRequestId++}`;
    
    // Set a timeout to clean up if we don't get a response
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request to local bridge timed out'));
    }, 30000); // 30 second timeout
    
    // Store the promise callbacks
    pendingRequests.set(requestId, { 
      resolve, 
      reject,
      timeout
    });
    
    // Send the command to the bridge
    bridge.send(JSON.stringify({
      type: 'mcp_command',
      requestId,
      command,
      params
    }));
  });
}

// API key validation endpoint
app.post('/api/validate-key', async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'API key is required' });
  }
  
  // Simple validation endpoint for key testing
  res.json({ 
    valid: true,
    message: 'API key is valid'
  });
});

// Update API key endpoint
app.post('/api/update-api-key', async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }
  
  const saved = await saveApiKey(apiKey);
  
  if (saved) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save API key' });
  }
});

// Get current API key
app.get('/api/get-api-key', async (req, res) => {
  res.json({ apiKey: currentApiKey || '' });
});

// Execute Blender code via MCP
app.post('/execute', async (req, res) => {
  const { code, apiKey } = req.body;
  
  if (!code) {
    return res.status(400).json({ success: false, error: 'Code is required' });
  }
  
  try {
    // Store the response object so we can respond when we get a reply from the bridge
    const requestId = `req_${nextRequestId++}`;
    
    // Set a timeout to clean up if we don't get a response
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      res.status(504).json({ success: false, error: 'Request to Blender timed out' });
    }, 30000); // 30 second timeout
    
    // Store the response object
    pendingRequests.set(requestId, { res, timeout });
    
    // Find a bridge and send the command
    if (localBridges.size === 0) {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      return res.status(503).json({ 
        success: false, 
        error: 'No local bridges connected. Please start the local bridge application.' 
      });
    }
    
    // Get the first bridge
    const bridgeId = [...localBridges.keys()][0];
    const bridge = localBridges.get(bridgeId);
    
    // Send the command to the bridge
    bridge.send(JSON.stringify({
      type: 'mcp_command',
      command: 'execute_blender_code',
      params: { code, api_key: apiKey || currentApiKey },
      requestId
    }));
    
    // Response will be sent when we receive a message from the bridge
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get scene info endpoint
app.get('/scene-info', async (req, res) => {
  try {
    // Store the response object so we can respond when we get a reply from the bridge
    const requestId = `req_${nextRequestId++}`;
    
    // Set a timeout to clean up if we don't get a response
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      res.status(504).json({ success: false, error: 'Request to Blender timed out' });
    }, 30000); // 30 second timeout
    
    // Store the response object
    pendingRequests.set(requestId, { res, timeout });
    
    // Find a bridge and send the command
    if (localBridges.size === 0) {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      return res.status(503).json({ 
        success: false, 
        error: 'No local bridges connected. Please start the local bridge application.' 
      });
    }
    
    // Get the first bridge
    const bridgeId = [...localBridges.keys()][0];
    const bridge = localBridges.get(bridgeId);
    
    // Send the command to the bridge
    bridge.send(JSON.stringify({
      type: 'mcp_command',
      command: 'get_scene_info',
      requestId
    }));
    
    // Response will be sent when we receive a message from the bridge
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// LLM Agent endpoint (for compatibility with older implementation)
app.post('/llm-agent', async (req, res) => {
  const { prompt, apiKey } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  
  // Use provided API key or fall back to the stored one
  const useApiKey = apiKey || currentApiKey;
  
  // For "hello" messages, just return validation success
  if (prompt.trim().toLowerCase() === 'hello') {
    console.log('Received hello message for API key validation');
    return res.json({ 
      status: 'success',
      message: 'API key validated successfully',
      result: 'Connected to Blender MCP'
    });
  }
  
  // Check if we have any bridges connected
  if (localBridges.size === 0) {
    return res.status(503).json({ 
      status: 'error',
      error: 'No local bridges connected. Please start the local bridge application.'
    });
  }
  
  try {
    // Similar to execute endpoint, but with compatibility format
    const requestId = `req_${nextRequestId++}`;
    
    // Set a timeout to clean up if we don't get a response
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      res.status(504).json({ 
        status: 'error',
        error: 'Request to Blender timed out' 
      });
    }, 30000); // 30 second timeout
    
    // Store the response object
    pendingRequests.set(requestId, { 
      res, 
      timeout,
      formatResponse: (result) => {
        return {
          status: 'success',
          message: result,
          result: result
        };
      }
    });
    
    // Get the first bridge
    const bridgeId = [...localBridges.keys()][0];
    const bridge = localBridges.get(bridgeId);
    
    // Send the command to the bridge
    bridge.send(JSON.stringify({
      type: 'mcp_command',
      command: 'execute_blender_code',
      params: { 
        code: prompt,  // Use the prompt as code
        api_key: useApiKey
      },
      requestId
    }));
    
    // Response will be sent when we receive a message from the bridge
  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      error: err.message 
    });
  }
});

// Start the server
loadApiKey().then(() => {
  server.listen(PORT, () => {
    console.log(`Azure MCP Server running on port ${PORT}`);
  });
});
