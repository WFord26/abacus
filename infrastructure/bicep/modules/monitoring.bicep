param workspaceName string
param applicationInsightsName string
param location string
param retentionInDays int = 30
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: retentionInDays
  }
  sku: {
    name: 'PerGB2018'
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output applicationInsightsConnectionString string = applicationInsights.properties.ConnectionString
output logAnalyticsCustomerId string = workspace.properties.customerId
output logAnalyticsSharedKey string = listKeys(workspace.id, '2023-09-01').primarySharedKey
output workspaceId string = workspace.id

