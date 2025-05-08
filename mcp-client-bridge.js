// MCP client bridge for web UI: natural language to Blender Python code
const express = require('express');
const bodyParser = require('body-parser');
const net = require('net');
const path = require('path');
const he = require('he');
const fetch = require('node-fetch');

const app = express();
const PORT = 3002;
const BLENDER_HOST = 'localhost';
const BLENDER_PORT = 9876;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';

// Serve static files (index.html, etc.) from the current directory
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Add CORS headers for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(bodyParser.json());

// POST /llm-agent
app.post('/llm-agent', async (req, res) => {
  console.log('--- /llm-agent endpoint hit ---');
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Use the comprehensive modular system prompt from blender-system-prompts.js
  const blenderPrompts = require('./blender-system-prompts.js');
  const systemPrompt = blenderPrompts.getComprehensiveSystemPrompt().join('\n');

  // Check for missing API key
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.startsWith('sk-or-v1-') && OPENROUTER_API_KEY.length < 40) {
    console.error('--- Missing or invalid OpenRouter API key ---');
    return res.status(500).json({ error: 'Missing or invalid OpenRouter API key' });
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  try {
    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages,
        max_tokens: 2048,
        temperature: 0.2
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('--- OpenRouter API Error ---');
      console.error('Status:', response.status, response.statusText);
      console.error('Error Body:', errText);
      return res.status(500).json({ error: 'OpenRouter error', details: errText });
    }
    const data = await response.json();
    // Log the raw LLM response for debugging
    console.log('--- Raw OpenRouter API Response ---');
    console.log(JSON.stringify(data, null, 2));

    let code = data.choices?.[0]?.message?.content || '';

    // --- Robust code cleaning ---
    // 1. Remove all HTML tags (e.g., <pre>, <b>, etc.)
    code = code.replace(/<[^>]+>/g, '');
    // 2. Remove markdown code fences if present
    code = code.replace(/^```python\s*|^```\s*|\s*```$/g, '');
    // 3. Decode HTML entities
    code = he.decode(code);
    // 4. Remove any explanation lines accidentally included
    if (code.includes('Explanation:')) code = code.split('Explanation:')[0].trim();
    // 5. Remove leading/trailing whitespace and blank lines
    code = code.split('\n').map(line => line.trimEnd()).join('\n').trim();
    // 6. Remove any remaining HTML entities
    code = code.replace(/&[a-zA-Z0-9#]+;/g, '');

    // 7. If code is a single line with semicolons, try to split into lines
    if (code.split('\n').length === 1 && code.includes(';')) {
      code = code.split(';').map(l => l.trim()).filter(Boolean).join('\n');
    }

    // 8. If code is still a single line, try to pretty-print basic Python blocks
    if (code.split('\n').length === 1 && (code.includes('if ') || code.includes('for ') || code.includes('def '))) {
      code = code.replace(/:/g, ':\n    ');
    }

    // 9. Remove any accidental HTML again
    code = code.replace(/<[^>]+>/g, '');

    // Log the cleaned code before sending to Blender
    console.log('--- Cleaned code to send to Blender MCP ---');
    console.log(code);
    console.log('-------------------------------');

    // If the code is not valid Python (e.g., contains no 'bpy'), return error
    if (!code || (!code.includes('bpy') && !code.includes('import bpy'))) {
      console.error('--- LLM did not return valid Blender Python code ---');
      return res.status(500).json({ error: 'LLM did not return valid Blender Python code', code });
    }
    // If the code is empty or still contains HTML, return error
    if (!code || /<[^>]+>/.test(code)) {
      console.error('--- Code is empty or still contains HTML tags ---');
      return res.status(500).json({ error: 'Code is empty or still contains HTML tags', code });
    }

    // Send code to Blender MCP
    const client = new net.Socket();
    let responseData = Buffer.alloc(0);
    let responded = false;
    client.connect(BLENDER_PORT, BLENDER_HOST, () => {
      client.write(JSON.stringify({ type: 'execute_code', params: { code } }));
    });
    client.on('data', (data) => {
      responseData = Buffer.concat([responseData, data]);
      // Log the raw response from Blender MCP for debugging
      console.log('--- Raw response from Blender MCP ---');
      console.log(responseData.toString('utf8'));
      console.log('-------------------------------------');
      try {
        const blenderResponse = JSON.parse(responseData.toString('utf8'));
        if (!responded) {
          // Stringify the Blender result for frontend display
          let blenderResult = blenderResponse;
          if (typeof blenderResult !== 'string') {
            try {
              blenderResult = JSON.stringify(blenderResult, null, 2);
            } catch (e) {
              blenderResult = String(blenderResult);
            }
          }
          // Check for success responses with empty result (common in Blender operations)
          if (blenderResponse && blenderResponse.status === 'success' && blenderResponse.result && blenderResponse.result.executed === true && (!blenderResponse.result.result || blenderResponse.result.result === '')) {
            blenderResult = 'Code executed successfully in Blender! (No output returned)';
          }
          // If Blender returns some other empty result or [No response], show a more informative message
          else if (!blenderResult || blenderResult === '[No response from Blender]' || blenderResult === '{}' || blenderResult === 'null') {
            blenderResult = 'No output or error from Blender. Check code validity and Blender MCP logs.';
          }
          res.json({ code, blenderResult });
          responded = true;
          client.destroy();
        }
      } catch (e) {
        // Not a complete JSON yet, wait for more data
      }
    });
    client.on('error', (err) => {
      if (!responded) {
        res.status(500).json({ error: 'Socket error: ' + err.message, details: err, code });
        responded = true;
      }
    });
    client.on('close', () => {
      if (!responded && !res.headersSent) {
        res.status(504).json({ error: 'No response from Blender MCP', code });
        responded = true;
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'LLM/Blender bridge error', details: err.message || String(err) });
  }
});

// POST /blender-mcp (pass-through to Blender MCP socket)
app.post('/blender-mcp', async (req, res) => {
  const { type, params } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing command type' });
  const client = new net.Socket();
  let responseData = Buffer.alloc(0);
  let responded = false;
  client.connect(BLENDER_PORT, BLENDER_HOST, () => {
    client.write(JSON.stringify({ type, params: params || {} }));
  });
  client.on('data', (data) => {
    responseData = Buffer.concat([responseData, data]);
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
    if (!responded) {
      res.status(500).json({ error: 'Socket error: ' + err.message, details: err });
      responded = true;
    }
  });
  client.on('close', () => {
    if (!responded && !res.headersSent) {
      res.status(504).json({ error: 'No response from Blender MCP' });
      responded = true;
    }
  });
});

app.listen(PORT, () => {
  console.log(`MCP client bridge listening on http://localhost:${PORT}`);
});