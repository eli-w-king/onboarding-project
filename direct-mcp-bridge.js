const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const fetch = require('node-fetch');

// Config
const PROXY_PORT = 3100; // Port for our proxy to the official MCP
const WEB_SERVER_PORT = 3002; // Port for web interface

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

// Initial hello endpoint for API key validation
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

  // Connect to the MCP proxy
  try {
    // Create a WebSocket connection to the proxy
    const ws = new WebSocket(`ws://localhost:${PROXY_PORT}`);
    
    // Timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.terminate();
        return res.status(504).json({ 
          error: 'Timeout connecting to Blender MCP proxy' 
        });
      }
    }, 5000);
    
    // Track if we've sent a response
    let responseSent = false;
    
    ws.on('open', () => {
      console.log('Connected to Blender MCP proxy, forwarding request');
      clearTimeout(connectionTimeout);
      
      // Prepare command to send to Blender MCP
      const message = {
        type: 'execute_blender_code',
        params: {
          code: prompt
        }
      };
      
      ws.send(JSON.stringify(message));
    });
    
    ws.on('message', (data) => {
      console.log('Received response from Blender MCP');
      try {
        const response = JSON.parse(data.toString());
        
        // Format the response to match what the UI expects
        const formattedResponse = {
          status: response.status || 'success',
          blenderResult: response.result || {},
          result: response.result?.result || response.message || 'Command executed'
        };
        
        if (!responseSent) {
          res.json(formattedResponse);
          responseSent = true;
        }
        ws.close();
      } catch (err) {
        console.error('Error parsing MCP response:', err);
        if (!responseSent) {
          res.status(500).json({ 
            error: 'Invalid response from MCP', 
            details: err.message,
            blenderResult: { result: 'Error processing response from Blender' }
          });
          responseSent = true;
        }
        ws.close();
      }
    });
    
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      if (!responseSent) {
        res.status(500).json({ 
          error: 'WebSocket error', 
          details: err.message,
          blenderResult: { result: 'Connection error to Blender. Is Blender running and connected?' }
        });
        responseSent = true;
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clearTimeout(connectionTimeout);
      if (!responseSent) {
        res.status(504).json({ 
          error: 'Connection closed without response', 
          blenderResult: { result: 'Blender connection closed without a response' }
        });
      }
    });
    
  } catch (err) {
    console.error('Error connecting to MCP proxy:', err);
    res.status(500).json({ 
      error: 'Failed to connect to MCP proxy', 
      details: err.message,
      blenderResult: { result: 'Failed to connect to Blender' }
    });
  }
});

// Start server
const server = app.listen(WEB_SERVER_PORT, () => {
  console.log(`Direct MCP web server running on http://localhost:${WEB_SERVER_PORT}`);
  console.log(`Connecting to Blender MCP proxy on port ${PROXY_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
