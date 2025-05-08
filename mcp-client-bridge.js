// Minimal MCP client bridge for web UI: connects to Perplexity (LLM) and Blender MCP servers via STDIO, routes tool calls.
const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3002;

// MCP server configs (adjust as needed)
const LLM_CMD = 'npx';
const LLM_ARGS = ['-y', 'server-perplexity-ask'];
const LLM_ENV = { ...process.env, PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '' };

const BLENDER_CMD = 'uvx';
const BLENDER_ARGS = ['blender-mcp'];

// Start MCP servers as child processes
function startServer(cmd, args, env) {
  const proc = spawn(cmd, args, { env });
  proc.stdin.setEncoding('utf-8');
  proc.stdout.setEncoding('utf-8');
  proc.stderr.on('data', d => console.error(`[${cmd}]`, d.toString()));
  proc.on('exit', code => console.error(`[${cmd}] exited with code ${code}`));
  return proc;
}

const llmProc = startServer(LLM_CMD, LLM_ARGS, LLM_ENV);
const blenderProc = startServer(BLENDER_CMD, BLENDER_ARGS, process.env);

// JSON-RPC 2.0 helpers
function makeRpcRequest(id, method, params) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
}

function parseRpcResponse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Simple request/response queue for each server
function rpcCall(proc, method, params) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    let buffer = '';
    function onData(data) {
      buffer += data;
      // Try to parse complete JSON-RPC response
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const resp = parseRpcResponse(line);
        if (resp && resp.id === id) {
          proc.stdout.off('data', onData);
          if (resp.error) reject(resp.error);
          else resolve(resp.result);
        }
      }
    }
    proc.stdout.on('data', onData);
    proc.stdin.write(makeRpcRequest(id, method, params));
  });
}

// MCP tool call handler: routes tool calls from LLM to Blender MCP
async function handleToolCall(toolCall) {
  // toolCall: { method, params }
  return await rpcCall(blenderProc, toolCall.method, toolCall.params);
}

// Main chat endpoint
app.use(bodyParser.json());
app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  console.log('[/chat] Incoming request:', JSON.stringify(req.body, null, 2));
  if (!Array.isArray(messages)) {
    console.error('[/chat] Error: Missing messages array in request body:', req.body);
    return res.status(400).json({ error: 'Missing messages array' });
  }
  try {
    // Send chat to LLM MCP server
    console.log('[/chat] Sending messages to LLM:', JSON.stringify(messages, null, 2));
    const llmResponse = await rpcCall(llmProc, 'agent', { messages });
    console.log('[/chat] LLM response:', JSON.stringify(llmResponse, null, 2));
    // If LLM response includes tool calls, handle them
    if (llmResponse && llmResponse.tool_calls) {
      for (const toolCall of llmResponse.tool_calls) {
        console.log('[/chat] Handling tool call:', JSON.stringify(toolCall, null, 2));
        try {
          const toolResult = await handleToolCall(toolCall);
          console.log('[/chat] Tool call result:', JSON.stringify(toolResult, null, 2));
        } catch (toolErr) {
          console.error('[/chat] Tool call error:', toolErr);
        }
        // Optionally, send tool result back to LLM for further processing
        // (not shown here for brevity)
      }
    }
    res.json(llmResponse);
  } catch (err) {
    console.error('[/chat] Error:', err);
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`MCP client bridge listening on http://localhost:${PORT}`);
});
