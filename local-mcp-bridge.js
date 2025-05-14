// Local MCP Bridge - Connects Azure server to local Blender MCP
const WebSocket = require('ws');
const net = require('net');
const readline = require('readline');

// Configuration
const AZURE_WS_URL = process.env.AZURE_WS_URL || 'wss://your-app-name.azurewebsites.net';
const BLENDER_MCP_HOST = process.env.BLENDER_MCP_HOST || 'localhost';
const BLENDER_MCP_PORT = process.env.BLENDER_MCP_PORT || 1234;

// State variables
let azureWs = null;
let connectionId = null;
let reconnectTimeout = 1000; // Starting reconnect timeout (will increase with backoff)
let mcpClient = null;
let connected = false;
let pendingMcpRequests = new Map();

// Initialize connection to Azure WebSocket server
function connectToAzure() {
  console.log(`Connecting to Azure WebSocket server: ${AZURE_WS_URL}`);
  
  // Close any existing connection
  if (azureWs) {
    azureWs.terminate();
  }
  
  // Create a new WebSocket connection
  azureWs = new WebSocket(AZURE_WS_URL);
  
  // Handle connection open
  azureWs.on('open', () => {
    console.log('Connected to Azure MCP server');
    reconnectTimeout = 1000; // Reset reconnect timeout
  });
  
  // Handle incoming messages from Azure
  azureWs.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      // Handle different message types
      switch (message.type) {
        case 'connection_established':
          connectionId = message.connectionId;
          console.log(`Connection established with ID: ${connectionId}`);
          break;
          
        case 'mcp_command':
          if (!connected || !mcpClient) {
            // If not connected to Blender MCP, try to connect
            await connectToBlenderMcp();
            
            if (!connected || !mcpClient) {
              // If still not connected, send error response
              sendResponseToAzure({
                type: 'mcp_response',
                requestId: message.requestId,
                error: 'Failed to connect to Blender MCP server'
              });
              return;
            }
          }
          
          // Process the MCP command
          handleMcpCommand(message);
          break;
          
        default:
          console.log(`Received unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error('Error processing message from Azure:', err);
    }
  });
  
  // Handle connection close
  azureWs.on('close', () => {
    console.log('Disconnected from Azure MCP server');
    connectionId = null;
    
    // Reconnect with exponential backoff
    setTimeout(() => {
      reconnectTimeout = Math.min(reconnectTimeout * 1.5, 30000); // Max 30 seconds
      connectToAzure();
    }, reconnectTimeout);
  });
  
  // Handle errors
  azureWs.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

// Connect to local Blender MCP server
async function connectToBlenderMcp() {
  return new Promise((resolve) => {
    console.log(`Connecting to Blender MCP at ${BLENDER_MCP_HOST}:${BLENDER_MCP_PORT}...`);
    
    // Close any existing connection
    if (mcpClient) {
      mcpClient.destroy();
      mcpClient = null;
    }
    
    // Connect to the Blender MCP server
    mcpClient = new net.Socket();
    
    // Set up data handling
    let dataBuffer = '';
    
    mcpClient.on('data', (data) => {
      dataBuffer += data.toString();
      
      // Process complete JSON responses
      let endIndex;
      while ((endIndex = dataBuffer.indexOf('\\n')) !== -1) {
        const jsonStr = dataBuffer.substring(0, endIndex);
        dataBuffer = dataBuffer.substring(endIndex + 2);
        
        try {
          const response = JSON.parse(jsonStr);
          
          // Check if this is a response to a pending request
          const requestId = response.requestId;
          if (requestId && pendingMcpRequests.has(requestId)) {
            const azureRequestId = pendingMcpRequests.get(requestId);
            pendingMcpRequests.delete(requestId);
            
            // Send the response back to Azure
            sendResponseToAzure({
              type: 'mcp_response',
              requestId: azureRequestId,
              result: response.result
            });
          }
        } catch (err) {
          console.error('Error parsing MCP response:', err);
        }
      }
    });
    
    // Handle connection
    mcpClient.on('connect', () => {
      console.log('Connected to Blender MCP server');
      connected = true;
      resolve(true);
      
      // Send connection status to Azure
      sendResponseToAzure({
        type: 'status_update',
        status: 'connected',
        message: 'Connected to Blender MCP server'
      });
    });
    
    // Handle errors
    mcpClient.on('error', (err) => {
      console.error('Blender MCP connection error:', err);
      connected = false;
      resolve(false);
      
      // Send error status to Azure
      sendResponseToAzure({
        type: 'status_update',
        status: 'error',
        message: `Failed to connect to Blender MCP: ${err.message}`
      });
    });
    
    // Handle close
    mcpClient.on('close', () => {
      console.log('Disconnected from Blender MCP server');
      connected = false;
      
      // Send disconnected status to Azure
      sendResponseToAzure({
        type: 'status_update',
        status: 'disconnected',
        message: 'Disconnected from Blender MCP server'
      });
      
      // Try to reconnect after a short delay
      setTimeout(() => {
        connectToBlenderMcp();
      }, 5000);
    });
    
    // Connect to the server
    mcpClient.connect({
      host: BLENDER_MCP_HOST,
      port: BLENDER_MCP_PORT
    });
  });
}

// Send a response back to the Azure server
function sendResponseToAzure(message) {
  if (azureWs && azureWs.readyState === WebSocket.OPEN) {
    azureWs.send(JSON.stringify(message));
  }
}

// Handle MCP commands from Azure
async function handleMcpCommand(message) {
  const { command, params, requestId } = message;
  
  console.log(`Executing Blender MCP command: ${command}`);
  
  try {
    // Create a unique local request ID
    const mcpRequestId = `local_${Date.now()}`;
    
    // Store the mapping between MCP request ID and Azure request ID
    pendingMcpRequests.set(mcpRequestId, requestId);
    
    // Build the MCP command
    const mcpCommand = {
      jsonrpc: '2.0',
      method: command,
      params: params || {},
      id: mcpRequestId
    };
    
    // Send the command to the MCP server
    const commandStr = JSON.stringify(mcpCommand) + '\\n';
    mcpClient.write(commandStr);
    
    console.log(`Sent command to Blender MCP: ${command}`);
  } catch (err) {
    console.error(`Error executing command ${command}:`, err);
    
    // Send error response back to Azure
    sendResponseToAzure({
      type: 'mcp_response',
      requestId,
      error: `Failed to execute command: ${err.message}`
    });
  }
}

// Main function
async function main() {
  console.log('Starting Local MCP Bridge...');
  
  // Setup readline for command input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Connect to both servers
  connectToAzure();
  await connectToBlenderMcp();
  
  console.log('\nLocal MCP Bridge is running.');
  console.log('Type "exit" to quit, "status" to see connection status.');
  
  // Command line interface
  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();
    
    switch (command) {
      case 'exit':
        console.log('Shutting down...');
        if (azureWs) azureWs.close();
        if (mcpClient) mcpClient.destroy();
        process.exit(0);
        break;
        
      case 'status':
        console.log('\n--- Connection Status ---');
        console.log(`Azure: ${azureWs ? (azureWs.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected') : 'Not initialized'}`);
        console.log(`Blender MCP: ${connected ? 'Connected' : 'Disconnected'}`);
        console.log(`Connection ID: ${connectionId || 'Not assigned'}`);
        console.log('------------------------\n');
        break;
        
      case 'reconnect':
        console.log('Reconnecting to all services...');
        connectToAzure();
        await connectToBlenderMcp();
        break;
        
      default:
        if (command) {
          console.log('Unknown command. Available commands: exit, status, reconnect');
        }
    }
  });
}

// Start the application
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
