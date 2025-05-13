// MCP client bridge for web UI: natural language to Blender Python code
const express = require('express');
const bodyParser = require('body-parser');
const net = require('net');
const path = require('path');
const he = require('he');
const fetch = require('node-fetch');
const fs = require('fs');

// Load environment variables from .env file if it exists
try {
  const envConfig = fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, value] = line.split('=');
      if (key && value) process.env[key.trim()] = value.trim();
      return acc;
    }, {});
  console.log('Loaded environment variables from .env file');
} catch (err) {
  console.log('No .env file found or error reading it:', err.code);
}

const app = express();
const PORT = 3002;
const BLENDER_HOST = 'localhost';
const BLENDER_PORT = 9876;


// BYOK: No API key is ever loaded from .env or hardcoded. Key must be provided by the frontend per request.

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



  // BYOK: Require API key from frontend per request
  const OPENROUTER_API_KEY = req.body.apiKey;
  if (!OPENROUTER_API_KEY || typeof OPENROUTER_API_KEY !== 'string' || OPENROUTER_API_KEY.length < 40) {
    return res.status(400).json({ error: 'Missing or invalid OpenRouter API key. Please provide your own key.' });
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
        'HTTP-Referer': 'https://github.com',
        'X-Title': 'Blender LLM Bridge'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-preview:thinking',
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

    // Expecting LLM to always return a JSON object in .content
    let llmContent = data.choices?.[0]?.message?.content || '';
    
    // Clean up the content if it's wrapped in code blocks
    llmContent = llmContent.replace(/^```json\s*|\s*```$/g, '');
    llmContent = llmContent.replace(/^```\s*|\s*```$/g, '');
    
    let parsed;
    console.log("Attempting to parse LLM response JSON");
    try {
      // Step 1: Try direct JSON parsing
      parsed = JSON.parse(llmContent);
      console.log("Direct JSON parsing succeeded");
    } catch (e1) {
      try {
        // Step 2: Try replacing single quotes with double quotes
        const jsonWithDoubleQuotes = llmContent.replace(/'/g, '"');
        parsed = JSON.parse(jsonWithDoubleQuotes);
        console.log("JSON parsing with single-to-double quotes succeeded");
      } catch (e2) {
        try {
          // Step 3: Handle escaped quotes and control characters
          const cleaned = llmContent
            .replace(/\\n/g, '\\\\n') // Double escape newlines
            .replace(/\\'/g, "'")     // Unescape single quotes
            .replace(/\\"/g, '\\\\"') // Properly escape double quotes
            .replace(/'/g, '"');      // Replace all single quotes with double quotes
          parsed = JSON.parse(cleaned);
          console.log("JSON parsing with cleaned content succeeded");
        } catch (e3) {
          try {
            // Step 4: Manually extract the components using regex
            const typeMatch = llmContent.match(/['"]type['"]\\s*:\\s*['"]([^'"]*)["']/);
            const messageMatch = llmContent.match(/['"]message['"]\\s*:\\s*['"]([^'"]*)["']/);
            const codeStartIndex = llmContent.indexOf('code') + 6;
            const messageStartIndex = llmContent.indexOf('message');
            let codeMatch = null;
            
            if (codeStartIndex > 6) {
              const afterCode = llmContent.substring(codeStartIndex);
              const valueStart = afterCode.indexOf("'") > -1 ? 
                afterCode.indexOf("'") + 1 : afterCode.indexOf('"') + 1;
              
              if (valueStart > 0) {
                const remainingText = afterCode.substring(valueStart);
                const valueEnd = remainingText.indexOf("'") > -1 ? 
                  remainingText.indexOf("'") : remainingText.indexOf('"');
                
                if (valueEnd > -1) {
                  codeMatch = [null, remainingText.substring(0, valueEnd)];
                }
              }
            }
          } catch (e4) {
            console.error('Error in regex extraction:', e4);
          }
          
          if (typeMatch && messageMatch) {
            parsed = {
              type: typeMatch[1],
              message: messageMatch[1],
              code: codeMatch ? codeMatch[1] : ''
            };
          } else {
            // If regex extraction fails, use a brute force approach for handling escaped quotes
            const normalizedContent = llmContent
              .replace(/\\'/g, "\u0027") // Replace escaped single quotes with a placeholder
              .replace(/\\"/g, "\u0022") // Replace escaped double quotes with a placeholder
              .replace(/'/g, '"')        // Replace all single quotes with double quotes
              .replace(/\u0027/g, "'")   // Put back the escaped single quotes
              .replace(/\u0022/g, '\\"'); // Put back the escaped double quotes
            
            try {
              parsed = JSON.parse(normalizedContent);
            } catch (normalizedError) {
              console.error('JSON parsing error (all attempts failed):', normalizedError);
              console.error('Content that failed to parse:', llmContent);
              
              // Last resort: create a simplified object from what we can extract
              if (llmContent.includes('blender_command') && llmContent.includes('message')) {
                const codeStartIndex = llmContent.indexOf('code') + 6;
                const codeEndIndex = llmContent.indexOf('message') - 2;
                const messageStartIndex = llmContent.indexOf('message') + 10;
                const messageEndIndex = llmContent.lastIndexOf('}') - 1;
                
                let extractedCode = '';
                if (codeStartIndex < codeEndIndex) {
                  extractedCode = llmContent.substring(codeStartIndex, codeEndIndex).trim();
                  if (extractedCode.startsWith("'") || extractedCode.startsWith('"')) {
                    extractedCode = extractedCode.substring(1);
                  }
                  if (extractedCode.endsWith("'") || extractedCode.endsWith('"')) {
                    extractedCode = extractedCode.substring(0, extractedCode.length - 1);
                  }
                }
                
                let extractedMessage = '';
                if (messageStartIndex < messageEndIndex) {
                  extractedMessage = llmContent.substring(messageStartIndex, messageEndIndex).trim();
                  if (extractedMessage.startsWith("'") || extractedMessage.startsWith('"')) {
                    extractedMessage = extractedMessage.substring(1);
                  }
                  if (extractedMessage.endsWith("'") || extractedMessage.endsWith('"')) {
                    extractedMessage = extractedMessage.substring(0, extractedMessage.length - 1);
                  }
                }
                
                parsed = {
                  type: 'blender_command',
                  message: extractedMessage || 'Command executed successfully',
                  code: extractedCode
                };
              } else {
                return res.status(500).json({ 
                  error: 'LLM did not return valid JSON format', 
                  message: 'Sorry, there was an issue processing the response. Please try again.' 
                });
              }
            }
          }
        }
      }
    }

    // Always send a message to the frontend
    if (parsed.type === 'blender_command') {
      // Clean code for Blender
      let code = parsed.code || '';
      code = code.replace(/<[^>]+>/g, '');
      code = code.replace(/^```python\s*|^```\s*|\s*```$/g, '');
      code = he.decode(code);
      if (code.includes('Explanation:')) code = code.split('Explanation:')[0].trim();
      code = code.split('\n').map(line => line.trimEnd()).join('\n').trim();
      code = code.replace(/&[a-zA-Z0-9#]+;/g, '');
      if (code.split('\n').length === 1 && code.includes(';')) {
        code = code.split(';').map(l => l.trim()).filter(Boolean).join('\n');
      }
      if (code.split('\n').length === 1 && (code.includes('if ') || code.includes('for ') || code.includes('def '))) {
        code = code.replace(/:/g, ':\n    ');
      }
      code = code.replace(/<[^>]+>/g, '');
      
      // Advanced code cleanup and syntax error correction
      console.log("Pre-sanitized code:", code);
      
      // Fix mathutils imports and references
      code = code.replace(/from bpy import mathutils/g, 'from mathutils import Vector, Matrix'); 
      code = code.replace(/bpy\.mathutils\.Vector/g, 'Vector');
      code = code.replace(/bpy\.mathutils/g, 'mathutils');
      
      // Fix missing division operators in numeric expressions
      code = code.replace(/(\d+)\s+(\d+)/g, '$1 / $2'); // "2 2" → "2 / 2" 
      
      // Fix missing/corrupted operators in variable assignments
      code = code.replace(/([a-zA-Z0-9_\.]+)\s+e_step/g, '$1 / 2\nangle_step');
      code = code.replace(/(\d+)\s+\*\s+([a-zA-Z0-9_\.]+)\s+res/g, '$1 * $2 / num_spheres');
      
      // Fix incomplete lines that might have been truncated
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Detect truly incomplete assignments or lines ending with an operator
        const trimmed = lines[i].trim();
        // Flag only lines that end with an assignment operator and nothing after, or end with an operator
        if (/^[a-zA-Z0-9_\.]+\s*=\s*$/.test(trimmed) || /[+\-*/=]\s*$/.test(trimmed)) {
          lines[i] += ' # Missing value or operator - auto-fixed';
        }

        // Look for variable names directly next to operators without spaces
        lines[i] = lines[i].replace(/([a-zA-Z0-9_]+)([+\-*/])([a-zA-Z0-9_]+)/g, '$1 $2 $3');
      }
      code = lines.join('\n');
      
      // Add proper imports if they're missing
      if (code.includes('Vector') && !code.includes('from mathutils import Vector')) {
        code = 'from mathutils import Vector\n' + code;
      }
      
      console.log("Post-sanitized code:", code);
      // If the code is not valid Python (e.g., contains no 'bpy'), return error
      if (!code || (!code.includes('bpy') && !code.includes('import bpy'))) {
        return res.status(500).json({ error: 'LLM did not return valid Blender Python code', code });
      }
      
      // Ensure viewport is in MATERIAL mode for better visibility
      if (!code.includes('space.shading.type') && !code.includes('shading.type')) {
        code = `# Set viewport shading to MATERIAL preview for better visualization
for area in bpy.context.screen.areas:
    if area.type == "VIEW_3D":
        for space in area.spaces:
            if space.type == "VIEW_3D":
                space.shading.type = "MATERIAL"
                
` + code;
      }
      
      // Ensure objects are added to collections by appending collection linking code
      // Only if we detect object creation but no collection linking
      if ((code.includes('.primitive_') || code.includes('new(') || code.includes('.create(')) && 
          !code.includes('.objects.link(') && !code.includes('collection.objects.link')) {
        code += `

# Ensure all objects are in the main collection for visibility
main_collection = bpy.context.scene.collection.children.get("Collection")
if not main_collection:
    main_collection = bpy.context.scene.collection
    
# Link all objects that aren't already in a collection
for obj in bpy.context.scene.objects:
    if len(obj.users_collection) == 0:
        try:
            main_collection.objects.link(obj)
            print(f"Added {obj.name} to the main collection")
        except Exception as e:
            print(f"Could not add {obj.name} to collection: {e}")
`;
      }
      // Send code to Blender MCP, but always send the message to the frontend
      const client = new net.Socket();
      let responseData = Buffer.alloc(0);
      let responded = false;
      const connectionTimeout = setTimeout(() => {
        if (!responded) {
          res.status(504).json({ error: 'Connection timeout while connecting to Blender MCP. Make sure Blender is running with MCP add-on.', code, message: parsed.message });
          responded = true;
          client.destroy();
        }
      }, 5000);
      client.connect(BLENDER_PORT, BLENDER_HOST, () => {
        clearTimeout(connectionTimeout);
        client.write(JSON.stringify({ type: 'execute_code', params: { code } }));
      });
      client.on('data', (data) => {
        responseData = Buffer.concat([responseData, data]);
        try {
          const blenderResponse = JSON.parse(responseData.toString('utf8'));
          if (!responded) {
            res.json({ code, blenderResult: blenderResponse, message: parsed.message });
            responded = true;
            client.destroy();
          }
        } catch (e) {
          // Not a complete JSON yet, wait for more data
        }
      });
      client.on('error', (err) => {
        if (!responded) {
          clearTimeout(connectionTimeout);
          res.status(500).json({ error: 'Socket connection error', details: err, code, message: parsed.message });
          responded = true;
        }
      });
      client.on('close', () => {
        if (!responded && !res.headersSent) {
          res.status(504).json({ error: 'No response from Blender MCP', code, message: parsed.message });
          responded = true;
        }
      });
    } else {
      // For question or statement, just return the message
      res.json({ message: parsed.message });
    }
  } catch (err) {
    res.status(500).json({ error: 'LLM/Blender bridge error', details: err.message || String(err) });
  }
});

// POST /blender-mcp (pass-through to Blender MCP socket)
app.post('/blender-mcp', async (req, res) => {
  const { type, params } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing command type' });
  
  // If this is a code execution, sanitize the code first
  if (type === 'execute_code' && params && params.code) {
    const originalCode = params.code;
    try {
      // Fix any common syntax issues in the code
      let code = params.code;
      
      // Fix mathutils imports and references
      code = code.replace(/from bpy import mathutils/g, 'from mathutils import Vector, Matrix'); 
      code = code.replace(/bpy\.mathutils\.Vector/g, 'Vector');
      code = code.replace(/bpy\.mathutils/g, 'mathutils');
      
      // Fix missing division operators in numeric expressions
      code = code.replace(/(\d+)\s+(\d+)/g, '$1 / $2');
      
      // Fix missing/corrupted operators in variable assignments
      code = code.replace(/([a-zA-Z0-9_\.]+)\s+e_step/g, '$1 / 2\nangle_step');
      code = code.replace(/(\d+)\s+\*\s+([a-zA-Z0-9_\.]+)\s+res/g, '$1 * $2 / num_spheres');
      
      // Make sure it has the collection linking code to fix the visibility issue
      if ((code.includes('.primitive_') || code.includes('new(') || code.includes('.create(')) && 
          !code.includes('.objects.link(') && !code.includes('collection.objects.link')) {
        code += `

# Ensure all objects are in the main collection for visibility
main_collection = bpy.context.scene.collection.children.get("Collection")
if not main_collection:
    main_collection = bpy.context.scene.collection
    
# Link all objects that aren't already in a collection
for obj in bpy.context.scene.objects:
    if len(obj.users_collection) == 0:
        try:
            main_collection.objects.link(obj)
            print(f"Added {obj.name} to the main collection")
        except Exception as e:
            print(f"Could not add {obj.name} to collection: {e}")
`;
      }
      
      // Show differences in the log
      if (originalCode !== code) {
        console.log("Code was sanitized before execution");
        console.log("Original:", originalCode);
        console.log("Sanitized:", code);
      }
      
      // Update the params with the sanitized code
      params.code = code;
    } catch (err) {
      console.error("Error sanitizing code:", err);
      // Continue with original code if sanitizing fails
    }
  }
  
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

// Add global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Log to file if desired
  // Don't exit the process
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to file if desired
  // Don't exit the process
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`MCP client bridge listening on http://localhost:${PORT}`);
  console.log(`Server started at: ${new Date().toISOString()}`);
  console.log(`Blender MCP expected at: ${BLENDER_HOST}:${BLENDER_PORT}`);
});