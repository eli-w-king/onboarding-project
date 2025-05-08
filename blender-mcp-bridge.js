const express = require('express');
const bodyParser = require('body-parser');
const net = require('net');
const path = require('path');

const app = express();
const PORT = 3001; // The port your web frontend will call

// Serve the static HTML UI at /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const BLENDER_HOST = 'localhost';
const BLENDER_PORT = 9876;

// Add CORS headers for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json());

// POST /blender-mcp
// { "type": "command_type", "params": { ... } }
app.post('/blender-mcp', async (req, res) => {
  const { type, params } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'Missing command type' });
  }

  // Connect to Blender MCP socket
  const client = new net.Socket();
  let responseData = Buffer.alloc(0);
  let responded = false;

  client.connect(BLENDER_PORT, BLENDER_HOST, () => {
    // Send command as JSON
    client.write(JSON.stringify({ type, params: params || {} }));
  });

  client.on('data', (data) => {
    responseData = Buffer.concat([responseData, data]);
    // Try to parse as JSON
    try {
      const response = JSON.parse(responseData.toString('utf8'));
      res.json(response);
      responded = true;
      client.destroy();
    } catch (e) {
      // Not a complete JSON yet, wait for more data
    }
  });

  client.on('error', (err) => {
    console.error('Socket error:', err);
    if (!responded) {
      res.status(500).json({ error: 'Socket error: ' + err.message, details: err });
      responded = true;
    }
  });

  client.on('close', () => {
    // If we never sent a response, send a timeout
    if (!responded && !res.headersSent) {
      console.error('No response from Blender MCP (timeout or closed connection)');
      res.status(504).json({ error: 'No response from Blender MCP' });
      responded = true;
    }
  });
});

app.listen(PORT, () => {
  console.log(`Blender MCP bridge listening on http://localhost:${PORT}`);
});
