# Azure Blender MCP Interface

This project provides a cloud-based interface for communicating with the Blender MCP (Model Context Protocol) server. It allows you to run Blender Python scripts remotely while keeping the Blender instance running on your local machine.

## Architecture

The system consists of three main components:

1. **Azure MCP Server** - A Node.js server deployed to Azure App Service
2. **Local MCP Bridge** - A local Node.js application that connects to both Azure and the local Blender MCP server
3. **Web UI** - A browser-based interface for sending commands to Blender

## Deployment Instructions

### A. Deploy the Azure MCP Server

1. **Create an Azure App Service**:

   ```bash
   # Login to Azure
   az login
   
   # Create a resource group if needed
   az group create --name blender-mcp-rg --location eastus
   
   # Create an App Service plan
   az appservice plan create --name blender-mcp-plan --resource-group blender-mcp-rg --sku B1 --is-linux
   
   # Create the web app
   az webapp create --name your-app-name --resource-group blender-mcp-rg --plan blender-mcp-plan --runtime "NODE|16-lts"
   ```

2. **Prepare the files for deployment**:

   Create a ZIP file containing:
   - `azure-mcp-server.js` (rename to server.js)
   - `azure-package.json` (rename to package.json)
   - `public/` directory with the UI files

3. **Deploy to Azure**:

   ```bash
   # Deploy the ZIP file
   az webapp deployment source config-zip --resource-group blender-mcp-rg --name your-app-name --src ./your-deployment.zip
   ```

4. **Configure the App Service**:

   Make sure the startup file is set to `server.js` in the Azure portal.

### B. Set Up the Local MCP Bridge

1. **Update the bridge configuration**:

   Edit `local-mcp-bridge.js` to use your actual Azure App Service URL:

   ```javascript
   const AZURE_WS_URL = process.env.AZURE_WS_URL || 'wss://your-app-name.azurewebsites.net';
   ```

2. **Install dependencies**:

   ```bash
   npm install ws net readline
   ```

3. **Run the local bridge**:

   ```bash
   node local-mcp-bridge.js
   ```

   This will create a WebSocket connection to your Azure App Service and maintain a connection to your local Blender MCP server.

### C. Configure Blender

1. **Install the Blender MCP addon** if not already installed
2. **Start Blender** and enable the MCP server (it should listen on port 1234 by default)
3. **Test the connection** from your Azure-hosted web interface

## Usage

1. **Access the web interface** at `https://your-app-name.azurewebsites.net`
2. **Ensure your local bridge is running** (you should see "Connected" status)
3. **Enter your API key** if required
4. **Write Blender Python code** and click "Execute" to run it on your local Blender instance

## Troubleshooting

### Connection Issues

- **Local Bridge Not Connected**: Ensure the local bridge is running and check its console for connection errors
- **Blender MCP Server Not Running**: Make sure Blender is open with the MCP addon enabled
- **WebSocket Connection Errors**: Check if your Azure App Service allows WebSocket connections (it should by default)

### API Key Issues

- If the API key isn't working, you may need to update it in both the Azure App Service and your local setup
- The API key is stored in a file named `.api-key` in the root directory of the Azure App Service

## Security Considerations

- The communication between Azure and your local machine uses WebSockets, which are encrypted if using HTTPS
- The local bridge does not require opening any incoming ports
- API key validation adds an additional layer of security

## Additional Features

- **Custom Scripts**: Save frequently used scripts as examples in the UI
- **Scene Information**: Quickly get information about your current Blender scene
- **Material Creation**: Create and apply materials with random properties

## Limitations

- The local Blender instance must remain running for the system to work
- Large file transfers (like textures or 3D models) may be slow over this connection
- Error handling for complex Blender operations may be limited

## License

This project is licensed under the MIT License - see the LICENSE file for details.
