param registryName string
param location string
param skuName string = 'Basic'
param tags object = {}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    adminUserEnabled: true
  }
}

var registryCredentials = listCredentials(registry.id, '2023-07-01')

output id string = registry.id
output loginServer string = registry.properties.loginServer
output password string = registryCredentials.passwords[0].value
output username string = registryCredentials.username

