
const express = require('express');
const bodyParser = require('body-parser');
const net = require('net');
const path = require('path');

const app = express();
const PORT = 3001; // The port your web frontend will call

// Integrate API key update router
const apiKeyRouter = require('./api-key-routes.js');
app.use(apiKeyRouter);

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

  // If this is a code execution request, sanitize the code
  if (type === 'execute_code' && params && params.code) {
    try {
      const originalCode = params.code;
      let code = params.code;
      
      // Check for the common problematic line pattern that has appeared multiple times in logs
      if (code.includes('radius = circle_tube.dimensions.x e_step = 2 * math.pi res')) {
        console.log('Detected specific problematic line pattern, replacing with correct code');
        code = code.replace(
          'radius = circle_tube.dimensions.x e_step = 2 * math.pi res',
          'radius = circle_tube.dimensions.x / 2\nangle_step = 2 * math.pi / num_spheres'
        );
      }
      
      // Split the code into lines and analyze each line
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for lines that appear to have multiple variable assignments without proper line breaks
        if (line.match(/\w+\s*=\s*[\w\.]+\s+\w+\s*=/) || 
            line.match(/=\s*[\w\.]+\s+\w+/) ||
            line.includes(' e_step =') || 
            line.includes(' res')) {
          
          console.log(`Fixing problematic line: "${lines[i]}"`);
          
          // Most aggressive approach: if a line contains both "radius" and "e_step" or similar patterns,
          // just replace it entirely with a known good version
          if (line.includes('radius') && (line.includes('e_step') || line.includes('res'))) {
            lines[i] = 'radius = circle_tube.dimensions.x / 2\nangle_step = 2 * math.pi / num_spheres';
          } else {
            // Otherwise try to fix the syntax
            lines[i] = lines[i]
              .replace(/(\w+)\s*=\s*([\w\.]+)\s+e_step/g, '$1 = $2 / 2\nangle_step')
              .replace(/(\w+)\s*=\s*([\w\.]+)\s+(\w+)\s*=/g, '$1 = $2\n$3 =')
              .replace(/(\w+)\s*=\s*([\w\.]+)\s+res/g, '$1 = $2 / num_spheres')
              .replace(/e_step\s*=\s*([\d\.]+\s*\*\s*[\w\.]+)\s+res/g, 'angle_step = $1 / num_spheres');
          }
        }
      }
      code = lines.join('\n');
      
      // If we changed the code, log the changes
      if (originalCode !== code) {
        console.log('Code sanitized:');
        console.log('Before:', originalCode);
        console.log('After:', code);
        params.code = code;
      }
    } catch (err) {
      console.error('Error sanitizing code:', err);
      // Continue with the original code if sanitizing fails
    }
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
