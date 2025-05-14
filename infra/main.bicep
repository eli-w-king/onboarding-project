// Azure Bicep template for deploying the Blender MCP Interface
// This file defines the infrastructure for hosting the MCP server on Azure

@description('The base name of the resources to create')
param baseName string = 'blender-mcp'

@description('The location for all resources')
param location string = resourceGroup().location

@description('The SKU name for the App Service Plan')
param appServicePlanSku string = 'B1'

// Generate a unique suffix for resource names
var uniqueSuffix = uniqueString(resourceGroup().id)
var appServiceName = '${baseName}-${uniqueSuffix}'
var appServicePlanName = '${baseName}-plan-${uniqueSuffix}'

// Define the App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true // Required for Linux
  }
}

// Define the App Service
resource appService 'Microsoft.Web/sites@2022-09-01' = {
  name: appServiceName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|16-lts'
      webSocketsEnabled: true // Enable WebSockets for the bridge connection
      appSettings: [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~16'
        }
      ]
    }
  }
}

// Output values
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
