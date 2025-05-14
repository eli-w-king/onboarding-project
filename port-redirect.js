// This is a simple port redirection server that takes requests 
// from port 3002 and redirects them to port 3030
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');

const OLD_PORT = 3002; // The old port clients are trying to access
const NEW_PORT = 3030; // The new port where the service is actually running

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Handle all GET requests
app.get('/*', async (req, res) => {
  try {
    console.log(`Redirecting GET ${req.originalUrl} to port ${NEW_PORT}`);
    const response = await fetch(`http://localhost:${NEW_PORT}${req.originalUrl}`, {
      method: 'GET',
      headers: req.headers
    });
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const data = await response.text();
      return res.status(response.status).send(data);
    }
  } catch (error) {
    console.error(`Error redirecting request: ${error.message}`);
    return res.status(502).json({ error: 'Error redirecting request', details: error.message });
  }
});

// Handle all POST requests
app.post('/*', async (req, res) => {
  try {
    console.log(`Redirecting POST ${req.originalUrl} to port ${NEW_PORT}`);
    console.log('Request body:', JSON.stringify(req.body));
    
    // Special handling for /llm-agent endpoint
    if (req.originalUrl === '/llm-agent') {
      console.log('LLM agent request detected, adding additional logging');
    }
    
    const response = await fetch(`http://localhost:${NEW_PORT}${req.originalUrl}`, {
      method: 'POST',
      headers: {
        ...req.headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const data = await response.text();
      return res.status(response.status).send(data);
    }
  } catch (error) {
    console.error(`Error redirecting request: ${error.message}`);
    return res.status(502).json({ error: 'Error redirecting request', details: error.message });
  }
});

// Start the server
app.listen(OLD_PORT, () => {
  console.log(`Port redirector running at http://localhost:${OLD_PORT}`);
  console.log(`Redirecting requests to http://localhost:${NEW_PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down port redirector...');
  process.exit(0);
});
