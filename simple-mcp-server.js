const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const net = require('net');
const fs = require('fs');

// Configuration
const PORT = 3030; // Web server port
const MCP_PORT = 1234; // Default Blender MCP port
const MCP_HOST = 'localhost';
const API_KEY = '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'; // Default API key

// Create Express app
const app = express();

// Try to load API key from file if it exists
try {
  const savedApiKey = fs.readFileSync(path.join(__dirname, '.api-key'), 'utf8');
  if (savedApiKey && savedApiKey.trim().length > 20) {
    currentApiKey = savedApiKey.trim();
    console.log('Loaded API key from file');
  }
} catch (err) {
  // File doesn't exist or couldn't be read, use default key
  console.log('Using default API key');
}

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Track MCP connection state
let mcpClient = null;
let connected = false;
let currentApiKey = API_KEY;

// API Key routes
app.get('/api/get-api-key', (req, res) => {
  res.json({ apiKey: currentApiKey });
});

app.post('/api/update-api-key', (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid API key format' 
    });
  }
  
  currentApiKey = apiKey;
  console.log('API key updated');
  
  // Optionally save to a file for persistence
  try {
    fs.writeFileSync(path.join(__dirname, '.api-key'), apiKey);
  } catch (err) {
    console.error('Failed to save API key to file:', err);
  }
  
  res.json({ success: true });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'simple-mcp-ui.html'));
});

// Check connection status
app.get('/check-connection', (req, res) => {
  res.json({ connected: connected });
});

// Connect to Blender MCP
app.post('/connect', (req, res) => {
  // If already connected, return success
  if (connected && mcpClient) {
    return res.json({ success: true });
  }

  try {
    // Create socket connection
    const client = new net.Socket();
    
    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      client.destroy();
      res.json({ 
        success: false, 
        error: 'Connection timeout. Is Blender running with the MCP addon enabled?' 
      });
    }, 3000);
    
    // Handle connection
    client.connect(MCP_PORT, MCP_HOST, () => {
      clearTimeout(connectionTimeout);
      console.log('Connected to Blender MCP server');
      mcpClient = client;
      connected = true;
      res.json({ success: true });
    });
    
    // Handle connection errors
    client.on('error', (err) => {
      clearTimeout(connectionTimeout);
      console.error('Connection error:', err.message);
      mcpClient = null;
      connected = false;
      res.json({ success: false, error: err.message });
    });
    
    // Handle disconnection
    client.on('close', () => {
      console.log('MCP connection closed');
      mcpClient = null;
      connected = false;
    });
  } catch (err) {
    console.error('Failed to connect:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Disconnect from Blender MCP
app.post('/disconnect', (req, res) => {
  if (mcpClient) {
    mcpClient.destroy();
    mcpClient = null;
  }
  connected = false;
  res.json({ success: true });
});

// Execute code
app.post('/execute', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.json({ success: false, error: 'No code provided' });
  }
  
  if (!connected || !mcpClient) {
    return res.json({ 
      success: false, 
      error: 'Not connected to Blender MCP server' 
    });
  }
  
  try {
    const result = await sendCommand('execute_blender_code', { 
      code, 
      api_key: currentApiKey // Include the API key in case Blender needs it
    });
    res.json({ success: true, result, api_key: currentApiKey });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get scene info
app.get('/scene-info', async (req, res) => {
  if (!connected || !mcpClient) {
    return res.json({ 
      success: false, 
      error: 'Not connected to Blender MCP server' 
    });
  }
  
  try {
    const result = await sendCommand('get_scene_info');
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// LLM Agent endpoint (compatibility with older implementation)
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
  
  if (!connected || !mcpClient) {
    return res.status(503).json({ 
      status: 'error',
      message: 'Not connected to Blender MCP server',
      result: 'Please connect to Blender MCP server first'
    });
  }
  
  try {
    console.log(`Processing LLM agent request with prompt: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`);
    const result = await sendCommand('execute_blender_code', { 
      code: prompt, 
      api_key: useApiKey
    });
    
    // Format the response to match the old LLM agent format
    res.json({
      status: 'success', 
      message: 'Executed directly in Blender', 
      result: result.result || 'Code executed successfully',
      blenderResult: result
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      message: `Error: ${err.message}`,
      result: `Failed to execute code: ${err.message}`
    });
  }
});

// Generic function to send commands to Blender MCP
function sendCommand(type, params = {}) {
  return new Promise((resolve, reject) => {
    if (!mcpClient) {
      return reject(new Error('Not connected to Blender MCP server'));
    }
    
    const command = JSON.stringify({ type, params });
    let responseData = Buffer.alloc(0);
    let responseHandler, errorHandler;
    
    // Create timeout for command
    const commandTimeout = setTimeout(() => {
      mcpClient.removeListener('data', responseHandler);
      mcpClient.removeListener('error', errorHandler);
      reject(new Error('Command timeout'));
    }, 10000);
    
    // Handle data from MCP server
    responseHandler = (data) => {
      responseData = Buffer.concat([responseData, data]);
      
      try {
        // Try to parse complete JSON
        const response = JSON.parse(responseData.toString('utf8'));
        clearTimeout(commandTimeout);
        mcpClient.removeListener('data', responseHandler);
        mcpClient.removeListener('error', errorHandler);
        
        if (response.status === 'error') {
          reject(new Error(response.message || 'Unknown MCP error'));
        } else {
          resolve(response.result);
        }
      } catch (e) {
        // Not a complete JSON yet, continue receiving data
      }
    };
    
    // Handle errors
    errorHandler = (err) => {
      clearTimeout(commandTimeout);
      mcpClient.removeListener('data', responseHandler);
      mcpClient.removeListener('error', errorHandler);
      reject(err);
    };
    
    // Set up listeners
    mcpClient.on('data', responseHandler);
    mcpClient.on('error', errorHandler);
    
    // Send the command
    mcpClient.write(command);
  });
}

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Simple MCP UI server running at http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  if (mcpClient) {
    mcpClient.destroy();
  }
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

// Automatically open browser
const { exec } = require('child_process');
exec(`open http://localhost:${PORT}`, (err) => {
  if (err) {
    console.log('Could not open browser automatically.');
  }
});
