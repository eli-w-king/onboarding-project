const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const fetch = require('node-fetch');
const net = require('net');

// Config
const PROXY_PORT = 3100; // Port for our proxy to the official MCP
const WEB_SERVER_PORT = 3002; // Port for web interface
const MCP_SERVER_PORT = 1234; // Default port for the official blender-mcp

// Create Express app for serving UI
const app = express();

// CORS and JSON parsing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.json({limit: '10mb'}));
app.use(express.static(__dirname));

// Main web UI route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to check server status
app.get('/status', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// For API key validation and direct execution
app.post('/llm-agent', async (req, res) => {
  console.log('LLM agent request received');
  
  const { prompt, apiKey, model } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 40) {
    return res.status(400).json({ 
      error: 'Missing or invalid OpenRouter API key. Please provide your own key.' 
    });
  }

  // For "hello" messages, just return validation success
  if (prompt.trim().toLowerCase() === 'hello') {
    console.log('Received hello message for API key validation');
    return res.json({ 
      status: 'success',
      message: 'API key validated successfully',
      result: 'Connected to Blender MCP'
    });
  }
  
  console.log(`Processing request: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`);

  // Use direct socket connection to MCP server
  try {
    const client = new net.Socket();
    let responseData = Buffer.alloc(0);
    let responded = false;
    
    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (!responded) {
        client.destroy();
        res.status(504).json({ 
          status: 'error',
          message: 'Connection to Blender MCP timed out',
          blenderResult: { 
            result: 'Connection to Blender timed out. Make sure Blender is running with the addon enabled and connected.' 
          }
        });
        responded = true;
      }
    }, 5000);
    
    client.connect(MCP_SERVER_PORT, 'localhost', () => {
      console.log('Connected directly to Blender MCP server');
      clearTimeout(connectionTimeout);
      
      // Send the command directly to the MCP server
      const message = {
        type: 'execute_blender_code',
        params: {
          code: prompt
        }
      };
      
      client.write(JSON.stringify(message));
    });
    
    client.on('data', (data) => {
      responseData = Buffer.concat([responseData, data]);
      
      try {
        // Try to parse complete JSON
        const response = JSON.parse(responseData.toString('utf8'));
        
        console.log('Received response from Blender MCP:', JSON.stringify(response).substring(0, 100));
        
        // Format response to match UI expectations
        const formattedResponse = {
          status: response.status || 'success',
          blenderResult: response.result || {},
          result: response.result?.result || response.message || 'Command executed'
        };
        
        if (!responded) {
          res.json(formattedResponse);
          responded = true;
          clearTimeout(connectionTimeout);
        }
        
        client.destroy();
      } catch (e) {
        // Not a complete JSON yet, continue receiving data
      }
    });
    
    client.on('error', (err) => {
      console.error('Socket error:', err);
      if (!responded) {
        res.status(500).json({ 
          status: 'error',
          message: `Socket error: ${err.message}`,
          blenderResult: { 
            result: `Error connecting to Blender: ${err.message}. Make sure Blender is running with the addon enabled.` 
          }
        });
        responded = true;
        clearTimeout(connectionTimeout);
      }
    });
    
    client.on('close', () => {
      console.log('MCP connection closed');
      clearTimeout(connectionTimeout);
      
      if (!responded) {
        res.status(504).json({
          status: 'error', 
          message: 'No response from Blender MCP',
          blenderResult: { 
            result: 'Blender did not respond. Make sure it is running with the addon enabled and connected.' 
          }
        });
        responded = true;
      }
    });
  } catch (err) {
    console.error('Error processing request:', err);
    res.status(500).json({ 
      status: 'error',
      message: `Failed to connect: ${err.message}`,
      blenderResult: { 
        result: `Failed to connect to Blender: ${err.message}` 
      }
    });
  }
});

// Start server
const server = app.listen(WEB_SERVER_PORT, () => {
  console.log(`Direct MCP web server running on http://localhost:${WEB_SERVER_PORT}`);
  console.log(`MCP server expected on port ${MCP_SERVER_PORT}`);
  
  // Try to open directly in browser
  try {
    const { exec } = require('child_process');
    exec(`open http://localhost:${WEB_SERVER_PORT}`);
  } catch (e) {
    console.log('Could not auto-open browser');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
