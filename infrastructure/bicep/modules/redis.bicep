param redisName string
param location string
param tags object = {}

resource redis 'Microsoft.Cache/Redis@2023-08-01' = {
  name: redisName
  location: location
  tags: tags
  properties: {
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
  sku: {
    capacity: 0
    family: 'C'
    name: 'Basic'
  }
}

output hostName string = redis.properties.hostName
output primaryKey string = listKeys(redis.id, '2023-08-01').primaryKey
output sslPort int = redis.properties.sslPort

