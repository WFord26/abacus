param staticWebAppName string
param location string
param tags object = {}

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output defaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id

